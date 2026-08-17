import { describe, expect, it } from 'vitest';
import { runComps } from './engine';
import type { CompanyValuationMetrics, PeerSelection } from './types';

/**
 * A fully hand-verified end-to-end comps run, independently calculated
 * below (not by running the code) before the assertions were written.
 *
 * 8 peers, each with revenue=100, debt=0, cash=0 (so EV = market cap
 * exactly), and market caps chosen so EV/Revenue = 10, 11, 12, 13, 14, 15,
 * 16, 100 respectively — the exact same shape already hand-verified in
 * outliers.test.ts's first case:
 *   Q1 = 11.5, Q3 = 15.5, IQR = 4, bounds = [5.5, 21.5] -> only the 100x
 *   peer (PEER8) is flagged.
 *
 * Raw EV/Revenue stats (all 8): min 10, max 100, mean 191/8 = 23.875,
 *   median (13+14)/2 = 13.5.
 * Adjusted EV/Revenue stats (PEER8 excluded by the user): [10..16],
 *   mean 91/7 = 13, median (4th of 7) = 13.
 *
 * Target: revenue 1000, cash 100, debt 300, 100 diluted shares, price 45.
 * Implied EV/Revenue valuation uses the ADJUSTED median (13, not the raw
 * 13.5): implied EV = 1000 x 13 = 13,000; implied equity = 13,000 + 100 -
 * 300 = 12,800; implied price = 12,800 / 100 = $128.
 */

function makePeerMetrics(ticker: string, evToRevenueMultiple: number): CompanyValuationMetrics {
  return {
    ticker,
    name: `${ticker} Inc`,
    sector: 'Technology',
    industry: 'Software',
    exchange: 'NASDAQ',
    price: 10,
    marketCap: 100 * evToRevenueMultiple, // EV = marketCap since debt=cash=0
    dilutedSharesOutstanding: 10,
    revenue: 100,
    revenueGrowth: 0.05,
    ebit: 20,
    ebitda: 25,
    netIncome: 15,
    cash: 0,
    totalDebt: 0,
    bookValue: 200,
    fiscalYear: 2023,
    filingType: '10-K',
    filingDate: '2024-02-01',
    financialsAsOf: null,
    stale: false,
  };
}

function makeTarget(): CompanyValuationMetrics {
  return {
    ticker: 'TARGET',
    name: 'Target Co',
    sector: 'Technology',
    industry: 'Software',
    exchange: 'NASDAQ',
    price: 45,
    marketCap: 4000,
    dilutedSharesOutstanding: 100,
    revenue: 1000,
    revenueGrowth: 0.08,
    ebit: 200,
    ebitda: 250,
    netIncome: 150,
    cash: 100,
    totalDebt: 300,
    bookValue: 1500,
    fiscalYear: 2023,
    filingType: '10-K',
    filingDate: '2024-02-01',
    financialsAsOf: null,
    stale: false,
  };
}

function makePeers(excludeOutlier: boolean): PeerSelection[] {
  const multiples = [10, 11, 12, 13, 14, 15, 16, 100];
  return multiples.map((m, i) => ({
    metrics: makePeerMetrics(i === 7 ? 'PEER8' : `PEER${i + 1}`, m),
    score: null,
    source: 'calculated' as const,
    excluded: i === 7 && excludeOutlier,
  }));
}

describe('runComps — manually verified end-to-end case', () => {
  const target = makeTarget();

  it('computes raw EV/Revenue statistics from every peer, ignoring exclusion', () => {
    const result = runComps({ target, peers: makePeers(false) });
    const stats = result.statistics.evToRevenue;
    expect(stats.raw.count).toBe(8);
    expect(stats.raw.min).toBe(10);
    expect(stats.raw.max).toBe(100);
    expect(stats.raw.mean).toBeCloseTo(23.875, 6);
    expect(stats.raw.median).toBeCloseTo(13.5, 6);
  });

  it('flags the 100x peer as a potential outlier without removing it from raw or adjusted by itself', () => {
    const result = runComps({ target, peers: makePeers(false) }); // not user-excluded yet
    const stats = result.statistics.evToRevenue;
    expect(stats.outliers.outlierTickers).toEqual(['PEER8']);
    // Not excluded by the user yet, so adjusted still equals raw.
    expect(stats.adjusted.count).toBe(8);
    expect(stats.adjusted.median).toBeCloseTo(13.5, 6);
  });

  it('recomputes the adjusted statistics once the user excludes the flagged peer', () => {
    const result = runComps({ target, peers: makePeers(true) }); // user excludes PEER8
    const stats = result.statistics.evToRevenue;
    expect(stats.adjusted.count).toBe(7);
    expect(stats.adjusted.mean).toBeCloseTo(13, 6);
    expect(stats.adjusted.median).toBeCloseTo(13, 6);
    // Raw is unaffected by exclusion — it always reflects every peer.
    expect(stats.raw.count).toBe(8);
  });

  it('implied valuation uses the adjusted (post-exclusion) median, not the raw one', () => {
    const result = runComps({ target, peers: makePeers(true) });
    const row = result.impliedValuation.find((r) => r.methodology === 'evToRevenue');
    expect(row?.medianMultiple).toBeCloseTo(13, 6);
    expect(row?.impliedEnterpriseValue).toBeCloseTo(13000, 3);
    expect(row?.impliedEquityValue).toBeCloseTo(12800, 3);
    expect(row?.impliedSharePrice).toBeCloseTo(128, 3);
  });

  it('peer quality reflects only the included (non-excluded) peer set', () => {
    const excludedResult = runComps({ target, peers: makePeers(true) });
    expect(excludedResult.peerQuality.peerCount).toBe(7);

    const fullResult = runComps({ target, peers: makePeers(false) });
    expect(fullResult.peerQuality.peerCount).toBe(8);
  });

  it('recomputes each peer\'s multiples independently rather than trusting caller input', () => {
    const result = runComps({ target, peers: makePeers(false) });
    const peer1 = result.peers.find((p) => p.metrics.ticker === 'PEER1');
    expect(peer1?.multiples.evToRevenue.value).toBeCloseTo(10, 6);
    expect(peer1?.multiples.enterpriseValue).toBe(1000);
  });
});

describe('runComps — data integrity', () => {
  it('never invents peers — an empty peer set produces empty statistics and a fully N/M implied valuation, not fabricated data', () => {
    const result = runComps({ target: makeTarget(), peers: [] });
    expect(result.statistics.evToRevenue.raw.count).toBe(0);
    expect(result.statistics.evToRevenue.adjusted.median).toBeNull();
    expect(result.impliedValuation.every((row) => !row.isMeaningful)).toBe(true);
    expect(result.medianImpliedSharePrice).toBeNull();
    expect(result.peerQuality.peerCount).toBe(0);
  });
});
