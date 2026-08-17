import { describe, expect, it } from 'vitest';
import { buildDefaultAssumptions, runDcf } from './engine';
import { DEFAULT_BEAR_DELTAS, DEFAULT_BULL_DELTAS } from './scenarios';
import type { DcfAssumptions, DcfMarketData, HistoricalYear } from './types';

/**
 * A fully hand-verified DCF, independently calculated below (not by running
 * the code) before the assertions were written:
 *
 *   Historical: FY2022 revenue 1,000; FY2023 revenue 1,100 (10% growth),
 *   EBIT margin 20%, tax rate 25%, D&A 5% of revenue, CapEx 6% of revenue,
 *   NWC 10% of revenue throughout.
 *
 *   Every forecast method is 'historical average/growth', so every driver
 *   is a flat percentage of a revenue base compounding at a flat 10%/year
 *   for 3 years:
 *     Revenue:  1,210.00 / 1,331.00 / 1,464.10
 *     EBIT (20%): 242.00 / 266.20 / 292.82
 *     NOPAT (x0.75): 181.50 / 199.65 / 219.615
 *     D&A (5%):    60.50 / 66.55 / 73.205
 *     CapEx (6%):  72.60 / 79.86 / 87.846
 *     NWC level (10%): 121.00 / 133.10 / 146.41 -> ΔNWC: 11.00 / 12.10 / 13.31
 *     Unlevered FCF = NOPAT + D&A - CapEx - ΔNWC:
 *       Y1: 181.50 + 60.50 - 72.60 - 11.00   = 158.40
 *       Y2: 199.65 + 66.55 - 79.86 - 12.10   = 174.24
 *       Y3: 219.615 + 73.205 - 87.846 - 13.31 = 191.664
 *
 *   WACC: risk-free 4% + beta 1.0 x ERP 6% = 10% cost of equity; the
 *   company is debt-free (totalDebt 0), so equity weight = 100% and
 *   WACC = 10% exactly.
 *
 *   Because FCF also compounds at exactly 10%/year (every driver is a flat
 *   % of revenue, which grows at 10%), each year's PV of FCF collapses to
 *   FCF_1 / 1.1 = 158.40 / 1.1 = 144.00 for all three years:
 *     Sum PV of FCF = 144.00 x 3 = 432.00
 *
 *   Terminal value (perpetuity growth, g = 5%):
 *     FCF_4 = 191.664 x 1.05 = 201.2472
 *     TV = 201.2472 / (0.10 - 0.05) = 4,024.944
 *     PV of TV = 4,024.944 / 1.1^3 = 4,024.944 / 1.331 = 3,024.00 exactly
 *
 *   Enterprise Value = 432.00 + 3,024.00 = 3,456.00
 *   Equity Value = 3,456.00 + cash(100) - debt(0) = 3,556.00
 *   Implied Share Price = 3,556.00 / 100 shares = 35.56
 *   Upside vs. a $32.00 current price = 35.56 / 32.00 - 1 = 11.125%
 */
