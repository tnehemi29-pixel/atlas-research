import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SIMILARITY_WEIGHTS,
  industrySimilarity,
  linearSimilarity,
  logScaleSimilarity,
  scorePeerCandidate,
} from './peerScoring';
import type { CompanyValuationMetrics } from './types';

describe('industrySimilarity', () => {
  it('scores 1.0 for an exact industry match', () => {
    expect(industrySimilarity('Software', 'Technology', 'Software', 'Technology')).toEqual({
      score: 1,
      computed: true,
    });
  });

  it('matches case-insensitively and ignores surrounding whitespace', () => {
    expect(industrySimilarity(' Software ', 'Technology', 'SOFTWARE', 'Technology')).toEqual({
      score: 1,
      computed: true,
    });
  });

  it('scores 0.5 when only the broader sector matches', () => {
    expect(industrySimilarity('Software', 'Technology', 'Semiconductors', 'Technology')).toEqual({
      score: 0.5,
      computed: true,
    });
  });

  it('scores 0 when neither industry nor sector matches', () => {
    expect(industrySimilarity('Software', 'Technology', 'Banks', 'Financial Services')).toEqual({
      score: 0,
      computed: true,
    });
  });

  it('is not computed when a company has no classification data at all', () => {
    expect(industrySimilarity(null, null, 'Software', 'Technology')).toEqual({ score: 0, computed: false });
    expect(industrySimilarity('Software', 'Technology', null, null)).toEqual({ score: 0, computed: false });
  });
});

describe('logScaleSimilarity', () => {
  it('scores 1.0 for identical values', () => {
    expect(logScaleSimilarity(1000, 1000, 1.5)).toEqual({ score: 1, computed: true });
  });

  it('hand-verified: a 10x difference (log10 distance = 1) against maxLogDistance 1.5 scores 1/3', () => {
    const result = logScaleSimilarity(1000, 10000, 1.5);
    expect(result.computed).toBe(true);
    expect(result.score).toBeCloseTo(1 / 3, 6);
  });

  it('clamps to 0 rather than going negative for a very large difference', () => {
    const result = logScaleSimilarity(1000, 1_000_000_000, 1.5);
    expect(result.score).toBe(0);
  });

  it('is not computed for null, zero, or negative inputs', () => {
    expect(logScaleSimilarity(null, 1000, 1.5).computed).toBe(false);
    expect(logScaleSimilarity(1000, null, 1.5).computed).toBe(false);
    expect(logScaleSimilarity(0, 1000, 1.5).computed).toBe(false);
    expect(logScaleSimilarity(-5, 1000, 1.5).computed).toBe(false);
  });
});

describe('linearSimilarity', () => {
  it('scores 1.0 for identical values', () => {
    expect(linearSimilarity(0.1, 0.1, 0.5)).toEqual({ score: 1, computed: true });
  });

  it('hand-verified: 0.25 apart against maxDistance 0.5 scores 0.5', () => {
    expect(linearSimilarity(0.1, 0.35, 0.5)).toEqual({ score: 0.5, computed: true });
  });

  it('is not computed when either value is null', () => {
    expect(linearSimilarity(null, 0.1, 0.5).computed).toBe(false);
    expect(linearSimilarity(0.1, null, 0.5).computed).toBe(false);
  });
});

function makeMetrics(overrides: Partial<CompanyValuationMetrics> = {}): CompanyValuationMetrics {
  return {
    ticker: 'TARGET',
    name: 'Target Co',
    sector: 'Technology',
    industry: 'Software',
    exchange: 'NASDAQ',
    price: 50,
    marketCap: 5000,
    dilutedSharesOutstanding: 100,
    revenue: 1000,
    revenueGrowth: 0.1,
    ebit: 200,
    ebitda: 250,
    netIncome: 150,
    cash: 100,
    totalDebt: 300,
    bookValue: 2000,
    fiscalYear: 2023,
    filingType: '10-K',
    filingDate: '2024-02-01',
    financialsAsOf: null,
    stale: false,
    ...overrides,
  };
}

describe('scorePeerCandidate — full hand-verified case', () => {
  // target: industry Software/Technology, revenue 1000, marketCap 5000, growth 10%, EBITDA margin 25%
  // candidate: same industry (score 1), revenue 10000 (10x -> log dist 1 -> score 1/3),
  //   marketCap 50000 (10x -> score 1/3), growth 20% (10pp apart -> score 1 - 0.10/0.5 = 0.8),
  //   EBITDA margin 20% (2000/10000; 5pp apart from target's 25% -> score 1 - 0.05/0.5 = 0.9)
  // weighted: 1*.30 + .3333*.20 + .3333*.20 + .8*.15 + .9*.15 = 0.68833... -> 68.83
  const target = makeMetrics();
  const candidate = makeMetrics({
    ticker: 'PEER',
    revenue: 10000,
    marketCap: 50000,
    revenueGrowth: 0.2,
    ebitda: 2000,
  });

  const score = scorePeerCandidate(target, candidate);

  it('computes each component score to the hand-verified value', () => {
    expect(score.industryScore).toBe(1);
    expect(score.revenueScore).toBeCloseTo(1 / 3, 4);
    expect(score.marketCapScore).toBeCloseTo(1 / 3, 4);
    expect(score.growthScore).toBeCloseTo(0.8, 6);
    expect(score.marginScore).toBeCloseTo(0.9, 6);
  });

  it('combines them with the default weights into the hand-verified total', () => {
    expect(score.totalScore).toBeCloseTo(68.83, 2);
  });

  it('marks every dimension as computed when all the underlying data is present', () => {
    expect(score.computed).toEqual({ industry: true, revenue: true, marketCap: true, growth: true, margin: true });
  });

  it('DEFAULT_SIMILARITY_WEIGHTS sum to 1 — the weighting is a complete partition, not arbitrary', () => {
    const sum = Object.values(DEFAULT_SIMILARITY_WEIGHTS).reduce((total, w) => total + w, 0);
    expect(sum).toBeCloseTo(1, 9);
  });

  it('renormalizes weights when a dimension cannot be computed, rather than penalizing missing data as zero similarity', () => {
    const targetMissingGrowth = makeMetrics({ revenueGrowth: null });
    const rescored = scorePeerCandidate(targetMissingGrowth, candidate);
    expect(rescored.computed.growth).toBe(false);
    // weightedScore excluding growth (0.3+0.0667+0.0667+0.135=0.56833) / totalWeight (0.85) * 100 ~= 66.86
    expect(rescored.totalScore).toBeCloseTo(66.86, 2);
  });

  it('scores 0 when nothing at all can be computed for either company', () => {
    const blank = makeMetrics({
      sector: null,
      industry: null,
      revenue: null,
      marketCap: null,
      revenueGrowth: null,
      ebitda: null,
    });
    const result = scorePeerCandidate(blank, candidate);
    expect(result.totalScore).toBe(0);
  });
});
