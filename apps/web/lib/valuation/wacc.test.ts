import { describe, expect, it } from 'vitest';
import {
  buildWaccResult,
  computeAfterTaxCostOfDebt,
  computeCapitalWeights,
  computeCostOfEquity,
  computeWacc,
  estimatePreTaxCostOfDebt,
} from './wacc';
import type { DcfMarketData, WaccAssumptions } from './types';

describe('computeCostOfEquity', () => {
  it('Risk-Free Rate + Beta x ERP — matches a hand-calculated case: 4% + 1.2 x 5.5% = 10.6%', () => {
    expect(computeCostOfEquity(0.04, 1.2, 0.055)).toBeCloseTo(0.106, 6);
  });

  it('a beta of 1.0 makes cost of equity = risk-free rate + ERP exactly (market-average risk)', () => {
    expect(computeCostOfEquity(0.04, 1.0, 0.05)).toBeCloseTo(0.09);
  });

  it('a beta below 1 produces a lower cost of equity than the market', () => {
    expect(computeCostOfEquity(0.04, 0.5, 0.05)).toBeCloseTo(0.065);
  });
});

describe('estimatePreTaxCostOfDebt', () => {
  it('interest expense / total debt', () => {
    expect(estimatePreTaxCostOfDebt(50, 1000)).toBeCloseTo(0.05);
  });

  it('is null when total debt is zero or negative — cannot divide by it', () => {
    expect(estimatePreTaxCostOfDebt(50, 0)).toBeNull();
    expect(estimatePreTaxCostOfDebt(50, -100)).toBeNull();
  });

  it('is null when an input is missing', () => {
    expect(estimatePreTaxCostOfDebt(null, 1000)).toBeNull();
    expect(estimatePreTaxCostOfDebt(50, null)).toBeNull();
  });
});

describe('computeAfterTaxCostOfDebt', () => {
  it('pre-tax cost x (1 - tax rate)', () => {
    expect(computeAfterTaxCostOfDebt(0.05, 0.25)).toBeCloseTo(0.0375);
  });
});

describe('computeCapitalWeights', () => {
  it('splits by market value of equity vs. debt', () => {
    const weights = computeCapitalWeights(800, 200);
    expect(weights.equityWeight).toBeCloseTo(0.8);
    expect(weights.debtWeight).toBeCloseTo(0.2);
  });

  it('a debt-free company has 100% equity weight', () => {
    const weights = computeCapitalWeights(1000, 0);
    expect(weights.equityWeight).toBe(1);
    expect(weights.debtWeight).toBe(0);
  });

  it('is null when market cap or total debt is unavailable', () => {
    expect(computeCapitalWeights(null, 200)).toEqual({ equityWeight: null, debtWeight: null });
    expect(computeCapitalWeights(800, null)).toEqual({ equityWeight: null, debtWeight: null });
  });
});

describe('computeWacc', () => {
  it('matches a hand-calculated case: 80% equity @ 10.6%, 20% debt @ 3.75% after-tax -> WACC = 9.23%', () => {
    // 0.8*0.106 + 0.2*0.0375 = 0.0848 + 0.0075 = 0.0923
    expect(computeWacc(0.106, 0.0375, 0.8, 0.2)).toBeCloseTo(0.0923, 4);
  });

  it('a zero-debt company needs no cost of debt at all', () => {
    expect(computeWacc(0.1, null, 1, 0)).toBeCloseTo(0.1);
  });

  it('is null when there IS debt but its cost is unknown — never drops the term silently', () => {
    expect(computeWacc(0.1, null, 0.8, 0.2)).toBeNull();
  });

  it('is null when cost of equity or the capital weights are missing', () => {
    expect(computeWacc(null, 0.04, 0.8, 0.2)).toBeNull();
    expect(computeWacc(0.1, 0.04, null, 0.2)).toBeNull();
  });
});

describe('buildWaccResult — full tagged breakdown', () => {
  const assumptions: WaccAssumptions = {
    riskFreeRate: 0.04,
    equityRiskPremium: 0.055,
    beta: 1.2,
    betaSource: 'estimate',
    costOfDebtMethod: 'historical',
    costOfDebtUser: 0,
  };
  const marketData: DcfMarketData = {
    currentSharePrice: 150,
    marketCapitalization: 800,
    totalDebt: 200,
    cash: 50,
    dilutedSharesOutstanding: 10,
    beta: 1.2,
    interestExpense: 10, // 10/200 = 5% pre-tax cost of debt
  };

  const result = buildWaccResult(assumptions, marketData, 0.25);

  it('tags beta as an estimate when it was sourced from FMP', () => {
    expect(result.beta.source).toBe('estimate');
    expect(result.beta.value).toBe(1.2);
  });

  it('tags market cap and total debt as actual company data', () => {
    expect(result.marketCapitalization.source).toBe('actual');
    expect(result.totalDebt.source).toBe('actual');
  });

  it('calculates cost of debt from historical data when method is "historical"', () => {
    expect(result.preTaxCostOfDebt.source).toBe('calculated');
    expect(result.preTaxCostOfDebt.value).toBeCloseTo(0.05);
  });

  it('switches to a user tag when costOfDebtMethod is "user"', () => {
    const userResult = buildWaccResult({ ...assumptions, costOfDebtMethod: 'user', costOfDebtUser: 0.06 }, marketData, 0.25);
    expect(userResult.preTaxCostOfDebt.source).toBe('user');
    expect(userResult.preTaxCostOfDebt.value).toBe(0.06);
  });

  it('produces a fully calculated final WACC', () => {
    expect(result.wacc.source).toBe('calculated');
    expect(result.wacc.value).not.toBeNull();
    // cost of equity = .04 + 1.2*.055 = .106; after-tax cost of debt = .05*(1-.25) = .0375
    // weights: 800/(800+200) = .8 equity, .2 debt
    // wacc = .8*.106 + .2*.0375 = .0923
    expect(result.wacc.value).toBeCloseTo(0.0923, 4);
  });
});

