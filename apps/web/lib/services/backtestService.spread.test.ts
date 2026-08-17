import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FinancialPeriodData } from '@erp/types';

vi.mock('@/lib/services/financialDataService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/financialDataService')>();
  return { ...actual, getFinancials: vi.fn() };
});
vi.mock('@/lib/valuation/quickValuation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/valuation/quickValuation')>();
  return { ...actual, getQuickComps: vi.fn() };
});
vi.mock('@/lib/services/historicalPriceService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/historicalPriceService')>();
  return { ...actual, getPriceAsOf: vi.fn(), getForwardReturn: vi.fn() };
});

import { getFinancials } from '@/lib/services/financialDataService';
import { getQuickComps } from '@/lib/valuation/quickValuation';
import { getForwardReturn, getPriceAsOf } from '@/lib/services/historicalPriceService';
import {
  runValuationSpreadAnalysis,
  runValuationSpreadOutOfSample,
  runValuationSpreadWalkForward,
  segmentObservationsForRobustness,
  type ValuationForwardOutcome,
} from './backtestService';

const TICKER = 'ZZSPREADTEST';

function makePeriod(fiscalYear: number, filingDate: string): FinancialPeriodData {
  return {
    fiscalYear,
    fiscalPeriod: 'FY',
    periodType: 'annual',
    periodStart: `${fiscalYear - 1}-01-01`,
    periodEnd: `${fiscalYear}-12-31`,
    filingType: '10-K',
    filingDate,
    incomeStatement: {
      revenue: 500, costOfRevenue: 300, grossProfit: 200, operatingExpenses: null,
      operatingIncome: 80, interestExpense: null, pretaxIncome: 76, incomeTax: 16,
      netIncome: 60, eps: null, dilutedEps: null, basicSharesOutstanding: null, dilutedSharesOutstanding: 10,
    },
    balanceSheet: {
      cashAndEquivalents: 100, shortTermInvestments: null, accountsReceivable: null, inventory: null,
      totalCurrentAssets: null, ppe: null, goodwill: null, intangibleAssets: null, totalAssets: null,
      accountsPayable: null, shortTermDebt: 50, longTermDebt: 150,
      totalCurrentLiabilities: null, totalLiabilities: null, stockholdersEquity: null,
    },
    cashFlow: {
      operatingCashFlow: null, capex: null, investingCashFlow: null, financingCashFlow: null,
      freeCashFlow: 60, depreciationAmortization: 10, stockBasedCompensation: null, changeInWorkingCapital: null,
    },
  };
}

describe('runValuationSpreadAnalysis', () => {
  afterEach(() => {
    vi.mocked(getFinancials).mockReset();
    vi.mocked(getQuickComps).mockReset();
    vi.mocked(getPriceAsOf).mockReset();
    vi.mocked(getForwardReturn).mockReset();
  });

  it('computes a point-in-time target multiple vs. the current peer median and classifies the spread', async () => {
    // Target EV/EBITDA = (100*10 + 200 - 100) / (80+10) = 1100/90 ~= 12.2x. Peer median 18x -> discount (worked example).
    vi.mocked(getFinancials).mockResolvedValue({ ticker: TICKER, periodType: 'annual', periods: [makePeriod(2023, '2024-02-01')], stale: false, dataAsOf: null });
    vi.mocked(getQuickComps).mockResolvedValue({ impliedSharePrice: null, upsideDownside: null, evToEbitda: 12.2, peerMedianEvToEbitda: 18 });
    vi.mocked(getPriceAsOf).mockResolvedValue({ date: '2024-06-01', close: 100 });
    vi.mocked(getForwardReturn).mockResolvedValue({ fromDate: '2024-06-01', fromPrice: 100, toDate: '2024-07-01', toPrice: 105, returnPct: 0.05 });

    const result = await runValuationSpreadAnalysis(TICKER, '2024-06-01', '2024-06-15');
    expect(result.peerDataIsCurrentNotHistorical).toBe(true);
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0]?.companyMultiple).toBeCloseTo(1100 / 90);
    expect(result.observations[0]?.bucket).toBe('DISCOUNT');
    expect(result.statsByBucket.find((s) => s.bucket === 'DISCOUNT' && s.horizonMonths === 1)?.stats.count).toBe(1);
  });

  it('produces no observations when no peer median multiple is available, without throwing', async () => {
    vi.mocked(getFinancials).mockResolvedValue({ ticker: TICKER, periodType: 'annual', periods: [makePeriod(2023, '2024-02-01')], stale: false, dataAsOf: null });
    vi.mocked(getQuickComps).mockResolvedValue(null);

    const result = await runValuationSpreadAnalysis(TICKER, '2024-06-01', '2024-06-15');
    expect(result.observations).toEqual([]);
  });
});

