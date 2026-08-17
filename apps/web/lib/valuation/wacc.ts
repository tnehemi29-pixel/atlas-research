import { tag } from './types';
import type { DcfMarketData, WaccAssumptions, WaccResult } from './types';

/** Cost of Equity = Risk-Free Rate + Beta x Equity Risk Premium. */
export function computeCostOfEquity(riskFreeRate: number, beta: number, equityRiskPremium: number): number {
  return riskFreeRate + beta * equityRiskPremium;
}

export function computeAfterTaxCostOfDebt(preTaxCostOfDebt: number | null, taxRate: number | null): number | null {
  if (preTaxCostOfDebt === null || taxRate === null) return null;
  return preTaxCostOfDebt * (1 - taxRate);
}

/** Estimates a pre-tax cost of debt from the company's own actual data:
 * latest interest expense / total debt — a calculated figure, not invented. */
export function estimatePreTaxCostOfDebt(interestExpense: number | null, totalDebt: number | null): number | null {
  if (interestExpense === null || totalDebt === null || totalDebt <= 0) return null;
  return interestExpense / totalDebt;
}

export interface CapitalWeights {
  equityWeight: number | null;
  debtWeight: number | null;
}

export function computeCapitalWeights(marketCap: number | null, totalDebt: number | null): CapitalWeights {
  if (marketCap === null || totalDebt === null) return { equityWeight: null, debtWeight: null };
  const totalCapital = marketCap + totalDebt;
  if (totalCapital <= 0) return { equityWeight: null, debtWeight: null };
  return { equityWeight: marketCap / totalCapital, debtWeight: totalDebt / totalCapital };
}

/** WACC = (E/V x Cost of Equity) + (D/V x Cost of Debt x (1 - Tax Rate)).
 * A company with genuinely zero debt (debtWeight === 0) contributes nothing
 * from the debt term without needing a cost of debt at all; a company that
 * *has* debt but whose cost of debt is unknown returns null rather than
 * silently dropping the debt term. */
export function computeWacc(
  costOfEquity: number | null,
  afterTaxCostOfDebt: number | null,
  equityWeight: number | null,
  debtWeight: number | null,
): number | null {
  if (costOfEquity === null || equityWeight === null || debtWeight === null) return null;
  if (debtWeight > 0 && afterTaxCostOfDebt === null) return null;

  const debtContribution = debtWeight > 0 ? debtWeight * (afterTaxCostOfDebt ?? 0) : 0;
  return equityWeight * costOfEquity + debtContribution;
}

/**
 * Assembles the full, tagged WACC breakdown the UI renders. `effectiveTaxRate`
 * is passed in rather than recomputed here — WACC uses the exact same
 * effective tax rate as the FCF forecast, so the two never silently disagree.
 */
export function buildWaccResult(
  assumptions: WaccAssumptions,
  marketData: DcfMarketData,
  effectiveTaxRate: number | null,
): WaccResult {
  const costOfEquityValue = computeCostOfEquity(assumptions.riskFreeRate, assumptions.beta, assumptions.equityRiskPremium);

  const calculatedCostOfDebt = estimatePreTaxCostOfDebt(marketData.interestExpense, marketData.totalDebt);
  const useUserCostOfDebt = assumptions.costOfDebtMethod === 'user';
  const preTaxCostOfDebtValue = useUserCostOfDebt ? assumptions.costOfDebtUser : calculatedCostOfDebt;

  const afterTaxCostOfDebtValue = computeAfterTaxCostOfDebt(preTaxCostOfDebtValue, effectiveTaxRate);

  const marketCapOverride = assumptions.marketCapOverride ?? null;
  const effectiveMarketCap = marketCapOverride ?? marketData.marketCapitalization;
  const { equityWeight, debtWeight } = computeCapitalWeights(effectiveMarketCap, marketData.totalDebt);
  const waccValue = computeWacc(costOfEquityValue, afterTaxCostOfDebtValue, equityWeight, debtWeight);

  return {
    riskFreeRate: tag(assumptions.riskFreeRate, 'user', 'Verify against current market data'),
    equityRiskPremium: tag(assumptions.equityRiskPremium, 'user', 'Verify against current market data'),
    beta: tag(
      assumptions.beta,
      assumptions.betaSource,
      assumptions.betaSource === 'estimate' ? 'Source: Financial Modeling Prep' : 'Edit to reflect the company',
    ),
    costOfEquity: tag(costOfEquityValue, 'calculated', 'Risk-free rate + Beta x ERP'),
    preTaxCostOfDebt: tag(
      preTaxCostOfDebtValue,
      useUserCostOfDebt ? 'user' : 'calculated',
      useUserCostOfDebt ? undefined : 'Latest interest expense / total debt',
    ),
    effectiveTaxRate: tag(effectiveTaxRate, 'calculated', 'From the tax rate forecast assumption'),
    afterTaxCostOfDebt: tag(afterTaxCostOfDebtValue, 'calculated', 'Pre-tax cost of debt x (1 - tax rate)'),
    marketCapitalization: tag(
      effectiveMarketCap,
      marketCapOverride !== null ? 'user' : 'actual',
      marketCapOverride !== null ? 'User-provided — not available from the data provider' : 'Company overview',
    ),
    totalDebt: tag(marketData.totalDebt, 'actual', 'Latest balance sheet'),
    equityWeight: tag(equityWeight, 'calculated'),
    debtWeight: tag(debtWeight, 'calculated'),
    wacc: tag(waccValue, 'calculated'),
  };
}
