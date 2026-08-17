import { growthRate, safeDivide } from '@/lib/analytics/ratios';

/**
 * Deterministic financial-change computation for "Compare with Previous
 * Filing" — deliberately NOT an AI call. Financial deltas are computed from
 * Atlas's own already-normalized FinancialPeriod data (Milestones 3/4), the
 * same numbers the Financials/Valuation/Comps pages already use, so a
 * filing comparison's numbers can never diverge from — or be transcribed
 * incorrectly out of — the company's actual figures.
 */

export interface FinancialSnapshot {
  revenue: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
  cash: number | null;
  totalDebt: number | null;
}

export type FinancialChangeKind = 'growth' | 'points';

export interface FinancialChangeMetric {
  label: string;
  current: number | null;
  prior: number | null;
  /** 'growth': a ratio, e.g. 0.12 = +12% (for dollar figures).
   * 'points': an absolute percentage-point difference, e.g. 0.02 = +2pp
   * (for margins — a growth rate of a ratio would be misleading). */
  change: number | null;
  changeKind: FinancialChangeKind;
}

function pointsDiff(current: number | null, prior: number | null): number | null {
  if (current === null || prior === null) return null;
  return current - prior;
}

export function computeFinancialChanges(
  current: FinancialSnapshot,
  prior: FinancialSnapshot,
): FinancialChangeMetric[] {
  const currentMargin = safeDivide(current.operatingIncome, current.revenue);
  const priorMargin = safeDivide(prior.operatingIncome, prior.revenue);

  return [
    { label: 'Revenue', current: current.revenue, prior: prior.revenue, change: growthRate(current.revenue, prior.revenue), changeKind: 'growth' },
    { label: 'Net Income', current: current.netIncome, prior: prior.netIncome, change: growthRate(current.netIncome, prior.netIncome), changeKind: 'growth' },
    { label: 'Operating Margin', current: currentMargin, prior: priorMargin, change: pointsDiff(currentMargin, priorMargin), changeKind: 'points' },
    { label: 'Cash', current: current.cash, prior: prior.cash, change: growthRate(current.cash, prior.cash), changeKind: 'growth' },
    { label: 'Total Debt', current: current.totalDebt, prior: prior.totalDebt, change: growthRate(current.totalDebt, prior.totalDebt), changeKind: 'growth' },
  ];
}
