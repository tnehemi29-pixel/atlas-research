import type { ConfidenceLevel, MaterialityLevel, ResearchEventCategory, ResearchEventType } from '@prisma/client';
import { db } from '@/lib/db';
import { getFinancials } from '@/lib/services/financialDataService';
import { listFilings } from '@/lib/services/secFilingService';
import { listEarningsCalls, getGuidanceObservations } from '@/lib/services/earningsCallService';
import { getExistingComparison, findPreviousFiling } from '@/lib/services/secFilingService';
import { listReports } from '@/lib/services/researchReportService';
import type { ResearchReportContent } from '@/lib/services/researchReportService';
import { compareResearchReports } from '@/lib/research/compareReports';
import { getQuickComps, getQuickDcf } from '@/lib/valuation/quickValuation';
import { categorizeEightKItem, type EightKCategory } from '@/lib/sec/eightKItems';
import { classifyFilingImportance } from '@/lib/sec/importance';
import type { SecFilingTypeValue } from '@/lib/sec/types';
import {
  classifyDcfValuationChange,
  classifyFinancialChange,
  classifyGuidanceChange,
  classifyMarginChange,
  EIGHT_K_CATEGORY_MATERIALITY,
  FILING_IMPORTANCE_MATERIALITY,
  classifyCompsValuationChange,
  maxMateriality,
  shouldRunAiAnalysis,
} from '@/lib/researchEvents/materialityConfig';
import { computeChange, computeFinancialPeriodChanges, type NumericChange } from '@/lib/researchEvents/changeDetection';
import { getImpactedResearchAreas } from '@/lib/researchEvents/impactMapping';
import { explainResearchEvent } from '@/lib/ai/explainResearchEvent';
import { AiNotConfiguredError, AiRequestError, isAiConfigured } from '@/lib/ai/anthropicClient';

/**
 * The core Milestone 11 pipeline: Company -> New Data Detected -> Data
 * Classification -> Change Detection -> Materiality Assessment -> Source
 * Verification -> (optional) Research Impact Analysis via AI -> stored
 * ResearchEvent. Every detector below reuses an existing Milestone 1-10
 * service or engine — this file computes nothing a prior milestone doesn't
 * already compute, it only compares two already-known states and decides
 * whether the difference is worth recording.
 *
 * "Automatic" here means TTL-gated lazy detection on view (the same pattern
 * every prior milestone's "sync" functions already use — see
 * companyService/financialDataService/secFilingService), not a real
 * background job queue (none exists in this codebase). See
 * researchEventFeedService.ts for where this gets triggered.
 */

interface ChangeRow {
  metric: string;
  unit: string;
  previousValue: number | null;
  currentValue: number | null;
  changeAbsolute: number | null;
  changePercent: number | null;
}

interface SourceRow {
  type: 'SEC_FILING' | 'EARNINGS_CALL' | 'FINANCIAL_DATA' | 'VALUATION' | 'RESEARCH_REPORT';
  label: string;
  secFilingId?: string;
  earningsCallId?: string;
  researchReportId?: string;
  detail?: string | null;
}

export interface DetectedEventCandidate {
  dedupeKey: string;
  category: ResearchEventCategory;
  type: ResearchEventType;
  title: string;
  description: string;
  materiality: MaterialityLevel;
  confidence: ConfidenceLevel;
  eventDate: Date;
  changes: ChangeRow[];
  sources: SourceRow[];
  eightKCategory?: EightKCategory;
}

function numericChangeRow(metric: string, unit: string, change: NumericChange): ChangeRow {
  return { metric, unit, previousValue: change.previous, currentValue: change.current, changeAbsolute: change.changeAbsolute, changePercent: change.changePercent };
}

// ---------------------------------------------------------------------------
// 1. Financial + margin change detectors — reuses getFinancials (M3/M4) and
//    lib/researchEvents/changeDetection.ts (which itself reuses
//    lib/analytics/ratios.ts). Compares the two most recent annual periods.
// ---------------------------------------------------------------------------

