import type {
  AnalysisStatus as PrismaAnalysisStatus,
  FilingProcessingStatus as PrismaFilingProcessingStatus,
  FilingSectionType as PrismaFilingSectionType,
  Prisma,
  SecFiling as PrismaSecFiling,
  SecFilingType as PrismaSecFilingType,
} from '@prisma/client';
import { db } from '@/lib/db';
import { ensureCompanyByTicker } from '@/lib/services/companyService';
import { buildFilingUrl, getFilingDocument, getSubmissions, resolveCik, SecNotFoundError } from '@/lib/providers/secEdgar';
import { classifyFormType, type SecFilingTypeValue } from '@/lib/sec/types';
import { extractTextBlocks } from '@/lib/sec/htmlExtraction';
import { extractEightKSections, extractTenKSections, extractTenQSections, type ExtractedSection } from '@/lib/sec/sectionExtraction';
import { cleanSectionText } from '@/lib/sec/textCleaning';
import { searchSections, type FilingSearchResult } from '@/lib/sec/search';
import { computeFinancialChanges, type FinancialSnapshot } from '@/lib/sec/financialChanges';
import { growthRate, operatingMargin, totalDebt as sumTotalDebt } from '@/lib/analytics/ratios';
import { analyzeFiling as runAiAnalysis } from '@/lib/ai/analyzeFiling';
import { compareFilings as runAiComparison } from '@/lib/ai/compareFilings';
import { AiNotConfiguredError, AiRequestError } from '@/lib/ai/anthropicClient';

/**
 * The orchestrator for SEC Filing Intelligence — mirrors
 * financialDataService.ts's role: the only module that decides *when* to
 * hit SEC/the LLM vs. read from Postgres. Every step of the pipeline
 * (fetch -> extract -> section -> clean -> analyze -> compare -> search) is
 * a separate, independently-testable function imported from lib/sec/ and
 * lib/ai/ — this file only sequences them and persists their output.
 */

// Filing metadata changes rarely (a company doesn't refile); a long TTL
// avoids re-hitting SEC's submissions endpoint on every page view.
const FILING_LIST_TTL_MS = 6 * 60 * 60 * 1000;
const SUPPORTED_FORM_TYPES: SecFilingTypeValue[] = ['TEN_K', 'TEN_Q', 'EIGHT_K', 'DEF_14A', 'TWENTY_F'];
const MAX_SYNCED_FILINGS = 60;

export class FilingNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FilingNotFoundError';
  }
}

export class CompanyFilingsNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CompanyFilingsNotFoundError';
  }
}

// ---------------------------------------------------------------------------
// 1. Filing list sync — SEC submissions -> SecFiling metadata rows
// ---------------------------------------------------------------------------

async function syncFilingsFromSec(companyId: string, ticker: string): Promise<void> {
  const identity = await resolveCik(ticker);
  if (!identity) {
    throw new CompanyFilingsNotFoundError(`SEC EDGAR has no filer registered for ticker "${ticker}".`);
  }

  await db.company.update({ where: { id: companyId }, data: { cik: identity.cik } });

  const submissions = await getSubmissions(identity.cik);
  const supported = submissions.filings
    .filter((entry) => SUPPORTED_FORM_TYPES.includes(classifyFormType(entry.form)))
    .slice(0, MAX_SYNCED_FILINGS);

  for (const entry of supported) {
    const filingType = classifyFormType(entry.form) as PrismaSecFilingType;
    const secUrl = buildFilingUrl(identity.cik, entry.accessionNumber, entry.primaryDocument);

    await db.secFiling.upsert({
      where: { companyId_accessionNumber: { companyId, accessionNumber: entry.accessionNumber } },
      create: {
        companyId,
        filingType,
        formType: entry.form,
        filingDate: new Date(entry.filingDate),
        periodEnd: entry.reportDate ? new Date(entry.reportDate) : null,
        accessionNumber: entry.accessionNumber,
        primaryDocument: entry.primaryDocument,
        secUrl,
        description: entry.primaryDocDescription,
        items: entry.items,
      },
      // Metadata can legitimately change (e.g. an amended primary document) —
      // update it, but never touch processingStatus/sections here, so a
      // resync never discards already-processed content.
      update: {
        formType: entry.form,
        filingDate: new Date(entry.filingDate),
        periodEnd: entry.reportDate ? new Date(entry.reportDate) : null,
        primaryDocument: entry.primaryDocument,
        secUrl,
        description: entry.primaryDocDescription,
        items: entry.items,
      },
    });
  }
}

