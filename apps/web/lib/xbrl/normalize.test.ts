import { describe, expect, it } from 'vitest';
import { normalizeCompanyFacts } from './normalize';
import { appleShapedFacts } from './__fixtures__/appleShaped';
import { jpMorganShapedFacts } from './__fixtures__/jpMorganShaped';

describe('normalizeCompanyFacts — Apple-shaped filer (ASC 606 revenue tag, has inventory)', () => {
  const periods = normalizeCompanyFacts(appleShapedFacts);
  const annual = periods
    .filter((p) => p.periodType === 'annual')
    .sort((a, b) => a.fiscalYear - b.fiscalYear);
  const quarterly = periods.filter((p) => p.periodType === 'quarterly');

  it('derives fiscal year from calendar dates, not the fy/fp metadata', () => {
    expect(annual.map((p) => p.fiscalYear)).toEqual([2022, 2023]);
    expect(annual[0]?.periodEnd.toISOString().slice(0, 10)).toBe('2022-09-24');
  });

  it('prefers the latest-filed value for a restated period (10-K/A wins)', () => {
    const fy2023 = annual.find((p) => p.fiscalYear === 2023);
    // Original 10-K reported 110B; the 10-K/A restated it to 111B and was
    // filed later — the restated value must win.
    expect(fy2023?.incomeStatement.revenue).toBe(111_000_000_000);
    expect(fy2023?.sources.revenue?.filing.form).toBe('10-K/A');
  });

  it('maps every declared field, using null (not undefined or 0) for genuinely untagged concepts', () => {
    const fy2022 = annual.find((p) => p.fiscalYear === 2022);
    expect(fy2022?.incomeStatement.revenue).toBe(100_000_000_000);
    expect(fy2022?.incomeStatement.costOfRevenue).toBe(60_000_000_000);
    expect(fy2022?.incomeStatement.netIncome).toBe(25_000_000_000);
    expect(fy2022?.incomeStatement.dilutedEps).toBe(1.5);
    expect(fy2022?.balanceSheet.totalAssets).toBe(300_000_000_000);
    // No GrossProfit tag in the fixture at all.
    expect(fy2022?.incomeStatement.grossProfit).toBeNull();
  });

  it('resolves basic and diluted shares outstanding as separate fields', () => {
    const fy2023 = annual.find((p) => p.fiscalYear === 2023);
    expect(fy2023?.incomeStatement.basicSharesOutstanding).toBe(15_700_000_000);
    expect(fy2023?.incomeStatement.dilutedSharesOutstanding).toBe(15_900_000_000);
    // FY2022 has neither tag — must be null, not 0 or the FY2023 value leaking backward.
    const fy2022 = annual.find((p) => p.fiscalYear === 2022);
    expect(fy2022?.incomeStatement.basicSharesOutstanding).toBeNull();
    expect(fy2022?.incomeStatement.dilutedSharesOutstanding).toBeNull();
  });

  it('computes free cash flow as operating cash flow minus capex', () => {
    const fy2023 = annual.find((p) => p.fiscalYear === 2023);
    expect(fy2023?.cashFlow.operatingCashFlow).toBe(40_000_000_000);
    expect(fy2023?.cashFlow.capex).toBe(10_000_000_000);
    expect(fy2023?.cashFlow.freeCashFlow).toBe(30_000_000_000);
  });

  it('buckets a quarterly-duration fact separately from annual ones', () => {
    expect(quarterly).toHaveLength(1);
    expect(quarterly[0]?.fiscalPeriod).toBe('Q1');
    expect(quarterly[0]?.incomeStatement.revenue).toBe(30_000_000_000);
    expect(quarterly[0]?.balanceSheet.totalAssets).toBe(330_000_000_000);
  });
});

describe('normalizeCompanyFacts — bank-shaped filer (no CostOfRevenue/Inventory tags)', () => {
  const periods = normalizeCompanyFacts(jpMorganShapedFacts);
  const annual = periods
    .filter((p) => p.periodType === 'annual')
    .sort((a, b) => a.fiscalYear - b.fiscalYear);
  const quarterly = periods.filter((p) => p.periodType === 'quarterly');

  it('resolves revenue via the Revenues tag (no ASC 606 contract-revenue tag present)', () => {
    const fy2023 = annual.find((p) => p.fiscalYear === 2023);
    expect(fy2023?.incomeStatement.revenue).toBe(130_000_000_000);
    expect(fy2023?.sources.revenue?.tag).toBe('Revenues');
  });

  it('leaves cost-of-revenue and inventory null rather than fabricating zero', () => {
    for (const period of periods) {
      expect(period.incomeStatement.costOfRevenue).toBeNull();
      expect(period.balanceSheet.inventory).toBeNull();
    }
  });

  it('does not invent a quarterly revenue figure when only annual is tagged', () => {
    expect(quarterly).toHaveLength(1);
    expect(quarterly[0]?.incomeStatement.revenue).toBeNull();
    // But the quarterly EPS fact that *is* tagged should still come through.
    expect(quarterly[0]?.incomeStatement.dilutedEps).toBe(2.5);
  });

  it('still resolves balance sheet fields common to both statement structures', () => {
    const fy2023 = annual.find((p) => p.fiscalYear === 2023);
    expect(fy2023?.balanceSheet.totalAssets).toBe(3_200_000_000_000);
    expect(fy2023?.balanceSheet.totalLiabilities).toBe(2_880_000_000_000);
    expect(fy2023?.balanceSheet.stockholdersEquity).toBe(320_000_000_000);
  });
});
