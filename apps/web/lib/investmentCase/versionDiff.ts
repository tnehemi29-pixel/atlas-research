import type { InvestmentAssumptionMetric, InvestmentScenario } from '@prisma/client';
import type { CaseSnapshot, CaseSnapshotEvidence, CaseSnapshotValuation } from './types';

/**
 * Spec section 22 — "Version 1 vs Version 2: show changed assumptions, new
 * evidence, removed evidence, valuation changes, thesis changes." A plain,
 * deterministic structural diff between two frozen CaseSnapshot objects —
 * never an AI-generated summary of what changed, so the comparison is
 * always exactly reproducible from the two stored versions alone.
 */

export interface AssumptionVersionChange {
  metric: InvestmentAssumptionMetric;
  scenario: InvestmentScenario;
  label: string;
  previousValue: number | null;
  newValue: number | null;
}

export interface ValuationVersionChange {
  label: string;
  previousValue: number | null;
  newValue: number | null;
}

export interface VersionDiff {
  thesisChanges: string[];
  assumptionChanges: AssumptionVersionChange[];
  addedEvidence: CaseSnapshotEvidence[];
  removedEvidence: CaseSnapshotEvidence[];
  valuationChanges: ValuationVersionChange[];
}

const VALUATION_LABELS: Record<keyof CaseSnapshotValuation, string> = {
  currentSharePrice: 'Current Price',
  dcfBase: 'DCF Base Case',
  dcfBull: 'DCF Bull Case',
  dcfBear: 'DCF Bear Case',
  compsImplied: 'Comps Implied Value',
  evToEbitda: 'EV/EBITDA',
  peRatio: 'P/E Ratio',
};

export function diffCaseSnapshots(previous: CaseSnapshot, current: CaseSnapshot): VersionDiff {
  const thesisChanges: string[] = [];
  if (previous.status !== current.status) thesisChanges.push(`Status changed from ${previous.status} to ${current.status}.`);
  if (previous.horizon !== current.horizon) thesisChanges.push(`Horizon changed from "${previous.horizon}" to "${current.horizon}".`);
  if (previous.coreThesis !== current.coreThesis) thesisChanges.push('Core thesis text changed.');
  if (JSON.stringify(previous.keyDrivers) !== JSON.stringify(current.keyDrivers)) thesisChanges.push('Key drivers changed.');
  if (previous.bullSummary !== current.bullSummary) thesisChanges.push('Bull case summary changed.');
  if (previous.baseSummary !== current.baseSummary) thesisChanges.push('Base case summary changed.');
  if (previous.bearSummary !== current.bearSummary) thesisChanges.push('Bear case summary changed.');
  if (JSON.stringify(previous.strengthenIndicators) !== JSON.stringify(current.strengthenIndicators)) thesisChanges.push('"What would strengthen the thesis" changed.');
  if (JSON.stringify(previous.weakenIndicators) !== JSON.stringify(current.weakenIndicators)) thesisChanges.push('"What would weaken the thesis" changed.');
  if (JSON.stringify(previous.invalidateIndicators) !== JSON.stringify(current.invalidateIndicators)) thesisChanges.push('"What would invalidate the thesis" changed.');

  const prevAssumptionsByKey = new Map(previous.assumptions.map((a) => [`${a.metric}:${a.scenario}`, a]));
  const currAssumptionsByKey = new Map(current.assumptions.map((a) => [`${a.metric}:${a.scenario}`, a]));
  const assumptionChanges: AssumptionVersionChange[] = [];
  for (const [key, curr] of currAssumptionsByKey) {
    const prev = prevAssumptionsByKey.get(key);
    if (!prev || prev.value !== curr.value) {
      assumptionChanges.push({ metric: curr.metric, scenario: curr.scenario, label: curr.label, previousValue: prev?.value ?? null, newValue: curr.value });
    }
  }
  for (const [key, prev] of prevAssumptionsByKey) {
    if (!currAssumptionsByKey.has(key)) {
      assumptionChanges.push({ metric: prev.metric, scenario: prev.scenario, label: prev.label, previousValue: prev.value, newValue: null });
    }
  }

  const prevEvidenceIds = new Set(previous.evidence.map((e) => e.id));
  const currEvidenceIds = new Set(current.evidence.map((e) => e.id));
  const addedEvidence = current.evidence.filter((e) => !prevEvidenceIds.has(e.id));
  const removedEvidence = previous.evidence.filter((e) => !currEvidenceIds.has(e.id));

  const valuationChanges: ValuationVersionChange[] = [];
  for (const key of Object.keys(VALUATION_LABELS) as (keyof CaseSnapshotValuation)[]) {
    if (previous.valuation[key] !== current.valuation[key]) {
      valuationChanges.push({ label: VALUATION_LABELS[key], previousValue: previous.valuation[key], newValue: current.valuation[key] });
    }
  }

  return { thesisChanges, assumptionChanges, addedEvidence, removedEvidence, valuationChanges };
}
