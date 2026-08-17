import type { AssumptionKey, ThesisAssumption } from '@prisma/client';
import { db } from '@/lib/db';
import { listReports, type ResearchReportContent } from '@/lib/services/researchReportService';
import { getQuickDcf, getQuickFundamentals } from '@/lib/valuation/quickValuation';
import { computeChange } from '@/lib/researchEvents/changeDetection';
import { isAssumptionChangeFlagged } from '@/lib/researchEvents/materialityConfig';

/**
 * Spec sections 13-14: structurally extracts a saved research report's own
 * key assumptions (never invented, never re-derived by an LLM — every value
 * already exists in the report's stored ResearchReportContent snapshot),
 * then compares each against the best currently-available live observation,
 * reusing lib/valuation/quickValuation.ts (never a second DCF/comps
 * calculation) and lib/researchEvents/changeDetection.ts's own computeChange
 * for the diff. "Do not automatically modify the model" — this file only
 * ever reads the report and writes AssumptionComparison rows; it never
 * touches ResearchReport.content or any DCF/comps assumption.
 */

function findMetricSeries(content: ResearchReportContent, label: string) {
  return content.context.financialPerformance.metrics.find((m) => m.label === label) ?? null;
}

interface DerivedAssumption {
  key: AssumptionKey;
  label: string;
  value: number;
  unit: string;
  extractedFrom: string;
}

/** Pure — every value comes straight from the report's own stored context,
 * or a single deterministic derivation from two of its own numbers (FCF
 * margin, implied CAGR). An assumption whose inputs aren't present in this
 * particular report is simply omitted, never fabricated. */
export function deriveThesisAssumptions(content: ResearchReportContent): DerivedAssumption[] {
  const rows: DerivedAssumption[] = [];
  const base = content.context.dcfAnalysis?.scenarios.find((s) => s.label === 'Base') ?? null;
  const forecastYears = content.context.dcfAnalysis?.forecastYears ?? null;
  const revenueSeries = findMetricSeries(content, 'Revenue');
  const currentRevenue = revenueSeries?.values[revenueSeries.values.length - 1]?.value ?? null;

  if (base && typeof base.wacc === 'number') {
    rows.push({ key: 'WACC', label: 'WACC (DCF Base case)', value: base.wacc, unit: 'ratio', extractedFrom: 'DCF Base case' });
  }
  if (base && typeof base.terminalGrowthRate === 'number') {
    rows.push({ key: 'TERMINAL_GROWTH', label: 'Terminal Growth Rate (DCF Base case)', value: base.terminalGrowthRate, unit: 'ratio', extractedFrom: 'DCF Base case' });
  }
  if (base && typeof base.finalYearOperatingMargin === 'number') {
    rows.push({ key: 'OPERATING_MARGIN', label: 'Operating Margin (DCF Base case, final forecast year)', value: base.finalYearOperatingMargin, unit: 'ratio', extractedFrom: 'DCF Base case' });
  }
  if (base && typeof base.finalYearUnleveredFcf === 'number' && typeof base.finalYearRevenue === 'number' && base.finalYearRevenue !== 0) {
    rows.push({ key: 'FCF_MARGIN', label: 'FCF Margin (DCF Base case, final forecast year)', value: base.finalYearUnleveredFcf / base.finalYearRevenue, unit: 'ratio', extractedFrom: 'DCF Base case' });
  }
  if (base && typeof base.finalYearRevenue === 'number' && base.finalYearRevenue > 0 && currentRevenue && currentRevenue > 0 && forecastYears) {
    const cagr = Math.pow(base.finalYearRevenue / currentRevenue, 1 / forecastYears) - 1;
    rows.push({ key: 'REVENUE_CAGR', label: 'Revenue CAGR (DCF Base case forecast)', value: cagr, unit: 'ratio', extractedFrom: 'DCF Base case forecast, implied from final-year revenue' });
  }

  const guidance = content.context.earningsContext?.guidance ?? [];
  const revenueGuidance = guidance.find((g) => /revenue/i.test(g.metricLabel) && g.midpoint !== null);
  if (revenueGuidance && revenueGuidance.midpoint !== null) {
    rows.push({ key: 'REVENUE_GUIDANCE', label: `Revenue Guidance (${revenueGuidance.period})`, value: revenueGuidance.midpoint, unit: 'usd', extractedFrom: 'Latest earnings-call guidance' });
  }

  return rows;
}

/** Extraction happens once per report version, on first view — a report is
 * immutable once generated, so there's never a reason to re-extract. */
async function ensureAssumptionsExtracted(report: { id: string; content: unknown }): Promise<ThesisAssumption[]> {
  const existing = await db.thesisAssumption.findMany({ where: { researchReportId: report.id } });
  if (existing.length > 0) return existing;

  const rows = deriveThesisAssumptions(report.content as unknown as ResearchReportContent);
  if (rows.length === 0) return [];

  await db.thesisAssumption.createMany({ data: rows.map((r) => ({ ...r, researchReportId: report.id })) });
  return db.thesisAssumption.findMany({ where: { researchReportId: report.id } });
}

