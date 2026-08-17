import type {
  EarningsCall as PrismaEarningsCall,
  FiscalPeriod as PrismaFiscalPeriod,
  GuidanceChangeType as PrismaGuidanceChangeType,
  GuidanceMetric as PrismaGuidanceMetric,
  Prisma,
  SpeakerType as PrismaSpeakerType,
  TranscriptSectionType as PrismaTranscriptSectionType,
} from '@prisma/client';
import type { FinancialPeriodData } from '@erp/types';
import { db } from '@/lib/db';
import { ensureCompanyByTicker } from '@/lib/services/companyService';
import { CompanyNotFoundError, getFinancials } from '@/lib/services/financialDataService';
import { getFilingWithSections } from '@/lib/services/secFilingService';
import {
  getEarningsCallTranscriptFmp,
  ProviderNotConfiguredError,
  ProviderRequestError,
} from '@/lib/providers/fmp';
import { parseTranscript } from '@/lib/earnings/transcriptParsing';
import { searchTranscript, type TranscriptSearchResult } from '@/lib/earnings/search';
import {
  buildEarningsFinancialResults,
  findMatchingPeriod,
  findPriorQuarterPeriod,
  findPriorYearPeriod,
  type EarningsFinancialResults,
} from '@/lib/earnings/financialResults';
import { resolveGuidanceObservations, type GuidanceCandidate, type PriorGuidance } from '@/lib/earnings/guidance';
import { analyzeEarningsCall as runAiAnalysis } from '@/lib/ai/analyzeEarningsCall';
import { compareEarningsCalls as runAiComparison } from '@/lib/ai/compareEarningsCalls';
import { compareEarningsToFiling as runAiFilingComparison } from '@/lib/ai/compareEarningsToFiling';
import { AiNotConfiguredError, AiRequestError } from '@/lib/ai/anthropicClient';
import {
  EMPTY_BALANCE_SHEET,
  EMPTY_CASH_FLOW,
  EMPTY_INCOME_STATEMENT,
  fromBalanceSheetRow,
  fromCashFlowRow,
  fromIncomeStatementRow,
} from '@/lib/xbrl/persist';

/**
 * The orchestrator for Earnings Call Intelligence — mirrors
 * secFilingService.ts's role: the only module that decides *when* to hit
 * FMP/the LLM vs. read from Postgres. Every step of the pipeline (sync ->
 * fetch -> parse -> analyze -> compare -> search) is a separate,
 * independently-testable function imported from lib/earnings/ and lib/ai/ —
 * this file only sequences them and persists their output.
 *
 * FMP has no endpoint to list "which quarters exist" without a paid plan
 * this app's key doesn't have (see lib/providers/fmp.ts's doc comment), so
 * the call list is bootstrapped from Atlas's own already-ingested quarterly
 * FinancialPeriod data (Milestones 3/4) — a company that filed a 10-Q for a
 * quarter is assumed to have held a corresponding call. Each call's
 * transcript is then fetched independently and gracefully marked
 * UNAVAILABLE if the provider can't supply it, never fabricated.
 */

const PRISMA_PERIOD_TO_QUARTER: Partial<Record<PrismaFiscalPeriod, number>> = { Q1: 1, Q2: 2, Q3: 3, Q4: 4 };

export class EarningsCallNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EarningsCallNotFoundError';
  }
}

export class CompanyEarningsNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CompanyEarningsNotFoundError';
  }
}

// ---------------------------------------------------------------------------
// 1. Call list sync — quarterly FinancialPeriod rows -> EarningsCall stubs
// ---------------------------------------------------------------------------

async function syncCallsFromFinancialPeriods(companyId: string): Promise<void> {
  const quarterlyPeriods = await db.financialPeriod.findMany({
    where: { companyId, periodType: 'QUARTERLY' },
  });

  for (const period of quarterlyPeriods) {
    const fiscalQuarter = PRISMA_PERIOD_TO_QUARTER[period.fiscalPeriod];
    if (!fiscalQuarter) continue;

    await db.earningsCall.upsert({
      where: { companyId_fiscalYear_fiscalQuarter: { companyId, fiscalYear: period.fiscalYear, fiscalQuarter } },
      create: {
        companyId,
        fiscalYear: period.fiscalYear,
        fiscalQuarter,
        periodEndDate: period.periodEnd,
        provider: 'fmp',
      },
      update: { periodEndDate: period.periodEnd },
    });
  }
}