async function detectFinancialAndMarginChanges(ticker: string): Promise<DetectedEventCandidate[]> {
  let periods;
  try {
    periods = (await getFinancials(ticker, 'annual')).periods;
  } catch {
    return [];
  }

  const annual = periods.filter((p) => p.periodType === 'annual').sort((a, b) => b.fiscalYear - a.fiscalYear);
  if (annual.length < 2) return [];

  const current = annual[0]!;
  const previous = annual[1]!;
  const changes = computeFinancialPeriodChanges(previous, current);
  const eventDate = new Date(current.filingDate ?? current.periodEnd);
  const periodLabel = `FY${current.fiscalYear}`;

  const financialMateriality = maxMateriality(
    maxMateriality(classifyFinancialChange(changes.revenue.changePercent), classifyFinancialChange(changes.dilutedEps.changePercent)),
    classifyFinancialChange(changes.freeCashFlow.changePercent),
  );
  const marginMateriality = maxMateriality(
    maxMateriality(classifyMarginChange(changes.grossMargin.changeBps), classifyMarginChange(changes.operatingMargin.changeBps)),
    classifyMarginChange(changes.netMargin.changeBps),
  );

  const financialEvent: DetectedEventCandidate = {
    dedupeKey: `financial:${current.fiscalYear}:${current.fiscalPeriod}`,
    category: 'FINANCIAL',
    type: 'FINANCIAL_CHANGE',
    title: `${periodLabel} financial results`,
    description: `Revenue, EPS, free cash flow, debt, cash, and shares outstanding for ${periodLabel} compared against the prior annual period.`,
    materiality: financialMateriality,
    confidence: 'HIGH',
    eventDate,
    changes: [
      numericChangeRow('Revenue', 'usd', changes.revenue),
      numericChangeRow('Diluted EPS', 'usd_per_share', changes.dilutedEps),
      numericChangeRow('Free Cash Flow', 'usd', changes.freeCashFlow),
      numericChangeRow('Total Debt', 'usd', changes.totalDebt),
      numericChangeRow('Cash', 'usd', changes.cash),
      numericChangeRow('Diluted Shares Outstanding', 'count', changes.dilutedSharesOutstanding),
    ],
    sources: [{ type: 'FINANCIAL_DATA', label: `${periodLabel} annual financial statements`, detail: 'SEC EDGAR' }],
  };

  const marginEvent: DetectedEventCandidate = {
    dedupeKey: `margin:${current.fiscalYear}:${current.fiscalPeriod}`,
    category: 'FINANCIAL',
    type: 'MARGIN_CHANGE',
    title: `${periodLabel} margin changes`,
    description: `Gross, operating, and net margin for ${periodLabel} compared against the prior annual period.`,
    materiality: marginMateriality,
    confidence: 'HIGH',
    eventDate,
    changes: [
      { metric: 'Gross Margin', unit: 'bps', previousValue: changes.grossMargin.previous, currentValue: changes.grossMargin.current, changeAbsolute: changes.grossMargin.changeBps, changePercent: null },
      { metric: 'Operating Margin', unit: 'bps', previousValue: changes.operatingMargin.previous, currentValue: changes.operatingMargin.current, changeAbsolute: changes.operatingMargin.changeBps, changePercent: null },
      { metric: 'Net Margin', unit: 'bps', previousValue: changes.netMargin.previous, currentValue: changes.netMargin.current, changeAbsolute: changes.netMargin.changeBps, changePercent: null },
    ],
    sources: [{ type: 'FINANCIAL_DATA', label: `${periodLabel} annual financial statements`, detail: 'SEC EDGAR' }],
  };

  return [financialEvent, marginEvent];
}

// ---------------------------------------------------------------------------
// 2. Guidance change detector — entirely reuses M8's GuidanceObservation,
//    which already computed prior/current midpoints and the change label.
// ---------------------------------------------------------------------------

