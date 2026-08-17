import type { FinancialPeriodData } from '@erp/types';
import { fcfMargin, grossMargin, growthRate, netMargin, operatingMargin } from '@/lib/analytics/ratios';

/**
 * Deterministic change computation — no LLM anywhere in this file. Every
 * function here is pure: plain numbers in, plain numbers out, reusing
 * lib/analytics/ratios.ts's own margin/growth formulas rather than
 * reimplementing them (the same functions the Financials/Valuation pages
 * use), so a computed change can never diverge from what those pages show.
 *
 * `growthRate` (current/previous - 1) is used for every percent change in
 * this file — the same convention already established across Milestones
 * 3/4/5/9 — rather than a second, subtly different formula.
 */

export interface NumericChange {
  previous: number | null;
  current: number | null;
  changeAbsolute: number | null;
  changePercent: number | null;
}

export function computeChange(previous: number | null, current: number | null): NumericChange {
  const changeAbsolute = previous !== null && current !== null ? current - previous : null;
  const changePercent = growthRate(current, previous);
  return { previous, current, changeAbsolute, changePercent };
}

export interface MarginChange {
  previous: number | null;
  current: number | null;
  /** (current - previous) * 10,000 — e.g. 25% -> 21% is -400. */
  changeBps: number | null;
}

export function computeMarginChangeBps(previous: number | null, current: number | null): MarginChange {
  const changeBps = previous !== null && current !== null ? (current - previous) * 10000 : null;
  return { previous, current, changeBps };
}

export interface FinancialPeriodChangeSet {
  revenue: NumericChange;
  dilutedEps: NumericChange;
  grossMargin: MarginChange;
  operatingMargin: MarginChange;
  netMargin: MarginChange;
  freeCashFlow: NumericChange;
  totalDebt: NumericChange;
  cash: NumericChange;
  dilutedSharesOutstanding: NumericChange;
}

function periodTotalDebt(period: FinancialPeriodData): number | null {
  const short = period.balanceSheet.shortTermDebt;
  const long = period.balanceSheet.longTermDebt;
  if (short === null && long === null) return null;
  return (short ?? 0) + (long ?? 0);
}

/** Every metric the milestone spec lists under "Financial Data": revenue,
 * EPS, margins, free cash flow, debt, cash, shares outstanding. `previous`
 * is null for a company's very first tracked period — every change then
 * comes back null (never a fabricated 0%/0bps), matching
 * lib/analytics/ratios.ts's own "no prior period" convention. */
export function computeFinancialPeriodChanges(previous: FinancialPeriodData | null, current: FinancialPeriodData): FinancialPeriodChangeSet {
  const prevGrossMargin = previous ? grossMargin(previous.incomeStatement.grossProfit, previous.incomeStatement.revenue) : null;
  const currGrossMargin = grossMargin(current.incomeStatement.grossProfit, current.incomeStatement.revenue);
  const prevOperatingMargin = previous ? operatingMargin(previous.incomeStatement.operatingIncome, previous.incomeStatement.revenue) : null;
  const currOperatingMargin = operatingMargin(current.incomeStatement.operatingIncome, current.incomeStatement.revenue);
  const prevNetMargin = previous ? netMargin(previous.incomeStatement.netIncome, previous.incomeStatement.revenue) : null;
  const currNetMargin = netMargin(current.incomeStatement.netIncome, current.incomeStatement.revenue);

  return {
    revenue: computeChange(previous?.incomeStatement.revenue ?? null, current.incomeStatement.revenue),
    dilutedEps: computeChange(previous?.incomeStatement.dilutedEps ?? null, current.incomeStatement.dilutedEps),
    grossMargin: computeMarginChangeBps(prevGrossMargin, currGrossMargin),
    operatingMargin: computeMarginChangeBps(prevOperatingMargin, currOperatingMargin),
    netMargin: computeMarginChangeBps(prevNetMargin, currNetMargin),
    freeCashFlow: computeChange(previous?.cashFlow.freeCashFlow ?? null, current.cashFlow.freeCashFlow),
    totalDebt: computeChange(previous ? periodTotalDebt(previous) : null, periodTotalDebt(current)),
    cash: computeChange(previous?.balanceSheet.cashAndEquivalents ?? null, current.balanceSheet.cashAndEquivalents),
    dilutedSharesOutstanding: computeChange(
      previous?.incomeStatement.dilutedSharesOutstanding ?? null,
      current.incomeStatement.dilutedSharesOutstanding,
    ),
  };
}

/** Free-cash-flow margin as its own bps change — kept separate from
 * computeFinancialPeriodChanges since it needs both statements' revenue and
 * isn't always requested alongside the other margins. */
export function computeFcfMarginChangeBps(previous: FinancialPeriodData | null, current: FinancialPeriodData): MarginChange {
  const prev = previous ? fcfMargin(previous.cashFlow.freeCashFlow, previous.incomeStatement.revenue) : null;
  const curr = fcfMargin(current.cashFlow.freeCashFlow, current.incomeStatement.revenue);
  return computeMarginChangeBps(prev, curr);
}