/** Returns a company's earnings-call history, ensuring quarterly financial
 * data (and therefore the derived call list) is synced first. Throws
 * CompanyEarningsNotFoundError if SEC has no filer for the ticker, or if the
 * company genuinely has no quarterly filings yet to derive calls from. */
export async function listEarningsCalls(rawTicker: string): Promise<PrismaEarningsCall[]> {
  const ticker = rawTicker.trim().toUpperCase();

  try {
    await getFinancials(ticker, 'quarterly');
  } catch (error) {
    if (error instanceof CompanyNotFoundError) {
      throw new CompanyEarningsNotFoundError(`SEC EDGAR has no filer registered for ticker "${ticker}".`);
    }
    throw error;
  }

  const company = await ensureCompanyByTicker(ticker);
  await syncCallsFromFinancialPeriods(company.id);

  const calls = await db.earningsCall.findMany({
    where: { companyId: company.id },
    orderBy: [{ fiscalYear: 'desc' }, { fiscalQuarter: 'desc' }],
  });

  if (calls.length === 0) {
    throw new CompanyEarningsNotFoundError(
      `No quarterly filing history found for ticker "${ticker}" yet — earnings calls can't be listed until at least one quarterly filing has been ingested.`,
    );
  }

  return calls;
}

// ---------------------------------------------------------------------------
// 2. Call processing — transcript retrieval -> parsing -> TranscriptSegment rows
// ---------------------------------------------------------------------------

function segmentCreateData(segment: ReturnType<typeof parseTranscript>[number]) {
  return {
    section: segment.section as PrismaTranscriptSectionType,
    orderIndex: segment.orderIndex,
    speakerName: segment.speakerName,
    speakerRole: segment.speakerRole,
    speakerType: segment.speakerType as PrismaSpeakerType,
    text: segment.text,
    anchor: segment.anchor,
  };
}

/**
 * Runs the fetch -> parse pipeline for one call and persists the results.
 * Never throws for a processing outcome — a provider-restricted or
 * genuinely-missing transcript is recorded as UNAVAILABLE (not an error the
 * caller must handle), and an unexpected failure is recorded as FAILED, so
 * the call's metadata always remains visible either way. Only throws for a
 * genuinely invalid earningsCallId.
 */