export interface FilingListFilters {
  filingType?: SecFilingTypeValue;
  from?: Date;
  to?: Date;
}

/** Returns a company's filing history, syncing from SEC first if the local
 * copy is stale or missing. Throws CompanyFilingsNotFoundError if SEC has no
 * filer for the ticker at all. */
export async function listFilings(rawTicker: string, filters: FilingListFilters = {}): Promise<PrismaSecFiling[]> {
  const ticker = rawTicker.trim().toUpperCase();
  const company = await ensureCompanyByTicker(ticker);

  const mostRecentSync = await db.secFiling.findFirst({
    where: { companyId: company.id },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  const isFresh = Boolean(mostRecentSync && Date.now() - mostRecentSync.createdAt.getTime() < FILING_LIST_TTL_MS);

  if (!isFresh) {
    await syncFilingsFromSec(company.id, ticker);
  }

  const where: Prisma.SecFilingWhereInput = { companyId: company.id };
  if (filters.filingType) where.filingType = filters.filingType as PrismaSecFilingType;
  if (filters.from || filters.to) {
    where.filingDate = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    };
  }

  return db.secFiling.findMany({ where, orderBy: { filingDate: 'desc' } });
}

// ---------------------------------------------------------------------------
// 2. Filing processing — document retrieval -> extraction -> sectioning -> cleaning
// ---------------------------------------------------------------------------

function extractSectionsFor(filingType: PrismaSecFilingType, html: string): ExtractedSection[] {
  const blocks = extractTextBlocks(html);
  switch (filingType) {
    case 'TEN_K':
      return extractTenKSections(blocks);
    case 'TEN_Q':
      return extractTenQSections(blocks);
    case 'EIGHT_K':
      return extractEightKSections(blocks);
    default:
      return []; // DEF 14A / 20-F / OTHER: metadata + source link only for now — see README known limitations
  }
}

function anchorFor(section: ExtractedSection, index: number): string {
  const base = section.itemCode
    ? `item-${section.itemCode}`
    : section.sectionType.toLowerCase().replace(/_/g, '-');
  return `${base}-${index}`;
}

/**
 * Runs the fetch -> extract -> section -> clean pipeline for one filing and
 * persists the results. Never throws for a processing failure (parsing
 * failure, unsupported format, SEC rate limit, etc.) — it records
 * FAILED + the error message on the filing itself, so the original SEC
 * filing (metadata + source link) always remains accessible even when
 * processing didn't succeed. Only throws for a genuinely invalid filingId.
 */
export async function processFiling(filingId: string): Promise<PrismaSecFiling> {
  const filing = await db.secFiling.findUnique({ where: { id: filingId } });
  if (!filing) throw new FilingNotFoundError(`No filing found for id "${filingId}".`);

  if (filing.processingStatus === 'COMPLETE') return filing;

  await db.secFiling.update({ where: { id: filingId }, data: { processingStatus: 'FETCHING' as PrismaFilingProcessingStatus, processingError: null } });

  try {
    const html = await getFilingDocument(filing.secUrl);

    await db.secFiling.update({ where: { id: filingId }, data: { processingStatus: 'EXTRACTING' as PrismaFilingProcessingStatus } });
    const rawSections = extractSectionsFor(filing.filingType, html);

    await db.$transaction(async (tx) => {
      await tx.filingSection.deleteMany({ where: { filingId } });

      if (rawSections.length > 0) {
        await tx.filingSection.createMany({
          data: rawSections.map((section, index) => {
            const content = cleanSectionText(section.content);
            return {
              filingId,
              sectionType: section.sectionType as PrismaFilingSectionType,
              title: section.title,
              itemCode: section.itemCode,
              orderIndex: index,
              anchor: anchorFor(section, index),
              content,
              charCount: content.length,
            };
          }),
        });
      }

      await tx.secFiling.update({
        where: { id: filingId },
        data: { processingStatus: 'COMPLETE' as PrismaFilingProcessingStatus, processingError: null },
      });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error processing filing';
    await db.secFiling.update({
      where: { id: filingId },
      data: { processingStatus: 'FAILED' as PrismaFilingProcessingStatus, processingError: message },
    });
  }

  return db.secFiling.findUniqueOrThrow({ where: { id: filingId } });
}

export interface FilingWithSections {
  filing: PrismaSecFiling;
  sections: Array<{
    id: string;
    sectionType: PrismaFilingSectionType;
    title: string;
    itemCode: string | null;
    anchor: string;
    content: string;
    charCount: number;
  }>;
}

/** Returns a filing with its sections, processing it first if that hasn't
 * happened yet (PENDING) or previously failed and is being retried. */
export async function getFilingWithSections(filingId: string): Promise<FilingWithSections> {
  let filing = await db.secFiling.findUnique({ where: { id: filingId } });
  if (!filing) throw new FilingNotFoundError(`No filing found for id "${filingId}".`);

  if (filing.processingStatus === 'PENDING') {
    filing = await processFiling(filingId);
  }

  const sections = await db.filingSection.findMany({ where: { filingId }, orderBy: { orderIndex: 'asc' } });
  return { filing, sections };
}

// ---------------------------------------------------------------------------
// 3. Financial context — deterministic figures from Milestone 3/4 data,
//    used both as AI analysis context and as the comparison's financial-
//    changes block. Never computed by the LLM.
// ---------------------------------------------------------------------------

type FinancialPeriodWithStatements = Prisma.FinancialPeriodGetPayload<{
  include: { incomeStatement: true; balanceSheet: true; cashFlowStatement: true };
}>;

async function findMatchingFinancialPeriod(
  companyId: string,
  filing: PrismaSecFiling,
): Promise<FinancialPeriodWithStatements | null> {
  if (!filing.periodEnd) return null;
  const periodType = filing.filingType === 'TEN_Q' ? 'QUARTERLY' : 'ANNUAL';
  const include = { incomeStatement: true, balanceSheet: true, cashFlowStatement: true } as const;

  const exact = await db.financialPeriod.findFirst({ where: { companyId, periodType, periodEnd: filing.periodEnd }, include });
  if (exact) return exact;

  // Best-effort fallback for a near-miss date (e.g. SEC's reportDate vs. the
  // XBRL fact's own period-end differing by a day in rare cases).
  return db.financialPeriod.findFirst({
    where: { companyId, periodType, periodEnd: { lte: filing.periodEnd } },
    orderBy: { periodEnd: 'desc' },
    include,
  });
}

async function findPriorFinancialPeriod(
  companyId: string,
  current: FinancialPeriodWithStatements,
): Promise<FinancialPeriodWithStatements | null> {
  return db.financialPeriod.findFirst({
    where: { companyId, periodType: current.periodType, periodEnd: { lt: current.periodEnd } },
    orderBy: { periodEnd: 'desc' },
    include: { incomeStatement: true, balanceSheet: true, cashFlowStatement: true },
  });
}

function toSnapshot(period: FinancialPeriodWithStatements | null): FinancialSnapshot {
  return {
    revenue: period?.incomeStatement?.revenue ?? null,
    operatingIncome: period?.incomeStatement?.operatingIncome ?? null,
    netIncome: period?.incomeStatement?.netIncome ?? null,
    cash: period?.balanceSheet?.cashAndEquivalents ?? null,
    totalDebt: period ? sumTotalDebt(period.balanceSheet?.shortTermDebt ?? null, period.balanceSheet?.longTermDebt ?? null) : null,
  };
}

function formatMoney(value: number | null): string {
  if (value === null) return 'unavailable';
  return `$${(value / 1e9).toFixed(2)}B`;
}
function formatPercent(value: number | null): string {
  if (value === null) return 'unavailable';
  return `${(value * 100).toFixed(1)}%`;
}

/** Builds a short, plain-text summary of already-computed financial figures
 * for the AI prompt — the model reads verified numbers, it never computes
 * or transcribes them itself. */
function buildFinancialContextText(current: FinancialPeriodWithStatements, prior: FinancialPeriodWithStatements | null): string {
  const revenue = current.incomeStatement?.revenue ?? null;
  const priorRevenue = prior?.incomeStatement?.revenue ?? null;
  const margin = operatingMargin(current.incomeStatement?.operatingIncome ?? null, revenue);
  const debt = sumTotalDebt(current.balanceSheet?.shortTermDebt ?? null, current.balanceSheet?.longTermDebt ?? null);

  return [
    `Revenue: ${formatMoney(revenue)}${priorRevenue !== null ? ` (${formatPercent(growthRate(revenue, priorRevenue))} YoY)` : ''}`,
    `Operating Margin: ${formatPercent(margin)}`,
    `Net Income: ${formatMoney(current.incomeStatement?.netIncome ?? null)}`,
    `Cash: ${formatMoney(current.balanceSheet?.cashAndEquivalents ?? null)}`,
    `Total Debt: ${formatMoney(debt)}`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// 4. AI analysis — cache-first; only regenerated on explicit request
// ---------------------------------------------------------------------------

export interface AnalyzeFilingOptions {
  regenerate?: boolean;
}

/**
 * Returns the filing's stored analysis, generating one only if none exists
 * yet or `regenerate` is explicitly true — "AI calls should not occur every
 * time a user opens a filing." A failed generation is itself cached (with
 * status FAILED) so a persistent failure (e.g. no API key) doesn't retry on
 * every page view either; the user must explicitly regenerate to retry.
 */
export async function getOrCreateFilingAnalysis(filingId: string, options: AnalyzeFilingOptions = {}) {
  const existing = await db.filingAnalysis.findUnique({ where: { filingId } });
  if (existing && !options.regenerate) return existing;

  const { filing, sections } = await getFilingWithSections(filingId);
  if (filing.processingStatus !== 'COMPLETE' || sections.length === 0) {
    throw new FilingNotFoundError('This filing has no processed sections to analyze yet.');
  }

  const company = await db.company.findUniqueOrThrow({ where: { id: filing.companyId } });
  const matchingPeriod = await findMatchingFinancialPeriod(filing.companyId, filing);
  const financialContext = matchingPeriod
    ? buildFinancialContextText(matchingPeriod, await findPriorFinancialPeriod(filing.companyId, matchingPeriod))
    : undefined;

  try {
    const result = await runAiAnalysis({
      companyName: company.name,
      formType: filing.formType,
      filingDate: filing.filingDate.toISOString().slice(0, 10),
      sections: sections.map((s) => ({ sectionType: s.sectionType, title: s.title, content: s.content })),
      financialContext,
    });

    return db.filingAnalysis.upsert({
      where: { filingId },
      create: {
        filingId,
        status: 'SUCCESS' as PrismaAnalysisStatus,
        model: result.model,
        summary: result.payload.summary,
        keyChanges: result.payload.key_changes,
        risks: result.payload.risks,
        managementCommentary: result.payload.management_commentary,
        capitalAllocation: result.payload.capital_allocation,
        accountingChanges: result.payload.accounting_changes,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      },
      update: {
        status: 'SUCCESS' as PrismaAnalysisStatus,
        model: result.model,
        error: null,
        summary: result.payload.summary,
        keyChanges: result.payload.key_changes,
        risks: result.payload.risks,
        managementCommentary: result.payload.management_commentary,
        capitalAllocation: result.payload.capital_allocation,
        accountingChanges: result.payload.accounting_changes,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      },
    });
  } catch (error) {
    if (!(error instanceof AiNotConfiguredError) && !(error instanceof AiRequestError)) throw error;

    const message = error.message;
    return db.filingAnalysis.upsert({
      where: { filingId },
      create: {
        filingId,
        status: 'FAILED' as PrismaAnalysisStatus,
        model: 'none',
        error: message,
        summary: '',
        keyChanges: [],
        risks: [],
        managementCommentary: [],
        capitalAllocation: [],
        accountingChanges: [],
      },
      update: { status: 'FAILED' as PrismaAnalysisStatus, error: message },
    });
  }
}

// ---------------------------------------------------------------------------
// 5. Filing comparison — deterministic financial changes + AI qualitative
// ---------------------------------------------------------------------------

/** Finds the most recent prior filing of the same type — the default
 * comparison target ("2025 10-K vs. 2024 10-K"). */
export async function findPreviousFiling(filing: PrismaSecFiling): Promise<PrismaSecFiling | null> {
  return db.secFiling.findFirst({
    where: { companyId: filing.companyId, filingType: filing.filingType, filingDate: { lt: filing.filingDate }, id: { not: filing.id } },
    orderBy: { filingDate: 'desc' },
  });
}

export interface CompareFilingsOptions {
  regenerate?: boolean;
}

export async function getOrCreateFilingComparison(
  filingId: string,
  previousFilingId: string,
  options: CompareFilingsOptions = {},
) {
  const existing = await db.filingComparison.findUnique({
    where: { filingId_previousFilingId: { filingId, previousFilingId } },
  });
  if (existing && !options.regenerate) return existing;

  const current = await getFilingWithSections(filingId);
  const prior = await getFilingWithSections(previousFilingId);
  if (current.filing.companyId !== prior.filing.companyId) {
    throw new FilingNotFoundError('Cannot compare filings from two different companies.');
  }

  const company = await db.company.findUniqueOrThrow({ where: { id: current.filing.companyId } });

  const currentPeriod = await findMatchingFinancialPeriod(current.filing.companyId, current.filing);
  const priorPeriod = await findMatchingFinancialPeriod(current.filing.companyId, prior.filing);
  // Cast once here — Prisma's Json input type requires an index signature a
  // hand-written interface doesn't structurally have, the same pattern
  // financialDataService.ts uses for its `warnings` Json column.
  const financialChanges = computeFinancialChanges(toSnapshot(currentPeriod), toSnapshot(priorPeriod)) as unknown as Prisma.InputJsonValue;

  try {
    const result = await runAiComparison({
      companyName: company.name,
      currentFormType: current.filing.formType,
      currentFilingDate: current.filing.filingDate.toISOString().slice(0, 10),
      priorFormType: prior.filing.formType,
      priorFilingDate: prior.filing.filingDate.toISOString().slice(0, 10),
      currentSections: current.sections.map((s) => ({ sectionType: s.sectionType, title: s.title, content: s.content })),
      priorSections: prior.sections.map((s) => ({ sectionType: s.sectionType, title: s.title, content: s.content })),
    });

    return db.filingComparison.upsert({
      where: { filingId_previousFilingId: { filingId, previousFilingId } },
      create: {
        filingId,
        previousFilingId,
        status: 'SUCCESS' as PrismaAnalysisStatus,
        model: result.model,
        financialChanges,
        newRisks: result.payload.new_risks,
        removedRisks: result.payload.removed_risks,
        changedLanguage: result.payload.changed_language,
        guidanceChanges: result.payload.guidance_changes,
        managementCommentaryChanges: result.payload.management_commentary_changes,
      },
      update: {
        status: 'SUCCESS' as PrismaAnalysisStatus,
        model: result.model,
        error: null,
        financialChanges,
        newRisks: result.payload.new_risks,
        removedRisks: result.payload.removed_risks,
        changedLanguage: result.payload.changed_language,
        guidanceChanges: result.payload.guidance_changes,
        managementCommentaryChanges: result.payload.management_commentary_changes,
      },
    });
  } catch (error) {
    if (!(error instanceof AiNotConfiguredError) && !(error instanceof AiRequestError)) throw error;

    const message = error.message;
    return db.filingComparison.upsert({
      where: { filingId_previousFilingId: { filingId, previousFilingId } },
      create: {
        filingId,
        previousFilingId,
        status: 'FAILED' as PrismaAnalysisStatus,
        model: 'none',
        error: message,
        financialChanges,
        newRisks: [],
        removedRisks: [],
        changedLanguage: [],
        guidanceChanges: [],
        managementCommentaryChanges: [],
      },
      update: { status: 'FAILED' as PrismaAnalysisStatus, error: message, financialChanges },
    });
  }
}

// ---------------------------------------------------------------------------
// 6. Search
// ---------------------------------------------------------------------------

export async function searchFiling(filingId: string, query: string): Promise<FilingSearchResult[]> {
  const sections = await db.filingSection.findMany({ where: { filingId }, orderBy: { orderIndex: 'asc' } });
  return searchSections(
    sections.map((s) => ({ sectionType: s.sectionType, title: s.title, anchor: s.anchor, content: s.content })),
    query,
  );
}

// ---------------------------------------------------------------------------
// 7. Read-only lookups for Server Components — never generate, just read
//    whatever's already stored, so a page load is always free.
// ---------------------------------------------------------------------------

export async function getExistingAnalysis(filingId: string) {
  return db.filingAnalysis.findUnique({ where: { filingId } });
}

export async function getExistingComparison(filingId: string, previousFilingId: string) {
  return db.filingComparison.findUnique({ where: { filingId_previousFilingId: { filingId, previousFilingId } } });
}

// Re-exported so API routes can distinguish "SEC has no such filer" without
// importing lib/providers/secEdgar directly for this one check.
export { SecNotFoundError };
