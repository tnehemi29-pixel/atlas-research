import { describe, expect, it } from 'vitest';
import type { DcfAssumptions, DcfMarketData, ForecastYear, HistoricalYear } from './types';
import { validateDcfInputs, validateForecast } from './validate';

function makeHistoricals(): HistoricalYear[] {
  return [
    {
      fiscalYear: 2023,
      revenue: 1000,
      revenueGrowth: null,
      ebit: 200,
      ebitMargin: 0.2,
      taxRate: 0.21,
      da: 40,
      capex: 60,
      nwc: 150,
      changeInNwc: null,
      unleveredFcf: null,
    },
  ];
}

function makeMarketData(overrides: Partial<DcfMarketData> = {}): DcfMarketData {
  return {
    currentSharePrice: 100,
    marketCapitalization: 5000,
    totalDebt: 500,
    cash: 300,
    dilutedSharesOutstanding: 50,
    beta: 1.1,
    interestExpense: 20,
    ...overrides,
  };
}

function makeAssumptions(overrides: Partial<DcfAssumptions> = {}): DcfAssumptions {
  return {
    forecastYears: 5,
    revenue: { method: 'historicalGrowth', userGrowthRates: [], fadeStartGrowth: 0, fadeEndGrowth: 0 },
    margin: { method: 'historicalAverage', userMargin: 0, gradualStartMargin: 0, gradualEndMargin: 0 },
    tax: { method: 'historical', userRate: 0 },
    da: { method: 'historicalAverage', percentOfRevenue: 0, flatAmount: 0 },
    capex: { method: 'historicalAverage', percentOfRevenue: 0, flatAmount: 0 },
    nwc: { method: 'historicalAverage', percentOfRevenue: 0, flatAmount: 0 },
    wacc: { riskFreeRate: 0.04, equityRiskPremium: 0.05, beta: 1.1, betaSource: 'estimate', costOfDebtMethod: 'historical', costOfDebtUser: 0 },
    terminalValue: { method: 'perpetuityGrowth', perpetuityGrowthRate: 0.025, exitMultiple: 10 },
    ...overrides,
  };
}

describe('validateDcfInputs', () => {
  it('passes clean on a fully-populated, self-consistent input set', () => {
    const issues = validateDcfInputs(makeHistoricals(), makeMarketData(), makeAssumptions(), 0.09);
    expect(issues.filter((i) => i.severity === 'ERROR')).toHaveLength(0);
  });

  it('flags missing historical revenue as blocking', () => {
    const issues = validateDcfInputs([], makeMarketData(), makeAssumptions(), 0.09);
    expect(issues.some((i) => i.field === 'historicals' && i.severity === 'ERROR')).toBe(true);
  });

  it('flags missing diluted shares outstanding as blocking', () => {
    const issues = validateDcfInputs(
      makeHistoricals(),
      makeMarketData({ dilutedSharesOutstanding: null }),
      makeAssumptions(),
      0.09,
    );
    expect(issues.some((i) => i.field === 'dilutedSharesOutstanding' && i.severity === 'ERROR')).toBe(true);
  });

  it('flags missing total debt and missing cash independently', () => {
    const debtIssues = validateDcfInputs(makeHistoricals(), makeMarketData({ totalDebt: null }), makeAssumptions(), 0.09);
    expect(debtIssues.some((i) => i.field === 'totalDebt')).toBe(true);

    const cashIssues = validateDcfInputs(makeHistoricals(), makeMarketData({ cash: null }), makeAssumptions(), 0.09);
    expect(cashIssues.some((i) => i.field === 'cash')).toBe(true);
  });

  it('flags missing current price as a warning, not blocking', () => {
    const issues = validateDcfInputs(makeHistoricals(), makeMarketData({ currentSharePrice: null }), makeAssumptions(), 0.09);
    const priceIssue = issues.find((i) => i.field === 'currentSharePrice');
    expect(priceIssue?.severity).toBe('WARNING');
  });

  it('flags WACC <= terminal growth as blocking (the exact invalid-combination case the spec calls out)', () => {
    const issues = validateDcfInputs(
      makeHistoricals(),
      makeMarketData(),
      makeAssumptions({ terminalValue: { method: 'perpetuityGrowth', perpetuityGrowthRate: 0.09, exitMultiple: 10 } }),
      0.09, // wacc == growth
    );
    expect(issues.some((i) => i.field === 'terminalValue.perpetuityGrowthRate' && i.severity === 'ERROR')).toBe(true);
  });

  it('does not flag terminal growth when using the exit-multiple method instead', () => {
    const issues = validateDcfInputs(
      makeHistoricals(),
      makeMarketData(),
      makeAssumptions({ terminalValue: { method: 'exitMultiple', perpetuityGrowthRate: 0.09, exitMultiple: 10 } }),
      0.09,
    );
    expect(issues.some((i) => i.field === 'terminalValue.perpetuityGrowthRate')).toBe(false);
  });

  it('flags an unresolvable WACC as blocking', () => {
    const issues = validateDcfInputs(makeHistoricals(), makeMarketData(), makeAssumptions(), null);
    expect(issues.some((i) => i.field === 'wacc' && i.severity === 'ERROR')).toBe(true);
  });

  it('flags a non-positive WACC as blocking', () => {
    const issues = validateDcfInputs(makeHistoricals(), makeMarketData(), makeAssumptions(), -0.01);
    expect(issues.some((i) => i.field === 'wacc' && i.severity === 'ERROR')).toBe(true);
  });

  it('flags an out-of-range forecast horizon', () => {
    const issues = validateDcfInputs(makeHistoricals(), makeMarketData(), makeAssumptions({ forecastYears: 4 as never }), 0.09);
    expect(issues.some((i) => i.field === 'forecastYears')).toBe(true);
  });
});

function makeForecastYear(overrides: Partial<ForecastYear> = {}): ForecastYear {
  return {
    yearIndex: 1,
    fiscalYear: 2024,
    revenueGrowth: 0.08,
    revenue: 1080,
    ebitMargin: 0.2,
    ebit: 216,
    taxRate: 0.21,
    nopat: 170.64,
    da: 43.2,
    capex: 64.8,
    nwc: 162,
    changeInNwc: 12,
    unleveredFcf: 137.04,
    discountFactor: 0.917,
    presentValueOfFcf: 125.7,
    ...overrides,
  };
}

describe('validateForecast', () => {
  it('passes clean when every year has positive revenue', () => {
    const issues = validateForecast([makeForecastYear()]);
    expect(issues).toHaveLength(0);
  });

  it('flags zero or negative projected revenue', () => {
    const issues = validateForecast([makeForecastYear({ revenue: -50 })]);
    expect(issues.some((i) => i.severity === 'ERROR')).toBe(true);
  });
});