export async function processCall(earningsCallId: string): Promise<PrismaEarningsCall> {
  const call = await db.earningsCall.findUnique({ where: { id: earningsCallId } });
  if (!call) throw new EarningsCallNotFoundError(`No earnings call found for id "${earningsCallId}".`);
  if (call.processingStatus === 'COMPLETE') return call;

  const company = await db.company.findUniqueOrThrow({ where: { id: call.companyId } });

  await db.earningsCall.update({
    where: { id: earningsCallId },
    data: { processingStatus: 'FETCHING', processingError: null },
  });

  try {
    const transcript = await getEarningsCallTranscriptFmp(company.ticker, call.fiscalYear, call.fiscalQuarter);

    if (!transcript) {
      await db.earningsCall.update({
        where: { id: earningsCallId },
        data: {
          processingStatus: 'UNAVAILABLE',
          processingError: 'No transcript is available from the data provider for this quarter.',
        },
      });
      return db.earningsCall.findUniqueOrThrow({ where: { id: earningsCallId } });
    }

    await db.earningsCall.update({ where: { id: earningsCallId }, data: { processingStatus: 'PARSING' } });
    const segments = parseTranscript(transcript.content);

    await db.$transaction(async (tx) => {
      const existing = await tx.transcript.findUnique({ where: { earningsCallId } });
      const transcriptRow = existing
        ? await tx.transcript.update({
            where: { id: existing.id },
            data: { rawContent: transcript.content, provider: 'fmp', retrievedAt: new Date() },
          })
        : await tx.transcript.create({
            data: { earningsCallId, provider: 'fmp', rawContent: transcript.content },
          });

      await tx.transcriptSegment.deleteMany({ where: { transcriptId: transcriptRow.id } });
      if (segments.length > 0) {
        await tx.transcriptSegment.createMany({
          data: segments.map((s) => ({ transcriptId: transcriptRow.id, ...segmentCreateData(s) })),
        });
      }

      await tx.earningsCall.update({
        where: { id: earningsCallId },
        data: {
          processingStatus: 'COMPLETE',
          processingError: null,
          callDate: transcript.callDate ? new Date(transcript.callDate) : call.callDate,
        },
      });
    });
  } catch (error) {
    const isUnavailable =
      error instanceof ProviderNotConfiguredError ||
      (error instanceof ProviderRequestError && (error.status === 402 || error.status === 403));

    if (isUnavailable) {
      await db.earningsCall.update({
        where: { id: earningsCallId },
        data: {
          processingStatus: 'UNAVAILABLE',
          processingError: 'Transcript access requires a higher-tier data-provider subscription.',
        },
      });
    } else {
      const message = error instanceof Error ? error.message : 'Unknown error processing earnings call';
      await db.earningsCall.update({
        where: { id: earningsCallId },
        data: { processingStatus: 'FAILED', processingError: message },
      });
    }
  }

  return db.earningsCall.findUniqueOrThrow({ where: { id: earningsCallId } });
}

export interface TranscriptSegmentRow {
  id: string;
  section: PrismaTranscriptSectionType;
  orderIndex: number;
  speakerName: string | null;
  speakerRole: string | null;
  speakerType: PrismaSpeakerType;
  text: string;
  anchor: string;
}

export interface EarningsCallWithSegments {
  call: PrismaEarningsCall;
  segments: TranscriptSegmentRow[];
}

/** Returns a call with its transcript segments, processing it first if that
 * hasn't happened yet (PENDING). */
export async function getCallWithSegments(earningsCallId: string): Promise<EarningsCallWithSegments> {
  let call = await db.earningsCall.findUnique({ where: { id: earningsCallId } });
  if (!call) throw new EarningsCallNotFoundError(`No earnings call found for id "${earningsCallId}".`);

  if (call.processingStatus === 'PENDING') {
    call = await processCall(earningsCallId);
  }

  const transcript = await db.transcript.findUnique({ where: { earningsCallId } });
  const segments = transcript
    ? await db.transcriptSegment.findMany({ where: { transcriptId: transcript.id }, orderBy: { orderIndex: 'asc' } })
    : [];

  return { call, segments };
}

function mapSegmentForAi(segment: TranscriptSegmentRow) {
  return {
    section: segment.section,
    speakerName: segment.speakerName,
    speakerRole: segment.speakerRole,
    speakerType: segment.speakerType,
    text: segment.text,
    anchor: segment.anchor,
  };
}

function findAnchorForExcerpt(segments: TranscriptSegmentRow[], excerpt: string): string | null {
  const normalized = excerpt.trim().toLowerCase();
  if (normalized.length === 0) return null;
  const match = segments.find((s) => s.text.toLowerCase().includes(normalized));
  return match?.anchor ?? null;
}

// ---------------------------------------------------------------------------
// 3. Financial results — deterministic, reused as both an API response and
//    AI-prompt context (Milestones 3/4 data; never computed by the LLM).
// ---------------------------------------------------------------------------

type FinancialPeriodRow = Prisma.FinancialPeriodGetPayload<{
  include: { incomeStatement: true; balanceSheet: true; cashFlowStatement: true };
}>;

