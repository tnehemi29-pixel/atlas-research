import { describe, expect, it } from 'vitest';
import type { CompanyValuationMetrics, CompsResult, SelectedPeer } from '@/lib/comps/types';
import { auditComps, checkMinimumPeerCount, checkPeerDataCompleteness } from './compsAudit';

function makeMetrics(overrides: Partial<CompanyValuationMetrics> = {}): CompanyValuationMetrics {
  return {
    ticker: 'AAA', name: 'AAA Inc.', sector: 'Tech', industry: 'Software', exchange: 'NASDAQ',
    price: 100, marketCap: 1_000_000_000, dilutedSharesOutstanding: 10_000_000,
    revenue: 500_000_000, revenueGrowth: 0.1, ebit: 100_000_000, ebitda: 130_000_000, netIncome: 80_000_000,
    cash: 50_000_000, totalDebt: 20_000_000, bookValue: 400_000_000,
    fiscalYear: 2025, filingType: '10-K', filingDate: '2026-01-01', financialsAsOf: '2026-01-01', stale: false,
    ...overrides,
  };
}

function makeOkMultiple(value: number) {
  return { value, status: 'ok' as const };
}

function makeMultiples(ticker: string) {
  return {
    ticker,
    enterpriseValue: 1_000_000_000,
    equityValue: 1_000_000_000,
    evToRevenue: makeOkMultiple(2),
    evToEbitda: makeOkMultiple(8),
    evToEbit: makeOkMultiple(10),
    peRatio: makeOkMultiple(12.5),
    priceToSales: makeOkMultiple(2),
    priceToBook: makeOkMultiple(2.5),
  };
}

function makePeer(ticker: string, metricsOverrides: Partial<CompanyValuationMetrics> = {}): SelectedPeer {
  const metrics = makeMetrics({ ticker, ...metricsOverrides });
  return {
    metrics,
    score: null,
    source: 'calculated',
    excluded: false,
    multiples: makeMultiples(ticker),
  };
}

function makeCompsResult(peers: SelectedPeer[]): CompsResult {
  const target = makeMetrics({ ticker: 'TGT' });
  return {
    target,
    targetMultiples: makeMultiples('TGT'),
    peers,
    statistics: {} as CompsResult['statistics'],
    impliedValuation: [],
    medianImpliedSharePrice: 105,
    peerQuality: { peerCount: peers.length, medianRevenue: 500_000_000, medianMarketCap: 1_000_000_000, medianGrowth: 0.1, medianEbitdaMargin: 0.26 },
  };
}

describe('checkMinimumPeerCount', () => {
  it('passes with at least the minimum number of included peers', () => {
    const result = checkMinimumPeerCount([{ excluded: false }, { excluded: false }, { excluded: false }]);
    expect(result.passed).toBe(true);
  });

  it('flags MEDIUM severity when too few peers are included', () => {
    const result = checkMinimumPeerCount([{ excluded: false }, { excluded: true }]);
    expect(result.passed).toBe(false);
    expect(result.severity).toBe('MEDIUM');
  });
});

describe('checkPeerDataCompleteness', () => {
  it('passes when every included peer has EBITDA/EBIT/revenue', () => {
    const result = checkPeerDataCompleteness([makePeer('AAA'), makePeer('BBB')]);
    expect(result.passed).toBe(true);
  });

  it('flags peers missing core comps data by name', () => {
    const result = checkPeerDataCompleteness([makePeer('AAA'), makePeer('BBB', { ebitda: null })]);
    expect(result.passed).toBe(false);
    expect(result.message).toContain('BBB');
  });

  it('ignores excluded peers', () => {
    const peer = makePeer('BBB', { ebitda: null });
    const excludedPeer: SelectedPeer = { ...peer, excluded: true };
    const result = checkPeerDataCompleteness([makePeer('AAA'), excludedPeer]);
    expect(result.passed).toBe(true);
  });
});

describe('auditComps', () => {
  it('produces no CRITICAL findings when every multiple with a non-positive denominator is correctly marked Not Meaningful', () => {
    const findings = auditComps(makeCompsResult([makePeer('AAA'), makePeer('BBB'), makePeer('CCC')]));
    expect(findings.filter((f) => f.severity === 'CRITICAL')).toHaveLength(0);
  });

  it('flags a CRITICAL finding when a multiple is shown as "ok" despite a negative EBITDA denominator', () => {
    const badPeer = makePeer('NEG', { ebitda: -50_000_000 });
    badPeer.multiples.evToEbitda = makeOkMultiple(-4); // should have been notMeaningful
    const findings = auditComps(makeCompsResult([makePeer('AAA'), makePeer('BBB'), badPeer]));
    const critical = findings.filter((f) => f.severity === 'CRITICAL');
    expect(critical.length).toBeGreaterThan(0);
    expect(critical[0]!.message).toContain('NEG');
  });

  it('does not flag a multiple correctly marked notMeaningful for a negative denominator', () => {
    const peer = makePeer('NEG', { ebitda: -50_000_000 });
    peer.multiples.evToEbitda = { value: null, status: 'notMeaningful' };
    const findings = auditComps(makeCompsResult([makePeer('AAA'), makePeer('BBB'), peer]));
    expect(findings.filter((f) => f.severity === 'CRITICAL')).toHaveLength(0);
  });
});