describe('runDcf — manually verified end-to-end case', () => {
  const historicals: HistoricalYear[] = [
    { fiscalYear: 2022, revenue: 1000, revenueGrowth: null, ebit: 200, ebitMargin: 0.2, taxRate: 0.25, da: 50, capex: 60, nwc: 100, changeInNwc: null, unleveredFcf: null },
    { fiscalYear: 2023, revenue: 1100, revenueGrowth: 0.1, ebit: 220, ebitMargin: 0.2, taxRate: 0.25, da: 55, capex: 66, nwc: 110, changeInNwc: 10, unleveredFcf: 144 },
  ];

  const marketData: DcfMarketData = {
    currentSharePrice: 32,
    marketCapitalization: 2000,
    totalDebt: 0,
    cash: 100,
    dilutedSharesOutstanding: 100,
    beta: 1.0,
    interestExpense: 0,
  };

  const assumptions: DcfAssumptions = {
    forecastYears: 3,
    revenue: { method: 'historicalGrowth', userGrowthRates: [], fadeStartGrowth: 0, fadeEndGrowth: 0 },
    margin: { method: 'historicalAverage', userMargin: 0, gradualStartMargin: 0, gradualEndMargin: 0 },
    tax: { method: 'historical', userRate: 0 },
    da: { method: 'historicalAverage', percentOfRevenue: 0, flatAmount: 0 },
    capex: { method: 'historicalAverage', percentOfRevenue: 0, flatAmount: 0 },
    nwc: { method: 'historicalAverage', percentOfRevenue: 0, flatAmount: 0 },
    wacc: { riskFreeRate: 0.04, equityRiskPremium: 0.06, beta: 1.0, betaSource: 'estimate', costOfDebtMethod: 'historical', costOfDebtUser: 0 },
    terminalValue: { method: 'perpetuityGrowth', perpetuityGrowthRate: 0.05, exitMultiple: 10 },
  };

  const result = runDcf({ historicals, marketData, assumptions });

  it('is valid with no blocking issues', () => {
    expect(result.isValid).toBe(true);
    expect(result.issues.filter((i) => i.severity === 'ERROR')).toHaveLength(0);
  });

  it('forecasts revenue by compounding the historical growth rate', () => {
    expect(result.forecast.map((y) => y.revenue)).toEqual([
      expect.closeTo(1210, 6),
      expect.closeTo(1331, 6),
      expect.closeTo(1464.1, 6),
    ]);
  });

  it('forecasts unlevered FCF matching the independently-calculated figures', () => {
    expect(result.forecast.map((y) => y.unleveredFcf)).toEqual([
      expect.closeTo(158.4, 6),
      expect.closeTo(174.24, 6),
      expect.closeTo(191.664, 6),
    ]);
  });

  it('computes WACC = 10% for a debt-free company with beta 1.0', () => {
    expect(result.wacc.wacc.value).toBeCloseTo(0.1, 9);
    expect(result.wacc.wacc.source).toBe('calculated');
  });

  it('sums the present value of forecast FCF to exactly 432', () => {
    expect(result.pvOfForecastFcf).toBeCloseTo(432, 4);
  });

  it('computes the perpetuity-growth terminal value and its present value', () => {
    expect(result.terminalValue.undiscountedValue).toBeCloseTo(4024.944, 3);
    expect(result.terminalValue.presentValue).toBeCloseTo(3024, 3);
  });

  it('computes Enterprise Value = PV(FCF) + PV(TV) = 3,456', () => {
    expect(result.enterpriseValue).toBeCloseTo(3456, 3);
  });

  it('computes Equity Value = EV + Cash - Debt = 3,556', () => {
    expect(result.equityValue).toBeCloseTo(3556, 3);
  });

  it('computes Implied Share Price = Equity Value / Diluted Shares = 35.56', () => {
    expect(result.impliedSharePrice).toBeCloseTo(35.56, 4);
  });

  it('computes upside vs. the current price = 11.125%', () => {
    expect(result.upsideDownside).toBeCloseTo(0.11125, 5);
  });
});