function toFinancialPeriodData(row: FinancialPeriodRow): FinancialPeriodData {
  return {
    fiscalYear: row.fiscalYear,
    fiscalPeriod: row.fiscalPeriod,
    periodType: row.periodType === 'QUARTERLY' ? 'quarterly' : 'annual',
    periodStart: row.periodStart ? row.periodStart.toISOString() : null,
    periodEnd: row.periodEnd.toISOString(),
    filingType: row.filingType,
    filingDate: row.filingDate ? row.filingDate.toISOString() : null,
    incomeStatement: row.incomeStatement ? fromIncomeStatementRow(row.incomeStatement) : EMPTY_INCOME_STATEMENT,
    balanceSheet: row.balanceSheet ? fromBalanceSheetRow(row.balanceSheet) : EMPTY_BALANCE_SHEET,
    cashFlow: row.cashFlowStatement ? fromCashFlowRow(row.cashFlowStatement) : EMPTY_CASH_FLOW,
  };
}

async function getQuarterlyPeriods(companyId: string): Promise<FinancialPeriodData[]> {
  const rows = await db.financialPeriod.findMany({
    where: { companyId, periodType: 'QUARTERLY' },
    include: { incomeStatement: true, balanceSheet: true, cashFlowStatement: true },
  });
  return rows.map(toFinancialPeriodData);
}

export async function getEarningsFinancialResults(call: PrismaEarningsCall): Promise<EarningsFinancialResults> {
  const periods = await getQuarterlyPeriods(call.companyId);
  const current = findMatchingPeriod(periods, call.fiscalYear, call.fiscalQuarter);
  const priorQuarter = findPriorQuarterPeriod(periods, call.fiscalYear, call.fiscalQuarter);
  const priorYear = findPriorYearPeriod(periods, call.fiscalYear, call.fiscalQuarter);
  return buildEarningsFinancialResults(current, priorQuarter, priorYear);
}