async function detectGuidanceChanges(ticker: string): Promise<DetectedEventCandidate[]> {
  const calls = await listEarningsCalls(ticker).catch(() => []);
  const latest = calls[0];
  if (!latest) return [];

  const observations = await getGuidanceObservations(latest.id);
  const candidates: DetectedEventCandidate[] = [];

  for (const obs of observations) {
    if (obs.change === 'MAINTAINED') continue;

    const change = computeChange(obs.priorMidpoint, obs.midpoint);
    const materiality = obs.change === 'NEW' ? 'MEDIUM' : classifyGuidanceChange(change.changePercent);
    const verb = obs.change === 'INCREASED' ? 'raised' : obs.change === 'DECREASED' ? 'lowered' : 'issued new';

    candidates.push({
      dedupeKey: `guidance:${obs.metric}:${obs.period}`,
      category: 'EARNINGS',
      type: 'GUIDANCE_CHANGE',
      title: `Guidance ${verb} for ${obs.metricLabel} (${obs.period})`,
      description: `Management ${verb} guidance for ${obs.metricLabel} (${obs.period}).`,
      materiality,
      confidence: 'HIGH',
      eventDate: latest.callDate ?? latest.periodEndDate ?? new Date(),
      changes: [numericChangeRow(`${obs.metricLabel} Guidance (Midpoint)`, 'usd', change)],
      sources: [{ type: 'EARNINGS_CALL', label: `Q${latest.fiscalQuarter} ${latest.fiscalYear} Earnings Call`, earningsCallId: latest.id, detail: obs.sourceExcerpt }],
    });
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// 3. DCF / comps valuation change detectors — reuses lib/valuation/
//    quickValuation.ts (itself a reuse layer over the M5/M6 engines).
//    "Previous" is the most recently RECORDED value for this metric (a
//    rolling comparison), falling back to the latest saved ResearchReport's
//    own snapshot as a first-run baseline anchor.
// ---------------------------------------------------------------------------

async function getLastKnownChangeValue(companyId: string, metric: string): Promise<number | null> {
  const row = await db.researchEventChange.findFirst({
    where: { metric, event: { companyId } },
    orderBy: { createdAt: 'desc' },
    select: { currentValue: true },
  });
  return row?.currentValue ?? null;
}

function dateBucket(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function detectDcfValuationChange(companyId: string, ticker: string): Promise<DetectedEventCandidate[]> {
  const dcf = await getQuickDcf(ticker).catch(() => null);
  if (!dcf || dcf.impliedSharePrice === null) return [];

  const reports = await listReports(ticker).catch(() => []);
  const latestReport = reports.filter((r) => r.status === 'SUCCESS').sort((a, b) => b.version - a.version)[0];
  const reportContent = latestReport?.content as unknown as ResearchReportContent | undefined;
  const reportDcfPrice = reportContent?.context.dcfAnalysis?.scenarios.find((s) => s.label === 'Base')?.impliedSharePrice ?? null;

  const previous = (await getLastKnownChangeValue(companyId, 'DCF Implied Price (Base)')) ?? reportDcfPrice;
  if (previous === null) return []; // no baseline to compare against yet

  const change = computeChange(previous, dcf.impliedSharePrice);
  const materiality = classifyDcfValuationChange(change.changePercent);
  if (change.changePercent === null || change.changePercent === 0) return [];

  const now = new Date();
  return [
    {
      dedupeKey: `dcf:base:${dateBucket(now)}`,
      category: 'VALUATION',
      type: 'DCF_VALUATION_CHANGE',
      title: 'DCF valuation changed',
      description: `The DCF-implied share price (Base case) moved from $${previous.toFixed(2)} to $${dcf.impliedSharePrice.toFixed(2)}.`,
      materiality,
      confidence: 'HIGH',
      eventDate: now,
      changes: [numericChangeRow('DCF Implied Price (Base)', 'usd_per_share', change)],
      sources: [{ type: 'VALUATION', label: 'Atlas DCF Model', detail: 'Base case, default assumptions' }],
    },
  ];
}

async function detectCompsValuationChange(companyId: string, ticker: string): Promise<DetectedEventCandidate[]> {
  const comps = await getQuickComps(ticker).catch(() => null);
  if (!comps || comps.evToEbitda === null) return [];

  const reports = await listReports(ticker).catch(() => []);
  const latestReport = reports.filter((r) => r.status === 'SUCCESS').sort((a, b) => b.version - a.version)[0];
  const reportContent = latestReport?.content as unknown as ResearchReportContent | undefined;
  const reportMultiple = reportContent?.context.compsAnalysis?.peerMedianMultiples.evToEbitda ?? null;

  const previous = (await getLastKnownChangeValue(companyId, 'Peer Median EV/EBITDA')) ?? reportMultiple;
  if (previous === null) return [];

  const change = computeChange(previous, comps.evToEbitda);
  const materiality = classifyCompsValuationChange(change.changePercent);
  if (change.changePercent === null || change.changePercent === 0) return [];

  const now = new Date();
  return [
    {
      dedupeKey: `comps:medianEvEbitda:${dateBucket(now)}`,
      category: 'VALUATION',
      type: 'COMPS_VALUATION_CHANGE',
      title: 'Comparable-company valuation changed',
      description: `The peer median EV/EBITDA multiple moved from ${previous.toFixed(1)}x to ${comps.evToEbitda.toFixed(1)}x.`,
      materiality,
      confidence: 'HIGH',
      eventDate: now,
      changes: [numericChangeRow('Peer Median EV/EBITDA', 'multiple', change)],
      sources: [{ type: 'VALUATION', label: 'Atlas Comparable Company Analysis', detail: 'Auto-selected peer set' }],
    },
  ];
}

// ---------------------------------------------------------------------------
// 4. New filing / corporate event detector — reuses M7's listFilings() and
//    its own 8-K item classification (lib/sec/eightKItems.ts,
//    lib/sec/importance.ts) to distinguish a routine filing from a
//    corporate event, never re-implementing SEC processing.
// ---------------------------------------------------------------------------

const MAX_FILINGS_PER_RUN = 3;

async function detectNewFilings(ticker: string): Promise<DetectedEventCandidate[]> {
  const filings = await listFilings(ticker).catch(() => []);
  const candidates: DetectedEventCandidate[] = [];

  for (const filing of filings.slice(0, MAX_FILINGS_PER_RUN)) {
    const itemCodes = filing.items ? filing.items.split(',').map((c) => c.trim()) : [];
    const categories = itemCodes.map((code) => categorizeEightKItem(code).category);
    const corporateEventCategory = categories.find((c) => !['EARNINGS', 'OTHER'].includes(c));

    if (filing.filingType === 'EIGHT_K' && corporateEventCategory) {
      const materiality = categories
        .filter((c): c is EightKCategory => c !== undefined)
        .reduce<MaterialityLevel>((acc, c) => maxMateriality(acc, EIGHT_K_CATEGORY_MATERIALITY[c]), 'LOW');
      const label = categorizeEightKItem(itemCodes.find((code) => categorizeEightKItem(code).category === corporateEventCategory) ?? itemCodes[0]!).label;

      candidates.push({
        dedupeKey: `filing:${filing.accessionNumber}`,
        category: 'CORPORATE_EVENT',
        type: 'CORPORATE_EVENT',
        title: label,
        description: `${filing.formType} filed ${filing.filingDate.toISOString().slice(0, 10)}: ${label}.`,
        materiality,
        confidence: 'HIGH',
        eventDate: filing.filingDate,
        changes: [],
        sources: [{ type: 'SEC_FILING', label: `${filing.formType}, filed ${filing.filingDate.toISOString().slice(0, 10)}`, secFilingId: filing.id }],
        eightKCategory: corporateEventCategory,
      });
      continue;
    }

    const importance = classifyFilingImportance(filing.filingType as SecFilingTypeValue, itemCodes);
    candidates.push({
      dedupeKey: `filing:${filing.accessionNumber}`,
      category: 'SEC_FILING',
      type: 'NEW_FILING',
      title: `New ${filing.formType} filed`,
      description: `${filing.formType} filed ${filing.filingDate.toISOString().slice(0, 10)}.`,
      materiality: FILING_IMPORTANCE_MATERIALITY[importance],
      confidence: 'HIGH',
      eventDate: filing.filingDate,
      changes: [],
      sources: [{ type: 'SEC_FILING', label: `${filing.formType}, filed ${filing.filingDate.toISOString().slice(0, 10)}`, secFilingId: filing.id }],
    });
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// 5. Earnings call detector — a call becoming available is itself an event.
// ---------------------------------------------------------------------------

const MAX_CALLS_PER_RUN = 2;

async function detectNewEarningsCalls(ticker: string): Promise<DetectedEventCandidate[]> {
  const calls = await listEarningsCalls(ticker).catch(() => []);

  return calls.slice(0, MAX_CALLS_PER_RUN).map(
    (call): DetectedEventCandidate => ({
      dedupeKey: `earnings:${call.fiscalYear}:${call.fiscalQuarter}`,
      category: 'EARNINGS',
      type: 'EARNINGS_CALL',
      title: `Q${call.fiscalQuarter} ${call.fiscalYear} earnings call`,
      description: `Q${call.fiscalQuarter} ${call.fiscalYear} earnings call${call.callDate ? ` held ${call.callDate.toISOString().slice(0, 10)}` : ''}.`,
      materiality: 'HIGH',
      confidence: 'HIGH',
      eventDate: call.callDate ?? call.periodEndDate ?? new Date(),
      changes: [],
      sources: [{ type: 'EARNINGS_CALL', label: `Q${call.fiscalQuarter} ${call.fiscalYear} Earnings Call`, earningsCallId: call.id }],
    }),
  );
}

// ---------------------------------------------------------------------------
// 6. New-risk detector — reuses M7's FilingComparison.newRisks (already
//    AI-identified, read-only here; never triggers a new comparison).
// ---------------------------------------------------------------------------

async function detectNewRisks(ticker: string): Promise<DetectedEventCandidate[]> {
  const filings = await listFilings(ticker).catch(() => []);
  const latest = filings[0];
  if (!latest) return [];

  const previous = await findPreviousFiling(latest).catch(() => null);
  if (!previous) return [];

  const comparison = await getExistingComparison(latest.id, previous.id);
  if (!comparison || comparison.status !== 'SUCCESS') return [];

  const newRisks = comparison.newRisks as unknown as Array<{ description: string; source: { section: string; excerpt: string } }>;

  return newRisks.slice(0, 5).map(
    (risk): DetectedEventCandidate => ({
      dedupeKey: `risk:${latest.id}:${risk.description.slice(0, 60)}`,
      category: 'SEC_FILING',
      type: 'NEW_RISK',
      title: 'New risk disclosed',
      description: risk.description,
      materiality: 'MEDIUM',
      // AI-identified (via the M7 filing-comparison AI call), not a direct
      // structured disclosure — per the milestone spec's own confidence
      // hierarchy, this is Medium, not High.
      confidence: 'MEDIUM',
      eventDate: latest.filingDate,
      changes: [],
      sources: [{ type: 'SEC_FILING', label: `${latest.formType}, filed ${latest.filingDate.toISOString().slice(0, 10)}`, secFilingId: latest.id, detail: `${risk.source.section}: "${risk.source.excerpt}"` }],
    }),
  );
}

// ---------------------------------------------------------------------------
// 7. Research report version detector — reuses M9's ResearchReport +
//    M10's compareResearchReports diff.
// ---------------------------------------------------------------------------

async function detectResearchReportChanges(ticker: string): Promise<DetectedEventCandidate[]> {
  const reports = (await listReports(ticker).catch(() => [])).filter((r) => r.status === 'SUCCESS').sort((a, b) => a.version - b.version);
  const latest = reports[reports.length - 1];
  if (!latest) return [];

  const previous = reports[reports.length - 2] ?? null;

  let materiality: MaterialityLevel = latest.version === 1 ? 'MEDIUM' : 'LOW';
  if (previous) {
    const diff = compareResearchReports(
      { version: latest.version, content: latest.content as unknown as ResearchReportContent },
      { version: previous.version, content: previous.content as unknown as ResearchReportContent },
    );
    materiality = maxMateriality(
      classifyDcfValuationChange(diff.dcfImpliedPriceChange.percentChange),
      diff.guidanceChanges.length > 0 || diff.newRisks.length > 0 ? 'MEDIUM' : 'LOW',
    );
  }

  return [
    {
      dedupeKey: `report:${latest.version}`,
      category: 'VALUATION',
      type: latest.version === 1 ? 'NEW_RESEARCH_REPORT' : 'RESEARCH_REPORT_UPDATED',
      title: latest.version === 1 ? 'Research report generated' : `Research report updated to v${latest.version}`,
      description: latest.version === 1 ? 'A research report was generated for this company.' : `The research report was regenerated as version ${latest.version}.`,
      materiality,
      confidence: 'HIGH',
      eventDate: latest.createdAt,
      changes: [],
      sources: [{ type: 'RESEARCH_REPORT', label: `Research Report v${latest.version}`, researchReportId: latest.id }],
    },
  ];
}

// ---------------------------------------------------------------------------
// Persistence — upsert-with-dedup, then optional AI explanation
// ---------------------------------------------------------------------------

function sourcesMatch(a: SourceRow, b: { type: string; secFilingId: string | null; earningsCallId: string | null; researchReportId: string | null }): boolean {
  return a.type === b.type && (a.secFilingId ?? null) === b.secFilingId && (a.earningsCallId ?? null) === b.earningsCallId && (a.researchReportId ?? null) === b.researchReportId;
}

async function runAiExplanation(eventId: string, companyName: string, ticker: string, candidate: DetectedEventCandidate, impacts: { area: string; note: string }[]) {
  try {
    const result = await explainResearchEvent({
      companyName,
      ticker,
      category: candidate.category,
      materiality: candidate.materiality,
      eventTitle: candidate.title,
      eventDescription: candidate.description,
      changes: candidate.changes.map((c) => ({ metric: c.metric, unit: c.unit, previousValue: c.previousValue, currentValue: c.currentValue, changePercent: c.changePercent })),
      deterministicImpacts: impacts,
      sources: candidate.sources.map((s) => ({ type: s.type, label: s.label, detail: s.detail })),
    });

    await db.researchEvent.update({
      where: { id: eventId },
      data: {
        aiStatus: 'SUCCESS',
        aiModel: result.model,
        aiSummary: result.payload.summary,
        aiWhyItMatters: result.payload.why_it_matters,
        aiAffectedResearchAreas: result.payload.affected_research_areas as unknown as object,
        aiQuestionsToInvestigate: result.payload.questions_to_investigate as unknown as object,
        aiConfidence: result.payload.confidence.toUpperCase() as ConfidenceLevel,
        aiInputTokens: result.inputTokens,
        aiOutputTokens: result.outputTokens,
      },
    });
  } catch (error) {
    if (!(error instanceof AiNotConfiguredError) && !(error instanceof AiRequestError)) throw error;
    await db.researchEvent.update({ where: { id: eventId }, data: { aiStatus: 'FAILED', aiError: error.message } });
  }
}

async function persistCandidate(companyId: string, companyName: string, ticker: string, candidate: DetectedEventCandidate): Promise<'created' | 'updated' | 'unchanged'> {
  const existing = await db.researchEvent.findUnique({
    where: { companyId_dedupeKey: { companyId, dedupeKey: candidate.dedupeKey } },
    include: { sources: true },
  });

  if (existing) {
    const newSources = candidate.sources.filter((s) => !existing.sources.some((es) => sourcesMatch(s, es)));
    if (newSources.length === 0) return 'unchanged';
    await db.researchEventSource.createMany({ data: newSources.map((s) => ({ eventId: existing.id, ...s })) });
    return 'updated';
  }

  const impacts = getImpactedResearchAreas(candidate.type, { eightKCategory: candidate.eightKCategory });

  const event = await db.researchEvent.create({
    data: {
      companyId,
      category: candidate.category,
      type: candidate.type,
      title: candidate.title,
      description: candidate.description,
      materiality: candidate.materiality,
      confidence: candidate.confidence,
      dedupeKey: candidate.dedupeKey,
      eventDate: candidate.eventDate,
      sources: { create: candidate.sources },
      changes: { create: candidate.changes },
      impacts: { create: impacts },
    },
  });

  if (shouldRunAiAnalysis(candidate.materiality) && isAiConfigured()) {
    await runAiExplanation(event.id, companyName, ticker, candidate, impacts);
  }

  return 'created';
}

export interface RunDetectionResult {
  created: number;
  updated: number;
  unchanged: number;
}

/** Runs every detector for one company and persists whatever it finds.
 * Idempotent: re-running immediately after produces zero new events
 * (everything dedupes via `dedupeKey`). Never throws for a single
 * detector's data being unavailable — each detector degrades to an empty
 * list rather than failing the whole run. */
export async function runResearchEventDetection(rawTicker: string): Promise<RunDetectionResult> {
  const ticker = rawTicker.trim().toUpperCase();
  const company = await db.company.findUnique({ where: { ticker } });
  if (!company) return { created: 0, updated: 0, unchanged: 0 };

  const [financial, guidance, dcf, comps, filings, calls, risks, reports] = await Promise.all([
    detectFinancialAndMarginChanges(ticker),
    detectGuidanceChanges(ticker),
    detectDcfValuationChange(company.id, ticker),
    detectCompsValuationChange(company.id, ticker),
    detectNewFilings(ticker),
    detectNewEarningsCalls(ticker),
    detectNewRisks(ticker),
    detectResearchReportChanges(ticker),
  ]);

  const allCandidates = [...financial, ...guidance, ...dcf, ...comps, ...filings, ...calls, ...risks, ...reports];

  const result: RunDetectionResult = { created: 0, updated: 0, unchanged: 0 };
  for (const candidate of allCandidates) {
    const outcome = await persistCandidate(company.id, company.name, ticker, candidate);
    result[outcome]++;
  }

  return result;
}