describe('runDcf — scenario deltas', () => {
  const historicals: HistoricalYear[] = [
    { fiscalYear: 2022, revenue: 1000, revenueGrowth: null, ebit: 200, ebitMargin: 0.2, taxRate: 0.25, da: 50, capex: 60, nwc: 100, changeInNwc: null, unleveredFcf: null },
    { fiscalYear: 2023, revenue: 1100, revenueGrowth: 0.1, ebit: 220, ebitMargin: 0.2, taxRate: 0.25, da: 55, capex: 66, nwc: 110, changeInNwc: 10, unleveredFcf: 144 },
  ];
  const marketData: DcfMarketData = {
    currentSharePrice: 32,
    marketCapitalization: 2000,
    totalDebt: 0,
    cash: 100,
    dilutedSharesOutstanding: 100,
    beta: 1.0,
    interestExpense: 0,
  };
  const assumptions = (): DcfAssumptions => ({
    forecastYears: 5,
    revenue: { method: 'historicalGrowth', userGrowthRates: [], fadeStartGrowth: 0, fadeEndGrowth: 0 },
    margin: { method: 'historicalAverage', userMargin: 0, gradualStartMargin: 0, gradualEndMargin: 0 },
    tax: { method: 'historical', userRate: 0 },
    da: { method: 'historicalAverage', percentOfRevenue: 0, flatAmount: 0 },
    capex: { method: 'historicalAverage', percentOfRevenue: 0, flatAmount: 0 },
    nwc: { method: 'historicalAverage', percentOfRevenue: 0, flatAmount: 0 },
    wacc: { riskFreeRate: 0.04, equityRiskPremium: 0.06, beta: 1.0, betaSource: 'estimate', costOfDebtMethod: 'historical', costOfDebtUser: 0 },
    terminalValue: { method: 'perpetuityGrowth', perpetuityGrowthRate: 0.02, exitMultiple: 10 },
  });

  const base = runDcf({ historicals, marketData, assumptions: assumptions() });
  const bear = runDcf({ historicals, marketData, assumptions: assumptions(), scenarioDeltas: DEFAULT_BEAR_DELTAS });
  const bull = runDcf({ historicals, marketData, assumptions: assumptions(), scenarioDeltas: DEFAULT_BULL_DELTAS });

  it('orders implied share price Bear < Base < Bull', () => {
    expect(bear.impliedSharePrice).not.toBeNull();
    expect(base.impliedSharePrice).not.toBeNull();
    expect(bull.impliedSharePrice).not.toBeNull();
    expect(bear.impliedSharePrice!).toBeLessThan(base.impliedSharePrice!);
    expect(base.impliedSharePrice!).toBeLessThan(bull.impliedSharePrice!);
  });

  it('raises WACC for the bear case and lowers it for the bull case', () => {
    expect(bear.wacc.wacc.value!).toBeGreaterThan(base.wacc.wacc.value!);
    expect(bull.wacc.wacc.value!).toBeLessThan(base.wacc.wacc.value!);
  });

  it('lowers forecast revenue growth for bear and raises it for bull', () => {
    expect(bear.forecast[0]!.revenueGrowth).toBeLessThan(base.forecast[0]!.revenueGrowth);
    expect(bull.forecast[0]!.revenueGrowth).toBeGreaterThan(base.forecast[0]!.revenueGrowth);
  });
});

describe('runDcf — invalid inputs never silently produce a number', () => {
  const historicals: HistoricalYear[] = [
    { fiscalYear: 2023, revenue: 1000, revenueGrowth: null, ebit: 200, ebitMargin: 0.2, taxRate: 0.25, da: 50, capex: 60, nwc: 100, changeInNwc: null, unleveredFcf: null },
  ];
  const marketData: DcfMarketData = {
    currentSharePrice: 32,
    marketCapitalization: 2000,
    totalDebt: 0,
    cash: 100,
    dilutedSharesOutstanding: 100,
    beta: 1.0,
    interestExpense: 0,
  };
  const baseAssumptions: DcfAssumptions = {
    forecastYears: 3,
    revenue: { method: 'userGrowth', userGrowthRates: [0.1, 0.1, 0.1], fadeStartGrowth: 0, fadeEndGrowth: 0 },
    margin: { method: 'user', userMargin: 0.2, gradualStartMargin: 0, gradualEndMargin: 0 },
    tax: { method: 'user', userRate: 0.25 },
    da: { method: 'percentOfRevenue', percentOfRevenue: 0.05, flatAmount: 0 },
    capex: { method: 'percentOfRevenue', percentOfRevenue: 0.06, flatAmount: 0 },
    nwc: { method: 'percentOfRevenue', percentOfRevenue: 0.1, flatAmount: 0 },
    wacc: { riskFreeRate: 0.04, equityRiskPremium: 0.06, beta: 1.0, betaSource: 'estimate', costOfDebtMethod: 'historical', costOfDebtUser: 0 },
    terminalValue: { method: 'perpetuityGrowth', perpetuityGrowthRate: 0.02, exitMultiple: 10 },
  };

  it('a perpetuity growth rate >= WACC blocks the result — never a fake share price', () => {
    const result = runDcf({
      historicals,
      marketData,
      assumptions: { ...baseAssumptions, terminalValue: { method: 'perpetuityGrowth', perpetuityGrowthRate: 0.11, exitMultiple: 10 } },
    });
    expect(result.isValid).toBe(false);
    expect(result.issues.some((i) => i.field === 'terminalValue.perpetuityGrowthRate' && i.severity === 'ERROR')).toBe(true);
    expect(result.impliedSharePrice).toBeNull();
  });

  it('missing diluted shares outstanding blocks the implied share price specifically', () => {
    const result = runDcf({
      historicals,
      marketData: { ...marketData, dilutedSharesOutstanding: null },
      assumptions: baseAssumptions,
    });
    expect(result.isValid).toBe(false);
    expect(result.impliedSharePrice).toBeNull();
    // Enterprise value doesn't depend on shares outstanding — it should still compute.
    expect(result.enterpriseValue).not.toBeNull();
  });

  it('missing total debt blocks the equity bridge — and, because debt also feeds the WACC capital structure, the discount rate and everything downstream of it too', () => {
    const result = runDcf({ historicals, marketData: { ...marketData, totalDebt: null }, assumptions: baseAssumptions });
    expect(result.isValid).toBe(false);
    expect(result.wacc.wacc.value).toBeNull();
    expect(result.equityValue).toBeNull();
    expect(result.impliedSharePrice).toBeNull();
  });


  it('no historical revenue at all blocks the whole model', () => {
    const result = runDcf({ historicals: [], marketData, assumptions: baseAssumptions });
    expect(result.isValid).toBe(false);
    expect(result.forecast).toHaveLength(0);
    expect(result.impliedSharePrice).toBeNull();
  });
});