describe('segmentObservationsForRobustness', () => {
  it('segments by year and by market-cap bucket, excluding unknown market caps from the size axis', () => {
    const outcome = (horizonMonths: number, returnPct: number): ValuationForwardOutcome => ({
      horizonMonths: horizonMonths as never,
      toDate: '2024-01-01',
      toPrice: 1,
      returnPct,
      returnPctNetOfCosts: returnPct,
      benchmarkReturnPct: null,
      excessReturnPct: null,
    });
    const observations = [
      { date: '2022-05-01', marketCap: 1_000_000_000, forwardOutcomes: [outcome(1, 0.1)] },
      { date: '2023-05-01', marketCap: null, forwardOutcomes: [outcome(1, -0.2)] },
    ];

    const result = segmentObservationsForRobustness(observations);
    const byYear1M = result.byYear.find((s) => s.horizonMonths === 1)!;
    expect(byYear1M.segments.map((s) => s.segment)).toEqual(['2022', '2023']);

    const byCap1M = result.byMarketCapBucket.find((s) => s.horizonMonths === 1)!;
    expect(byCap1M.segments.reduce((sum, s) => sum + s.stats.count, 0)).toBe(1);
  });
});

describe('runValuationSpreadOutOfSample', () => {
  afterEach(() => {
    vi.mocked(getFinancials).mockReset();
    vi.mocked(getQuickComps).mockReset();
    vi.mocked(getPriceAsOf).mockReset();
    vi.mocked(getForwardReturn).mockReset();
  });

  it('labels in-sample and out-of-sample results with their own date ranges, run independently', async () => {
    vi.mocked(getFinancials).mockResolvedValue({ ticker: TICKER, periodType: 'annual', periods: [makePeriod(2016, '2017-02-01')], stale: false, dataAsOf: null });
    vi.mocked(getQuickComps).mockResolvedValue({ impliedSharePrice: null, upsideDownside: null, evToEbitda: 12.2, peerMedianEvToEbitda: 18 });
    vi.mocked(getPriceAsOf).mockResolvedValue({ date: '2020-01-01', close: 100 });
    vi.mocked(getForwardReturn).mockResolvedValue(null);

    const result = await runValuationSpreadOutOfSample(TICKER, '2018-01-01', '2019-01-01', '2022-01-01', '2023-01-01');
    expect(result.trainPeriod).toEqual({ fromDate: '2018-01-01', toDate: '2019-01-01' });
    expect(result.testPeriod).toEqual({ fromDate: '2022-01-01', toDate: '2023-01-01' });
    expect(result.inSample.fromDate).toBe('2018-01-01');
    expect(result.outOfSample.fromDate).toBe('2022-01-01');
    expect(result.methodology.join(' ')).toMatch(/no threshold or parameter is fit/i);
  });
});

describe('runValuationSpreadWalkForward', () => {
  afterEach(() => {
    vi.mocked(getFinancials).mockReset();
    vi.mocked(getQuickComps).mockReset();
    vi.mocked(getPriceAsOf).mockReset();
    vi.mocked(getForwardReturn).mockReset();
  });

  it('runs one test-window analysis per walk-forward step, matching buildWalkForwardWindows exactly', async () => {
    vi.mocked(getFinancials).mockResolvedValue({ ticker: TICKER, periodType: 'annual', periods: [makePeriod(2016, '2017-02-01')], stale: false, dataAsOf: null });
    vi.mocked(getQuickComps).mockResolvedValue(null); // no peer data -> empty observations per window, fine for testing the windowing itself
    vi.mocked(getPriceAsOf).mockResolvedValue(null);
    vi.mocked(getForwardReturn).mockResolvedValue(null);

    // 2015-2018 initial train (4y), 1y test steps, through 2020 -> test windows 2019, 2020.
    const result = await runValuationSpreadWalkForward(TICKER, '2015-01-01', '2020-12-31', 4, 1);
    expect(result.windows).toHaveLength(2);
    expect(result.windows[0]?.window).toEqual({ trainStart: '2015-01-01', trainEnd: '2018-12-31', testStart: '2019-01-01', testEnd: '2019-12-31' });
    expect(result.windows[0]?.testResult.fromDate).toBe('2019-01-01');
    expect(result.windows[0]?.testResult.toDate).toBe('2019-12-31');
    expect(result.windows[1]?.window.testStart).toBe('2020-01-01');
  });
});
