import type { BalanceSheetData, FinancialPeriodData } from '@erp/types';
import { growthRate, safeDivide } from '@/lib/analytics/ratios';
import { computeUnleveredFcfFromEbit } from './fcf';
import type { HistoricalYear } from './types';

/**
 * Turns Atlas Research's already-normalized financial data (Milestone 3/4)
 * into the DCF's historical baseline. Every DCF assumption default is
 * derived from this — nothing here is entered by hand.
 */

const MIN_PLAUSIBLE_TAX_RATE = -0.5;
const MAX_PLAUSIBLE_TAX_RATE = 1.0;

/**
 * Effective tax rate = income tax / pretax income, bounded to a plausible
 * range. A near-zero or negative pretax income can produce a wildly
 * distorted ratio (e.g. a small tax bill on a near-zero pretax loss) — that
 * year is excluded (null) rather than let it skew an average silently.
 */
export function historicalTaxRate(incomeTax: number | null, pretaxIncome: number | null): number | null {
  if (incomeTax === null || pretaxIncome === null || pretaxIncome <= 0) return null;
  const rate = incomeTax / pretaxIncome;
  if (rate < MIN_PLAUSIBLE_TAX_RATE || rate > MAX_PLAUSIBLE_TAX_RATE) return null;
  return rate;
}

/**
 * Operating net working capital = (Current Assets - Cash) - (Current
 * Liabilities - Short-Term Debt) — excludes cash and short-term debt because
 * those are financing/investing items, not operating working capital.
 * Requires totalCurrentAssets/totalCurrentLiabilities; if the cash or
 * short-term-debt breakout is unavailable for a period, the exclusion is
 * simply not applied for that piece (equivalent to the simpler "gross
 * working capital" definition) rather than nulling the whole figure —
 * documented here and in the methodology page, not hidden.
 */
export function computeNwc(balanceSheet: BalanceSheetData): number | null {
  const { totalCurrentAssets, totalCurrentLiabilities, cashAndEquivalents, shortTermDebt } = balanceSheet;
  if (totalCurrentAssets === null || totalCurrentLiabilities === null) return null;

  const cashExclusion = cashAndEquivalents ?? 0;
  const debtExclusion = shortTermDebt ?? 0;
  return totalCurrentAssets - cashExclusion - (totalCurrentLiabilities - debtExclusion);
}

/**
 * Builds the historical year-by-year table from annual FinancialPeriodData,
 * oldest first. Every field independently resolves to null when its inputs
 * are missing — one missing field never blanks out the rest of the row.
 */
export function deriveHistoricalYears(periods: FinancialPeriodData[]): HistoricalYear[] {
  const annual = periods
    .filter((period) => period.periodType === 'annual')
    .slice()
    .sort((a, b) => a.fiscalYear - b.fiscalYear);

  return annual.map((period, index) => {
    const prior = annual[index - 1];

    const revenue = period.incomeStatement.revenue;
    const revenueGrowth = growthRate(revenue, prior?.incomeStatement.revenue ?? null);

    const ebit = period.incomeStatement.operatingIncome;
    const ebitMargin = safeDivide(ebit, revenue);

    const taxRate = historicalTaxRate(period.incomeStatement.incomeTax, period.incomeStatement.pretaxIncome);

    const da = period.cashFlow.depreciationAmortization;
    const capex = period.cashFlow.capex;

    const nwc = computeNwc(period.balanceSheet);
    const priorNwc = prior ? computeNwc(prior.balanceSheet) : null;
    const changeInNwc = nwc !== null && priorNwc !== null ? nwc - priorNwc : null;

    const unleveredFcf = computeUnleveredFcfFromEbit(ebit, taxRate, da, capex, changeInNwc);

    return {
      fiscalYear: period.fiscalYear,
      revenue,
      revenueGrowth,
      ebit,
      ebitMargin,
      taxRate,
      da,
      capex,
      nwc,
      changeInNwc,
      unleveredFcf,
    };
  });
}
