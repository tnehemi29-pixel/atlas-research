import { describe, expect, it } from 'vitest';
import type { FinancialPeriodData } from '@erp/types';
import { EMPTY_BALANCE_SHEET, EMPTY_CASH_FLOW, EMPTY_INCOME_STATEMENT } from '@/lib/xbrl/persist';
import { computeNwc, deriveHistoricalYears, historicalTaxRate } from './historicals';

describe('historicalTaxRate', () => {
  it('income tax / pretax income', () => {
    expect(historicalTaxRate(21, 100)).toBeCloseTo(0.21);
  });

  it('excludes a year with zero or negative pretax income rather than dividing by it', () => {
    expect(historicalTaxRate(5, 0)).toBeNull();
    expect(historicalTaxRate(5, -50)).toBeNull();
  });

  it('excludes an implausible rate outside [-50%, 100%] — a real edge case, not a fabricated bound', () => {
    expect(historicalTaxRate(500, 100)).toBeNull(); // 500% effective rate
    expect(historicalTaxRate(-80, 100)).toBeNull(); // -80% effective rate
  });

  it('is null when either input is missing', () => {
    expect(historicalTaxRate(null, 100)).toBeNull();
    expect(historicalTaxRate(21, null)).toBeNull();
  });
});

describe('computeNwc', () => {
  it('(CurrentAssets - Cash) - (CurrentLiabilities - ShortTermDebt)', () => {
    const nwc = computeNwc({
      ...EMPTY_BALANCE_SHEET,
      totalCurrentAssets: 500,
      cashAndEquivalents: 100,
      totalCurrentLiabilities: 300,
      shortTermDebt: 50,
    });
    // (500-100) - (300-50) = 400 - 250 = 150
    expect(nwc).toBe(150);
  });

  it('falls back to the simpler gross-working-capital formula when cash/short-term-debt are unavailable', () => {
    const nwc = computeNwc({
      ...EMPTY_BALANCE_SHEET,
      totalCurrentAssets: 500,
      totalCurrentLiabilities: 300,
    });
    expect(nwc).toBe(200); // 500 - 300, no exclusions applied
  });

  it('is null when current assets or current liabilities are missing — the essential inputs', () => {
    expect(computeNwc({ ...EMPTY_BALANCE_SHEET, totalCurrentLiabilities: 300 })).toBeNull();
    expect(computeNwc({ ...EMPTY_BALANCE_SHEET, totalCurrentAssets: 500 })).toBeNull();
  });
});

function period(fiscalYear: number, overrides: Partial<FinancialPeriodData> = {}): FinancialPeriodData {
  return {
    fiscalYear,
    fiscalPeriod: 'FY',
    periodType: 'annual',
    periodStart: `${fiscalYear - 1}-01-01`,
    periodEnd: `${fiscalYear}-12-31`,
    filingType: '10-K',
    filingDate: `${fiscalYear}-12-31`,
    incomeStatement: { ...EMPTY_INCOME_STATEMENT },
    balanceSheet: { ...EMPTY_BALANCE_SHEET },
    cashFlow: { ...EMPTY_CASH_FLOW },
    ...overrides,
  };
}

describe('deriveHistoricalYears', () => {
  const periods: FinancialPeriodData[] = [
    period(2022, {
      incomeStatement: { ...EMPTY_INCOME_STATEMENT, revenue: 1000, operatingIncome: 200, incomeTax: 42, pretaxIncome: 200 },
      balanceSheet: { ...EMPTY_BALANCE_SHEET, totalCurrentAssets: 500, cashAndEquivalents: 100, totalCurrentLiabilities: 300, shortTermDebt: 50 },
      cashFlow: { ...EMPTY_CASH_FLOW, depreciationAmortization: 40, capex: 60 },
    }),
    period(2023, {
      incomeStatement: { ...EMPTY_INCOME_STATEMENT, revenue: 1100, operatingIncome: 231, incomeTax: 48.51, pretaxIncome: 231 },
      balanceSheet: { ...EMPTY_BALANCE_SHEET, totalCurrentAssets: 560, cashAndEquivalents: 120, totalCurrentLiabilities: 330, shortTermDebt: 55 },
      cashFlow: { ...EMPTY_CASH_FLOW, depreciationAmortization: 44, capex: 66 },
    }),
  ];

  const years = deriveHistoricalYears(periods);

  it('sorts oldest first and leaves the first year without a growth rate', () => {
    expect(years.map((y) => y.fiscalYear)).toEqual([2022, 2023]);
    expect(years[0]?.revenueGrowth).toBeNull();
  });

  it('computes revenue growth for subsequent years', () => {
    expect(years[1]?.revenueGrowth).toBeCloseTo(0.1); // 1100/1000 - 1
  });

  it('computes EBIT margin', () => {
    expect(years[0]?.ebitMargin).toBeCloseTo(0.2); // 200/1000
  });

  it('computes the effective tax rate', () => {
    expect(years[0]?.taxRate).toBeCloseTo(0.21); // 42/200
  });

  it('computes NWC and its year-over-year change', () => {
    // 2022 NWC = (500-100)-(300-50) = 150; 2023 NWC = (560-120)-(330-55) = 165
    expect(years[0]?.nwc).toBe(150);
    expect(years[1]?.nwc).toBe(165);
    expect(years[1]?.changeInNwc).toBeCloseTo(15);
    expect(years[0]?.changeInNwc).toBeNull(); // no prior year to diff against
  });

  it('computes unlevered FCF using the same formula as the forecast engine', () => {
    // 2022: EBIT 200, tax 21% -> NOPAT 158; +40 D&A -60 capex - null(no prior NWC) dNWC -> null overall
    expect(years[0]?.unleveredFcf).toBeNull();
    // 2023: EBIT 231, tax rate 48.51/231=0.21 -> NOPAT 182.49; +44 -66 -15 = 145.49
    expect(years[1]?.unleveredFcf).toBeCloseTo(145.49, 2);
  });

  it('leaves a field null (not 0) when its underlying data is missing, without breaking the rest of the row', () => {
    const sparse = deriveHistoricalYears([period(2021)]);
    expect(sparse[0]?.revenue).toBeNull();
    expect(sparse[0]?.ebitMargin).toBeNull();
    expect(sparse[0]?.unleveredFcf).toBeNull();
  });
});