describe('buildWaccResult — marketCapOverride ("allow the user to provide it" when data is missing)', () => {
  const assumptions: WaccAssumptions = {
    riskFreeRate: 0.04,
    equityRiskPremium: 0.055,
    beta: 1.2,
    betaSource: 'estimate',
    costOfDebtMethod: 'historical',
    costOfDebtUser: 0,
  };
  const marketDataNoCap: DcfMarketData = {
    currentSharePrice: 150,
    marketCapitalization: null, // e.g. no market-data provider configured
    totalDebt: 200,
    cash: 50,
    dilutedSharesOutstanding: 10,
    beta: 1.2,
    interestExpense: 10,
  };

  it('WACC cannot be resolved when market cap is missing and no override is supplied', () => {
    const result = buildWaccResult(assumptions, marketDataNoCap, 0.25);
    expect(result.marketCapitalization.value).toBeNull();
    expect(result.wacc.value).toBeNull();
  });

  it('a user-supplied override unblocks the WACC calculation and is tagged "user", not "actual"', () => {
    const result = buildWaccResult({ ...assumptions, marketCapOverride: 800 }, marketDataNoCap, 0.25);
    expect(result.marketCapitalization.value).toBe(800);
    expect(result.marketCapitalization.source).toBe('user');
    expect(result.wacc.value).not.toBeNull();
    expect(result.wacc.value).toBeCloseTo(0.0923, 4); // identical math to the "actual" case above
  });

  it('a null override falls back to the retrieved market cap, tagged "actual"', () => {
    const marketDataWithCap: DcfMarketData = { ...marketDataNoCap, marketCapitalization: 800 };
    const result = buildWaccResult({ ...assumptions, marketCapOverride: null }, marketDataWithCap, 0.25);
    expect(result.marketCapitalization.source).toBe('actual');
    expect(result.marketCapitalization.value).toBe(800);
  });
});

// The AAPL scenario: a company with real debt whose recent SEC filings don't
// break out a standalone interest-expense figure (a real, general condition —
// not specific to any one company).
describe('WACC when historical cost of debt is unavailable', () => {
  const assumptions: WaccAssumptions = {
    riskFreeRate: 0.04,
    equityRiskPremium: 0.055,
    beta: 1.2,
    betaSource: 'estimate',
    costOfDebtMethod: 'historical',
    costOfDebtUser: 0.05,
  };
  const marketDataWithDebtNoInterestExpense: DcfMarketData = {
    currentSharePrice: 150,
    marketCapitalization: 800,
    totalDebt: 200, // has real debt
    cash: 50,
    dilutedSharesOutstanding: 10,
    beta: 1.2,
    interestExpense: null, // not broken out in recent filings — never inferred from a combined line
  };

  it('WACC cannot be resolved on the historical method — never fabricates a cost of debt from a combined income-statement line', () => {
    const result = buildWaccResult(assumptions, marketDataWithDebtNoInterestExpense, 0.25);
    expect(result.preTaxCostOfDebt.value).toBeNull();
    expect(result.afterTaxCostOfDebt.value).toBeNull();
    expect(result.debtWeight.value).toBeGreaterThan(0); // has debt — this must not be confused with the debt-free case
    expect(result.wacc.value).toBeNull(); // still correctly blocked, not silently computed
  });

  it('switching to the user method with a manually-supplied cost of debt unblocks WACC — this is the existing, intended fallback, exercised explicitly rather than silently', () => {
    const result = buildWaccResult({ ...assumptions, costOfDebtMethod: 'user', costOfDebtUser: 0.045 }, marketDataWithDebtNoInterestExpense, 0.25);
    expect(result.preTaxCostOfDebt.value).toBe(0.045);
    expect(result.preTaxCostOfDebt.source).toBe('user');
    expect(result.wacc.value).not.toBeNull();
  });

  it('a genuinely debt-free company never needs a cost of debt at all — existing behavior, unaffected by this change', () => {
    const debtFree: DcfMarketData = { ...marketDataWithDebtNoInterestExpense, totalDebt: 0 };
    const result = buildWaccResult(assumptions, debtFree, 0.25);
    expect(result.debtWeight.value).toBe(0);
    expect(result.preTaxCostOfDebt.value).toBeNull(); // still not fabricated
    expect(result.wacc.value).not.toBeNull(); // but doesn't block WACC, since the debt term contributes nothing
  });
});
