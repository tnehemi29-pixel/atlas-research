import { describe, expect, it } from 'vitest';
import {
  checkBalanceSheetReconciliation,
  checkCashRollForwardReconciliation,
  checkFreeCashFlowReconciliation,
  checkGrossProfitReconciliation,
  checkOperatingIncomeReconciliation,
  runFinancialReconciliation,
} from './financialReconciliation';

describe('checkBalanceSheetReconciliation', () => {
  it('passes when Assets = Liabilities + Equity exactly', () => {
    const result = checkBalanceSheetReconciliation({ totalAssets: 500_000_000, totalLiabilities: 300_000_000, stockholdersEquity: 200_000_000 });
    expect(result.checkable).toBe(true);
    expect(result.passed).toBe(true);
  });

  it('passes within the tolerance floor for small rounding differences', () => {
    const result = checkBalanceSheetReconciliation({ totalAssets: 500_000_500, totalLiabilities: 300_000_000, stockholdersEquity: 200_000_000 });
    expect(result.passed).toBe(true);
  });

  it('fails when assets materially do not equal liabilities + equity', () => {
    const result = checkBalanceSheetReconciliation({ totalAssets: 550_000_000, totalLiabilities: 300_000_000, stockholdersEquity: 200_000_000 });
    expect(result.checkable).toBe(true);
    expect(result.passed).toBe(false);
    expect(result.differenceAbsolute).toBe(50_000_000);
  });

  it('is not checkable when a required figure is missing — never treated as a failure', () => {
    const result = checkBalanceSheetReconciliation({ totalAssets: 500_000_000, totalLiabilities: null, stockholdersEquity: 200_000_000 });
    expect(result.checkable).toBe(false);
  });
});

describe('checkGrossProfitReconciliation', () => {
  it('passes when Gross Profit = Revenue - COGS', () => {
    const result = checkGrossProfitReconciliation({ revenue: 1_000_000_000, costOfRevenue: 600_000_000, grossProfit: 400_000_000 });
    expect(result.passed).toBe(true);
  });

  it('fails on a material mismatch', () => {
    const result = checkGrossProfitReconciliation({ revenue: 1_000_000_000, costOfRevenue: 600_000_000, grossProfit: 300_000_000 });
    expect(result.passed).toBe(false);
  });
});

describe('checkOperatingIncomeReconciliation', () => {
  it('passes when Operating Income = Gross Profit - OpEx', () => {
    const result = checkOperatingIncomeReconciliation({ grossProfit: 400_000_000, operatingExpenses: 150_000_000, operatingIncome: 250_000_000 });
    expect(result.passed).toBe(true);
  });
});

describe('checkFreeCashFlowReconciliation', () => {
  it('passes when FCF = OCF - Capex (reuses the shared calculateFreeCashFlow formula)', () => {
    const result = checkFreeCashFlowReconciliation({ operatingCashFlow: 300_000_000, capex: 50_000_000, freeCashFlow: 250_000_000 });
    expect(result.passed).toBe(true);
  });

  it('fails when the reported FCF does not match OCF - Capex', () => {
    const result = checkFreeCashFlowReconciliation({ operatingCashFlow: 300_000_000, capex: 50_000_000, freeCashFlow: 100_000_000 });
    expect(result.passed).toBe(false);
  });
});

describe('checkCashRollForwardReconciliation', () => {
  it('passes when Ending Cash = Beginning Cash + Net Change', () => {
    const result = checkCashRollForwardReconciliation({
      priorPeriodCash: 100_000_000,
      currentPeriodCash: 130_000_000,
      operatingCashFlow: 50_000_000,
      investingCashFlow: -30_000_000,
      financingCashFlow: 10_000_000,
    });
    expect(result.passed).toBe(true);
  });

  it('is not checkable without a prior period balance', () => {
    const result = checkCashRollForwardReconciliation({
      priorPeriodCash: null,
      currentPeriodCash: 130_000_000,
      operatingCashFlow: 50_000_000,
      investingCashFlow: -30_000_000,
      financingCashFlow: 10_000_000,
    });
    expect(result.checkable).toBe(false);
  });
});

describe('runFinancialReconciliation', () => {
  it('runs all five checks together', () => {
    const results = runFinancialReconciliation({
      revenue: 1_000_000_000,
      costOfRevenue: 600_000_000,
      grossProfit: 400_000_000,
      operatingExpenses: 150_000_000,
      operatingIncome: 250_000_000,
      totalAssets: 500_000_000,
      totalLiabilities: 300_000_000,
      stockholdersEquity: 200_000_000,
      operatingCashFlow: 300_000_000,
      capex: 50_000_000,
      freeCashFlow: 250_000_000,
      investingCashFlow: -50_000_000,
      financingCashFlow: -20_000_000,
      cashAndEquivalents: 330_000_000,
      priorPeriodCashAndEquivalents: 100_000_000,
    });
    expect(results).toHaveLength(5);
    expect(results.every((r) => r.passed)).toBe(true);
  });
});