describe('runDcf — waccOverride (used by the sensitivity grid)', () => {
  const historicals: HistoricalYear[] = [
    { fiscalYear: 2022, revenue: 1000, revenueGrowth: null, ebit: 200, ebitMargin: 0.2, taxRate: 0.25, da: 50, capex: 60, nwc: 100, changeInNwc: null, unleveredFcf: null },
    { fiscalYear: 2023, revenue: 1100, revenueGrowth: 0.1, ebit: 220, ebitMargin: 0.2, taxRate: 0.25, da: 55, capex: 66, nwc: 110, changeInNwc: 10, unleveredFcf: 144 },
  ];
  const marketData: DcfMarketData = {
    currentSharePrice: 32,
    marketCapitalization: 2000,
    totalDebt: 0,
    cash: 100,
    dilutedSharesOutstanding: 100,
    beta: 1.0,
    interestExpense: 0,
  };
  const assumptions: DcfAssumptions = {
    forecastYears: 3,
    revenue: { method: 'historicalGrowth', userGrowthRates: [], fadeStartGrowth: 0, fadeEndGrowth: 0 },
    margin: { method: 'historicalAverage', userMargin: 0, gradualStartMargin: 0, gradualEndMargin: 0 },
    tax: { method: 'historical', userRate: 0 },
    da: { method: 'historicalAverage', percentOfRevenue: 0, flatAmount: 0 },
    capex: { method: 'historicalAverage', percentOfRevenue: 0, flatAmount: 0 },
    nwc: { method: 'historicalAverage', percentOfRevenue: 0, flatAmount: 0 },
    wacc: { riskFreeRate: 0.04, equityRiskPremium: 0.06, beta: 1.0, betaSource: 'estimate', costOfDebtMethod: 'historical', costOfDebtUser: 0 },
    terminalValue: { method: 'perpetuityGrowth', perpetuityGrowthRate: 0.05, exitMultiple: 10 },
  };

  it('discounts using the override rather than the calculated WACC', () => {
    const calculated = runDcf({ historicals, marketData, assumptions });
    const overridden = runDcf({ historicals, marketData, assumptions, waccOverride: 0.2 });
    // A higher discount rate must lower every present value.
    expect(overridden.impliedSharePrice!).toBeLessThan(calculated.impliedSharePrice!);
  });

  it('still reports the calculated WACC breakdown on `wacc` even when overridden', () => {
    const overridden = runDcf({ historicals, marketData, assumptions, waccOverride: 0.2 });
    expect(overridden.wacc.wacc.value).toBeCloseTo(0.1, 9); // unchanged calculated value, not 0.2
  });

  it('an override that violates WACC > terminal growth still surfaces as invalid', () => {
    const overridden = runDcf({ historicals, marketData, assumptions, waccOverride: 0.03 }); // < g of 0.05
    expect(overridden.isValid).toBe(false);
    expect(overridden.impliedSharePrice).toBeNull();
  });
});