function formatMoney(value: number | null): string {
  if (value === null) return 'unavailable';
  return `$${(value / 1e9).toFixed(2)}B`;
}
function formatChange(value: number | null, kind: 'growth' | 'points'): string {
  if (value === null) return 'unavailable';
  return kind === 'points' ? `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}pp` : `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;
}

function buildFinancialContextText(results: EarningsFinancialResults): string {
  if (!results.periodFound) {
    return 'Financial statement data for this exact quarter has not yet been ingested from SEC filings.';
  }
  return results.metrics
    .map((m) => `${m.label}: ${formatMoney(m.actual)} (QoQ ${formatChange(m.qoqChange, m.changeKind)}, YoY ${formatChange(m.yoyChange, m.changeKind)})`)
    .join('\n');
}

// ---------------------------------------------------------------------------
// 4. AI analysis + deterministic guidance resolution — cache-first
// ---------------------------------------------------------------------------

export async function findPreviousEarningsCall(call: PrismaEarningsCall): Promise<PrismaEarningsCall | null> {
  const [priorYear, priorQuarter] =
    call.fiscalQuarter === 1 ? [call.fiscalYear - 1, 4] : [call.fiscalYear, call.fiscalQuarter - 1];
  return db.earningsCall.findUnique({
    where: { companyId_fiscalYear_fiscalQuarter: { companyId: call.companyId, fiscalYear: priorYear, fiscalQuarter: priorQuarter } },
  });
}

export interface AnalyzeCallOptions {
  regenerate?: boolean;
}

/** Returns the call's stored analysis, generating one only if none exists
 * yet or `regenerate` is explicitly true. A failed generation is itself
 * cached (status FAILED) so a persistent failure doesn't retry on every page
 * view — the user must explicitly regenerate to retry. */
export async function getOrCreateEarningsAnalysis(earningsCallId: string, options: AnalyzeCallOptions = {}) {
  const existing = await db.earningsAnalysis.findUnique({ where: { earningsCallId } });
  if (existing && !options.regenerate) return existing;

  const { call, segments } = await getCallWithSegments(earningsCallId);
  if (call.processingStatus !== 'COMPLETE' || segments.length === 0) {
    throw new EarningsCallNotFoundError('This earnings call has no processed transcript to analyze yet.');
  }

  const company = await db.company.findUniqueOrThrow({ where: { id: call.companyId } });
  const financialResults = await getEarningsFinancialResults(call);
  const financialContext = buildFinancialContextText(financialResults);

  const previousCall = await findPreviousEarningsCall(call);
  const priorGuidanceRows = previousCall
    ? await db.guidanceObservation.findMany({ where: { earningsCallId: previousCall.id } })
    : [];
  const priorGuidance: PriorGuidance[] = priorGuidanceRows.map((g) => ({
    metric: g.metric,
    period: g.period,
    low: g.low,
    high: g.high,
    midpoint: g.midpoint,
  }));

  try {
    const result = await runAiAnalysis({
      companyName: company.name,
      fiscalYear: call.fiscalYear,
      fiscalQuarter: call.fiscalQuarter,
      callDate: call.callDate ? call.callDate.toISOString().slice(0, 10) : null,
      segments: segments.map(mapSegmentForAi),
      financialContext,
    });

    const guidanceCandidates: GuidanceCandidate[] = result.payload.guidance_observations.map((g) => ({
      metric: g.metric,
      metricLabel: g.metric_label,
      period: g.period,
      low: g.low,
      high: g.high,
      sourceExcerpt: g.source.excerpt,
      sourceAnchor: findAnchorForExcerpt(segments, g.source.excerpt),
    }));
    const resolvedGuidance = resolveGuidanceObservations(guidanceCandidates, priorGuidance);

    return await db.$transaction(async (tx) => {
      await tx.guidanceObservation.deleteMany({ where: { earningsCallId } });
      if (resolvedGuidance.length > 0) {
        await tx.guidanceObservation.createMany({
          data: resolvedGuidance.map((g) => ({
            earningsCallId,
            metric: g.metric as PrismaGuidanceMetric,
            metricLabel: g.metricLabel,
            period: g.period,
            low: g.low,
            high: g.high,
            midpoint: g.midpoint,
            priorLow: g.priorLow,
            priorHigh: g.priorHigh,
            priorMidpoint: g.priorMidpoint,
            change: g.change as PrismaGuidanceChangeType,
            sourceExcerpt: g.sourceExcerpt,
            sourceAnchor: g.sourceAnchor,
          })),
        });
      }

      return tx.earningsAnalysis.upsert({
        where: { earningsCallId },
        create: {
          earningsCallId,
          status: 'SUCCESS',
          model: result.model,
          summary: result.payload.summary,
          businessTrends: result.payload.business_trends,
          managementCommentary: result.payload.management_commentary,
          risks: result.payload.risks,
          capitalAllocation: result.payload.capital_allocation,
          analystTopics: result.payload.analyst_topics,
          managementLanguage: result.payload.management_language,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        },
        update: {
          status: 'SUCCESS',
          model: result.model,
          error: null,
          summary: result.payload.summary,
          businessTrends: result.payload.business_trends,
          managementCommentary: result.payload.management_commentary,
          risks: result.payload.risks,
          capitalAllocation: result.payload.capital_allocation,
          analystTopics: result.payload.analyst_topics,
          managementLanguage: result.payload.management_language,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        },
      });
    });
  } catch (error) {
    if (!(error instanceof AiNotConfiguredError) && !(error instanceof AiRequestError)) throw error;

    const message = error.message;
    return db.earningsAnalysis.upsert({
      where: { earningsCallId },
      create: {
        earningsCallId,
        status: 'FAILED',
        model: 'none',
        error: message,
        summary: '',
        businessTrends: [],
        managementCommentary: [],
        risks: [],
        capitalAllocation: [],
        analystTopics: [],
        managementLanguage: [],
      },
      update: { status: 'FAILED', error: message },
    });
  }
}

// ---------------------------------------------------------------------------
// 5. Comparison with the previous quarter's call
// ---------------------------------------------------------------------------

export interface CompareCallsOptions {
  regenerate?: boolean;
}

export async function getOrCreateEarningsComparison(
  earningsCallId: string,
  previousEarningsCallId: string,
  options: CompareCallsOptions = {},
) {
  const existing = await db.earningsComparison.findUnique({
    where: { earningsCallId_previousEarningsCallId: { earningsCallId, previousEarningsCallId } },
  });
  if (existing && !options.regenerate) return existing;

  const current = await getCallWithSegments(earningsCallId);
  const prior = await getCallWithSegments(previousEarningsCallId);
  if (current.call.companyId !== prior.call.companyId) {
    throw new EarningsCallNotFoundError('Cannot compare calls from two different companies.');
  }

  const company = await db.company.findUniqueOrThrow({ where: { id: current.call.companyId } });

  const financialResults = await getEarningsFinancialResults(current.call);
  const financialChanges = financialResults.metrics as unknown as Prisma.InputJsonValue;

  const currentGuidance = await db.guidanceObservation.findMany({ where: { earningsCallId } });
  const guidanceSummary = currentGuidance.map((g) => ({
    metric: g.metric,
    metricLabel: g.metricLabel,
    period: g.period,
    midpoint: g.midpoint,
    priorMidpoint: g.priorMidpoint,
    change: g.change,
  })) as unknown as Prisma.InputJsonValue;

  try {
    const result = await runAiComparison({
      companyName: company.name,
      currentFiscalYear: current.call.fiscalYear,
      currentFiscalQuarter: current.call.fiscalQuarter,
      priorFiscalYear: prior.call.fiscalYear,
      priorFiscalQuarter: prior.call.fiscalQuarter,
      currentSegments: current.segments.map(mapSegmentForAi),
      priorSegments: prior.segments.map(mapSegmentForAi),
    });

    return await db.earningsComparison.upsert({
      where: { earningsCallId_previousEarningsCallId: { earningsCallId, previousEarningsCallId } },
      create: {
        earningsCallId,
        previousEarningsCallId,
        status: 'SUCCESS',
        model: result.model,
        financialChanges,
        guidanceSummary,
        languageChanges: result.payload.language_changes,
        toneComparison: result.payload.tone_comparison,
      },
      update: {
        status: 'SUCCESS',
        model: result.model,
        error: null,
        financialChanges,
        guidanceSummary,
        languageChanges: result.payload.language_changes,
        toneComparison: result.payload.tone_comparison,
      },
    });
  } catch (error) {
    if (!(error instanceof AiNotConfiguredError) && !(error instanceof AiRequestError)) throw error;

    const message = error.message;
    return db.earningsComparison.upsert({
      where: { earningsCallId_previousEarningsCallId: { earningsCallId, previousEarningsCallId } },
      create: {
        earningsCallId,
        previousEarningsCallId,
        status: 'FAILED',
        model: 'none',
        error: message,
        financialChanges,
        guidanceSummary,
        languageChanges: [],
        toneComparison: [],
      },
      update: { status: 'FAILED', error: message, financialChanges, guidanceSummary },
    });
  }
}

// ---------------------------------------------------------------------------
// 6. Cross-source comparison: earnings call vs SEC filing
// ---------------------------------------------------------------------------

/** Finds the SEC filing (10-Q/10-K) whose period best matches this call's
 * fiscal period — the default cross-source comparison target. */
export async function findMatchingSecFiling(companyId: string, call: PrismaEarningsCall) {
  if (!call.periodEndDate) return null;

  const exact = await db.secFiling.findFirst({
    where: { companyId, filingType: { in: ['TEN_Q', 'TEN_K'] }, periodEnd: call.periodEndDate },
    orderBy: { filingDate: 'desc' },
  });
  if (exact) return exact;

  return db.secFiling.findFirst({
    where: { companyId, filingType: { in: ['TEN_Q', 'TEN_K'] }, periodEnd: { lte: call.periodEndDate } },
    orderBy: { periodEnd: 'desc' },
  });
}

export async function getOrCreateEarningsFilingComparison(
  earningsCallId: string,
  secFilingId: string,
  options: CompareCallsOptions = {},
) {
  const existing = await db.earningsFilingComparison.findUnique({
    where: { earningsCallId_secFilingId: { earningsCallId, secFilingId } },
  });
  if (existing && !options.regenerate) return existing;

  const { call, segments } = await getCallWithSegments(earningsCallId);
  const company = await db.company.findUniqueOrThrow({ where: { id: call.companyId } });
  const { filing, sections } = await getFilingWithSections(secFilingId);
  if (filing.companyId !== call.companyId) {
    throw new EarningsCallNotFoundError('Cannot compare an earnings call against a filing from a different company.');
  }

  try {
    const result = await runAiFilingComparison({
      companyName: company.name,
      fiscalYear: call.fiscalYear,
      fiscalQuarter: call.fiscalQuarter,
      callSegments: segments.map(mapSegmentForAi),
      filingFormType: filing.formType,
      filingSections: sections.map((s) => ({ sectionType: s.sectionType, title: s.title, content: s.content })),
    });

    return await db.earningsFilingComparison.upsert({
      where: { earningsCallId_secFilingId: { earningsCallId, secFilingId } },
      create: {
        earningsCallId,
        secFilingId,
        status: 'SUCCESS',
        model: result.model,
        alignments: result.payload.alignments,
        newInCall: result.payload.new_in_call,
        onlyInFiling: result.payload.only_in_filing,
        riskEmphasisDifferences: result.payload.risk_emphasis_differences,
        guidanceDifferences: result.payload.guidance_differences,
      },
      update: {
        status: 'SUCCESS',
        model: result.model,
        error: null,
        alignments: result.payload.alignments,
        newInCall: result.payload.new_in_call,
        onlyInFiling: result.payload.only_in_filing,
        riskEmphasisDifferences: result.payload.risk_emphasis_differences,
        guidanceDifferences: result.payload.guidance_differences,
      },
    });
  } catch (error) {
    if (!(error instanceof AiNotConfiguredError) && !(error instanceof AiRequestError)) throw error;

    const message = error.message;
    return db.earningsFilingComparison.upsert({
      where: { earningsCallId_secFilingId: { earningsCallId, secFilingId } },
      create: {
        earningsCallId,
        secFilingId,
        status: 'FAILED',
        model: 'none',
        error: message,
        alignments: [],
        newInCall: [],
        onlyInFiling: [],
        riskEmphasisDifferences: [],
        guidanceDifferences: [],
      },
      update: { status: 'FAILED', error: message },
    });
  }
}

// ---------------------------------------------------------------------------
// 7. Search
// ---------------------------------------------------------------------------

export async function searchCall(earningsCallId: string, query: string): Promise<TranscriptSearchResult[]> {
  const transcript = await db.transcript.findUnique({ where: { earningsCallId } });
  if (!transcript) return [];

  const segments = await db.transcriptSegment.findMany({
    where: { transcriptId: transcript.id },
    orderBy: { orderIndex: 'asc' },
  });

  return searchTranscript(
    segments.map((s) => ({ section: s.section, speakerName: s.speakerName, anchor: s.anchor, text: s.text })),
    query,
  );
}

// ---------------------------------------------------------------------------
// 8. Read-only lookups for Server Components — never generate, just read
//    whatever's already stored, so a page load is always free.
// ---------------------------------------------------------------------------

export async function getExistingAnalysis(earningsCallId: string) {
  return db.earningsAnalysis.findUnique({ where: { earningsCallId } });
}

export async function getExistingComparison(earningsCallId: string, previousEarningsCallId: string) {
  return db.earningsComparison.findUnique({
    where: { earningsCallId_previousEarningsCallId: { earningsCallId, previousEarningsCallId } },
  });
}

export async function getExistingFilingComparison(earningsCallId: string, secFilingId: string) {
  return db.earningsFilingComparison.findUnique({
    where: { earningsCallId_secFilingId: { earningsCallId, secFilingId } },
  });
}

export async function getGuidanceObservations(earningsCallId: string) {
  return db.guidanceObservation.findMany({ where: { earningsCallId }, orderBy: { createdAt: 'asc' } });
}