/** Only ever writes a new row when the live observation has actually moved
 * since the last one recorded — avoids growing an unbounded, mostly-
 * identical history from every page view. `previousValue` is always the
 * report's ORIGINAL assumption (never the prior comparison), because the
 * question is always "does this still hold up against what we assumed,"
 * not "did the trend continue." */
async function recordComparisonIfChanged(assumption: ThesisAssumption, newValue: number, researchEventId: string | null) {
  const latest = await db.assumptionComparison.findFirst({ where: { assumptionId: assumption.id }, orderBy: { createdAt: 'desc' } });
  if (latest && latest.newValue === newValue) return latest;

  const change = computeChange(assumption.value, newValue);
  const flagged = isAssumptionChangeFlagged(assumption.key, assumption.value, newValue);
  const note = flagged
    ? `Potentially inconsistent with a prior research assumption: ${assumption.label} was assumed at ${assumption.value}, live data now shows ${newValue}.`
    : `Consistent with the prior research assumption for ${assumption.label}.`;

  return db.assumptionComparison.create({
    data: {
      assumptionId: assumption.id,
      researchEventId,
      newValue,
      previousValue: assumption.value,
      differenceAbsolute: change.changeAbsolute ?? newValue - assumption.value,
      differencePercent: change.changePercent,
      flagged,
      note,
    },
  });
}

export interface ThesisMonitorAssumptionView {
  key: AssumptionKey;
  label: string;
  originalValue: number;
  unit: string;
  extractedFrom: string;
  latestComparison: {
    newValue: number;
    changeAbsolute: number;
    changePercent: number | null;
    flagged: boolean;
    note: string;
    comparedAt: string;
    researchEventId: string | null;
  } | null;
}

export interface ThesisMonitorResult {
  reportId: string;
  reportVersion: number;
  assumptions: ThesisMonitorAssumptionView[];
}

/** Returns null only when the company has no successful research report to
 * monitor a thesis against — never fabricates a comparison with no report
 * behind it. */
export async function getThesisMonitor(rawTicker: string): Promise<ThesisMonitorResult | null> {
  const ticker = rawTicker.trim().toUpperCase();
  const reports = await listReports(ticker).catch(() => []);
  const latestReport = reports.filter((r) => r.status === 'SUCCESS').sort((a, b) => b.version - a.version)[0];
  if (!latestReport) return null;

  const assumptions = await ensureAssumptionsExtracted(latestReport);
  if (assumptions.length === 0) return { reportId: latestReport.id, reportVersion: latestReport.version, assumptions: [] };

  const [fundamentals, dcf, latestGuidanceEvent] = await Promise.all([
    getQuickFundamentals(ticker).catch(() => null),
    getQuickDcf(ticker).catch(() => null),
    db.researchEvent.findFirst({
      where: { company: { ticker }, type: 'GUIDANCE_CHANGE', changes: { some: { metric: { contains: 'Revenue' } } } },
      orderBy: { eventDate: 'desc' },
      include: { changes: true },
    }),
  ]);

  const fcfMargin = fundamentals && fundamentals.revenue && fundamentals.freeCashFlow !== null && fundamentals.revenue !== 0 ? fundamentals.freeCashFlow / fundamentals.revenue : null;
  const guidanceChange = latestGuidanceEvent?.changes.find((c) => c.metric.includes('Revenue')) ?? null;

  const liveValueByKey: Partial<Record<AssumptionKey, { value: number | null; researchEventId: string | null }>> = {
    REVENUE_CAGR: { value: fundamentals?.revenueGrowth ?? null, researchEventId: null },
    OPERATING_MARGIN: { value: fundamentals?.operatingMargin ?? null, researchEventId: null },
    FCF_MARGIN: { value: fcfMargin, researchEventId: null },
    WACC: { value: dcf?.wacc ?? null, researchEventId: null },
    REVENUE_GUIDANCE: { value: guidanceChange?.currentValue ?? null, researchEventId: latestGuidanceEvent?.id ?? null },
  };

  const views: ThesisMonitorAssumptionView[] = [];
  for (const assumption of assumptions) {
    const live = liveValueByKey[assumption.key];
    const comparison =
      live && live.value !== null
        ? await recordComparisonIfChanged(assumption, live.value, live.researchEventId)
        : await db.assumptionComparison.findFirst({ where: { assumptionId: assumption.id }, orderBy: { createdAt: 'desc' } });

    views.push({
      key: assumption.key,
      label: assumption.label,
      originalValue: assumption.value,
      unit: assumption.unit,
      extractedFrom: assumption.extractedFrom,
      latestComparison: comparison
        ? {
            newValue: comparison.newValue,
            changeAbsolute: comparison.differenceAbsolute,
            changePercent: comparison.differencePercent,
            flagged: comparison.flagged,
            note: comparison.note,
            comparedAt: comparison.createdAt.toISOString(),
            researchEventId: comparison.researchEventId ?? null,
          }
        : null,
    });
  }

  return { reportId: latestReport.id, reportVersion: latestReport.version, assumptions: views };
}