describe('runDcf — marketCapOverride unblocks the full pipeline when FMP data is unavailable', () => {
  const historicals: HistoricalYear[] = [
    { fiscalYear: 2022, revenue: 1000, revenueGrowth: null, ebit: 200, ebitMargin: 0.2, taxRate: 0.25, da: 50, capex: 60, nwc: 100, changeInNwc: null, unleveredFcf: null },
    { fiscalYear: 2023, revenue: 1100, revenueGrowth: 0.1, ebit: 220, ebitMargin: 0.2, taxRate: 0.25, da: 55, capex: 66, nwc: 110, changeInNwc: 10, unleveredFcf: 144 },
  ];
  const marketDataNoCap: DcfMarketData = {
    currentSharePrice: 32,
    marketCapitalization: null,
    totalDebt: 0,
    cash: 100,
    dilutedSharesOutstanding: 100,
    beta: 1.0,
    interestExpense: 0,
  };
  const assumptions: DcfAssumptions = {
    forecastYears: 3,
    revenue: { method: 'historicalGrowth', userGrowthRates: [], fadeStartGrowth: 0, fadeEndGrowth: 0 },
    margin: { method: 'historicalAverage', userMargin: 0, gradualStartMargin: 0, gradualEndMargin: 0 },
    tax: { method: 'historical', userRate: 0 },
    da: { method: 'historicalAverage', percentOfRevenue: 0, flatAmount: 0 },
    capex: { method: 'historicalAverage', percentOfRevenue: 0, flatAmount: 0 },
    nwc: { method: 'historicalAverage', percentOfRevenue: 0, flatAmount: 0 },
    wacc: { riskFreeRate: 0.04, equityRiskPremium: 0.06, beta: 1.0, betaSource: 'estimate', costOfDebtMethod: 'historical', costOfDebtUser: 0 },
    terminalValue: { method: 'perpetuityGrowth', perpetuityGrowthRate: 0.05, exitMultiple: 10 },
  };

  it('is blocked with no market cap and no override', () => {
    const result = runDcf({ historicals, marketData: marketDataNoCap, assumptions });
    expect(result.isValid).toBe(false);
    expect(result.impliedSharePrice).toBeNull();
  });

  it('resolves to the same result as a fully-populated market cap once the user supplies the override', () => {
    const overridden = runDcf({
      historicals,
      marketData: marketDataNoCap,
      assumptions: { ...assumptions, wacc: { ...assumptions.wacc, marketCapOverride: 2000 } },
    });
    const withRealData = runDcf({ historicals, marketData: { ...marketDataNoCap, marketCapitalization: 2000 }, assumptions });

    expect(overridden.isValid).toBe(true);
    expect(overridden.impliedSharePrice).toBeCloseTo(withRealData.impliedSharePrice!, 6);
    expect(overridden.wacc.marketCapitalization.source).toBe('user');
  });
});

describe('buildDefaultAssumptions', () => {
  it('defaults every method to a historical/neutral basis — never an automatically bullish assumption', () => {
    const marketData: DcfMarketData = {
      currentSharePrice: 100,
      marketCapitalization: 1000,
      totalDebt: 200,
      cash: 50,
      dilutedSharesOutstanding: 10,
      beta: 1.3,
      interestExpense: 10,
    };
    const assumptions = buildDefaultAssumptions(marketData);

    expect(assumptions.revenue.method).toBe('historicalGrowth');
    expect(assumptions.margin.method).toBe('historicalAverage'); // not 'gradual' expansion
    expect(assumptions.tax.method).toBe('historical');
    expect(assumptions.da.method).toBe('historicalAverage');
    expect(assumptions.capex.method).toBe('historicalAverage');
    expect(assumptions.nwc.method).toBe('historicalAverage');
  });

  it('uses the FMP-sourced beta when available, tagged as an estimate', () => {
    const marketData: DcfMarketData = {
      currentSharePrice: 100,
      marketCapitalization: 1000,
      totalDebt: 200,
      cash: 50,
      dilutedSharesOutstanding: 10,
      beta: 1.3,
      interestExpense: 10,
    };
    const assumptions = buildDefaultAssumptions(marketData);
    expect(assumptions.wacc.beta).toBe(1.3);
    expect(assumptions.wacc.betaSource).toBe('estimate');
  });

  it('falls back to a market-neutral beta of 1.0, tagged as a user assumption, when FMP has none', () => {
    const marketData: DcfMarketData = {
      currentSharePrice: null,
      marketCapitalization: null,
      totalDebt: null,
      cash: null,
      dilutedSharesOutstanding: null,
      beta: null,
      interestExpense: null,
    };
    const assumptions = buildDefaultAssumptions(marketData);
    expect(assumptions.wacc.beta).toBe(1.0);
    expect(assumptions.wacc.betaSource).toBe('user');
  });
});
