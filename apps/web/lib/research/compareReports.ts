import type { ResearchContext } from './types';
import type { ResearchReportAiPayload } from '@/lib/ai/reportSchema';
import type { ResearchReportContent } from '@/lib/services/researchReportService';

/**
 * Deterministic comparison between two versions of the same company's
 * research report (Milestone 9's versioned ResearchReport rows). Every
 * numeric change here is a plain subtraction/division over numbers the
 * aggregator already computed — the LLM is never involved in producing any
 * of these values, matching the milestone spec's explicit "Do NOT use the
 * LLM to calculate numerical changes." New/removed risks and catalysts are
 * identified by exact-text set difference, not semantic matching — a risk
 * reworded between versions will show as both "removed" and "new" rather
 * than "changed"; see the README's Known Limitations for why a fuzzier
 * match was deliberately not attempted here.
 */

export interface NumericChange {
  previous: number | null;
  current: number | null;
  delta: number | null;
  percentChange: number | null;
}

function diffNumeric(previous: number | null, current: number | null): NumericChange {
  const delta = previous !== null && current !== null ? current - previous : null;
  const percentChange = previous !== null && current !== null && previous !== 0 ? (current - previous) / Math.abs(previous) : null;
  return { previous, current, delta, percentChange };
}

function findBaseScenario(dcf: ResearchContext['dcfAnalysis']) {
  return dcf?.scenarios.find((s) => s.label === 'Base') ?? null;
}

function textSetDiff(previous: string[], current: string[]): { added: string[]; removed: string[] } {
  const previousSet = new Set(previous);
  const currentSet = new Set(current);
  return {
    added: current.filter((item) => !previousSet.has(item)),
    removed: previous.filter((item) => !currentSet.has(item)),
  };
}

export interface GuidanceChangeDiff {
  metricLabel: string;
  period: string;
  previousMidpoint: number | null;
  currentMidpoint: number | null;
  previousChange: string;
  currentChange: string;
}

export interface ResearchReportDiff {
  currentVersion: number;
  previousVersion: number;
  dcfImpliedPriceChange: NumericChange;
  revenueForecastChange: NumericChange;
  marginForecastChange: NumericChange;
  newRisks: string[];
  removedRisks: string[];
  newCatalysts: string[];
  removedCatalysts: string[];
  guidanceChanges: GuidanceChangeDiff[];
}

export function compareResearchReports(
  current: { version: number; content: ResearchReportContent },
  previous: { version: number; content: ResearchReportContent },
): ResearchReportDiff {
  const currentBase = findBaseScenario(current.content.context.dcfAnalysis);
  const previousBase = findBaseScenario(previous.content.context.dcfAnalysis);

  const currentPayload: ResearchReportAiPayload | null = current.content.report;
  const previousPayload: ResearchReportAiPayload | null = previous.content.report;

  const currentRisks = currentPayload?.risks.map((r) => r.risk) ?? [];
  const previousRisks = previousPayload?.risks.map((r) => r.risk) ?? [];
  const riskDiff = textSetDiff(previousRisks, currentRisks);

  const currentCatalysts = currentPayload?.catalysts.map((c) => c.description) ?? [];
  const previousCatalysts = previousPayload?.catalysts.map((c) => c.description) ?? [];
  const catalystDiff = textSetDiff(previousCatalysts, currentCatalysts);

  const currentGuidance = current.content.context.earningsContext?.guidance ?? [];
  const previousGuidance = previous.content.context.earningsContext?.guidance ?? [];
  const guidanceChanges: GuidanceChangeDiff[] = [];
  for (const currentItem of currentGuidance) {
    const match = previousGuidance.find((p) => p.metricLabel === currentItem.metricLabel && p.period === currentItem.period);
    if (!match) continue;
    if (match.midpoint === currentItem.midpoint && match.change === currentItem.change) continue;
    guidanceChanges.push({
      metricLabel: currentItem.metricLabel,
      period: currentItem.period,
      previousMidpoint: match.midpoint,
      currentMidpoint: currentItem.midpoint,
      previousChange: match.change,
      currentChange: currentItem.change,
    });
  }

  return {
    currentVersion: current.version,
    previousVersion: previous.version,
    dcfImpliedPriceChange: diffNumeric(previousBase?.impliedSharePrice ?? null, currentBase?.impliedSharePrice ?? null),
    revenueForecastChange: diffNumeric(previousBase?.finalYearRevenue ?? null, currentBase?.finalYearRevenue ?? null),
    marginForecastChange: diffNumeric(previousBase?.finalYearOperatingMargin ?? null, currentBase?.finalYearOperatingMargin ?? null),
    newRisks: riskDiff.added,
    removedRisks: riskDiff.removed,
    newCatalysts: catalystDiff.added,
    removedCatalysts: catalystDiff.removed,
    guidanceChanges,
  };
}
