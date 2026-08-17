import type { FinancialPeriodData, FiscalPeriod } from '@erp/types';
import { growthRate, grossMargin, netMargin, operatingMargin } from '@/lib/analytics/ratios';

/**
 * Deterministic ACTUAL financial results for an earnings call — deliberately
 * NOT AI-generated. Reuses Atlas's own normalized FinancialPeriod data
 * (Milestones 3/4), the same figures the Financials/Valuation pages show, so
 * a reported number is never transcribed from the call by an LLM. Analyst
 * ESTIMATE comparisons are intentionally omitted everywhere in this module —
 * Atlas has no estimates data source, and fabricating one is explicitly
 * disallowed by the Milestone 8 spec.
 */

export type FinancialChangeKind = 'growth' | 'points';

export interface EarningsFinancialMetric {
  label: string;
  actual: number | null;
  priorQuarter: number | null;
  priorYear: number | null;
  qoqChange: number | null;
  yoyChange: number | null;
  changeKind: FinancialChangeKind;
}

export interface EarningsFinancialResults {
  /** false when Atlas has no financial-statement data for this exact
   * fiscal period yet — e.g. the call happened before the 10-Q was filed
   * and indexed. The UI must show "not yet available," never a guess. */
  periodFound: boolean;
  metrics: EarningsFinancialMetric[];
}

const FISCAL_QUARTER_TO_PERIOD: Record<number, FiscalPeriod> = { 1: 'Q1', 2: 'Q2', 3: 'Q3', 4: 'Q4' };

/** Finds the FinancialPeriodData matching an earnings call's fiscal year and
 * quarter, or null if Atlas hasn't ingested that period's filing yet. */
export function findMatchingPeriod(
  periods: FinancialPeriodData[],
  fiscalYear: number,
  fiscalQuarter: number,
): FinancialPeriodData | null {
  const target = FISCAL_QUARTER_TO_PERIOD[fiscalQuarter];
  if (!target) return null;
  return periods.find((p) => p.fiscalYear === fiscalYear && p.fiscalPeriod === target) ?? null;
}

/** Finds the immediately preceding fiscal quarter (Q1 2025 -> Q4 2024, etc.). */
export function findPriorQuarterPeriod(
  periods: FinancialPeriodData[],
  fiscalYear: number,
  fiscalQuarter: number,
): FinancialPeriodData | null {
  const [priorYear, priorQuarter] = fiscalQuarter === 1 ? [fiscalYear - 1, 4] : [fiscalYear, fiscalQuarter - 1];
  return findMatchingPeriod(periods, priorYear, priorQuarter);
}

/** Finds the same fiscal quarter one year earlier, for a year-over-year comparison. */
export function findPriorYearPeriod(
  periods: FinancialPeriodData[],
  fiscalYear: number,
  fiscalQuarter: number,
): FinancialPeriodData | null {
  return findMatchingPeriod(periods, fiscalYear - 1, fiscalQuarter);
}

function pointsDiff(current: number | null, prior: number | null): number | null {
  if (current === null || prior === null) return null;
  return current - prior;
}

function metric(
  label: string,
  actual: number | null,
  priorQuarter: number | null,
  priorYear: number | null,
  changeKind: FinancialChangeKind,
): EarningsFinancialMetric {
  const diff = changeKind === 'growth' ? growthRate : pointsDiff;
  return {
    label,
    actual,
    priorQuarter,
    priorYear,
    qoqChange: diff(actual, priorQuarter),
    yoyChange: diff(actual, priorYear),
    changeKind,
  };
}

/** Builds the ACTUAL financial-results comparison for an earnings call.
 * `current` being null (period not yet ingested) still returns a well-formed
 * result with periodFound: false and every metric null, rather than throwing. */
export function buildEarningsFinancialResults(
  current: FinancialPeriodData | null,
  priorQuarter: FinancialPeriodData | null,
  priorYear: FinancialPeriodData | null,
): EarningsFinancialResults {
  const cur = current?.incomeStatement;
  const pq = priorQuarter?.incomeStatement;
  const py = priorYear?.incomeStatement;

  const curGrossMargin = grossMargin(cur?.grossProfit ?? null, cur?.revenue ?? null);
  const pqGrossMargin = grossMargin(pq?.grossProfit ?? null, pq?.revenue ?? null);
  const pyGrossMargin = grossMargin(py?.grossProfit ?? null, py?.revenue ?? null);

  const curOpMargin = operatingMargin(cur?.operatingIncome ?? null, cur?.revenue ?? null);
  const pqOpMargin = operatingMargin(pq?.operatingIncome ?? null, pq?.revenue ?? null);
  const pyOpMargin = operatingMargin(py?.operatingIncome ?? null, py?.revenue ?? null);

  const curNetMargin = netMargin(cur?.netIncome ?? null, cur?.revenue ?? null);
  const pqNetMargin = netMargin(pq?.netIncome ?? null, pq?.revenue ?? null);
  const pyNetMargin = netMargin(py?.netIncome ?? null, py?.revenue ?? null);

  const curFcf = current?.cashFlow.freeCashFlow ?? null;
  const pqFcf = priorQuarter?.cashFlow.freeCashFlow ?? null;
  const pyFcf = priorYear?.cashFlow.freeCashFlow ?? null;

  return {
    periodFound: current !== null,
    metrics: [
      metric('Revenue', cur?.revenue ?? null, pq?.revenue ?? null, py?.revenue ?? null, 'growth'),
      metric('Diluted EPS', cur?.dilutedEps ?? null, pq?.dilutedEps ?? null, py?.dilutedEps ?? null, 'growth'),
      metric('Gross Margin', curGrossMargin, pqGrossMargin, pyGrossMargin, 'points'),
      metric('Operating Margin', curOpMargin, pqOpMargin, pyOpMargin, 'points'),
      metric('Net Margin', curNetMargin, pqNetMargin, pyNetMargin, 'points'),
      metric('Net Income', cur?.netIncome ?? null, pq?.netIncome ?? null, py?.netIncome ?? null, 'growth'),
      metric('Free Cash Flow', curFcf, pqFcf, pyFcf, 'growth'),
    ],
  };
}
