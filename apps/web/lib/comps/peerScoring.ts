import { safeDivide } from '@/lib/analytics/ratios';
import type { CompanyValuationMetrics, SimilarityScoreBreakdown, SimilarityWeights } from './types';

/**
 * Transparent, formulaic peer-similarity scoring — every number below is
 * documented and traceable back to actual company data, never an invented
 * or opaque score. Five dimensions, each normalized to a 0-1 similarity
 * (1 = identical/very close, 0 = no meaningful similarity):
 *
 *   1. Industry  — exact industry match = 1.0, sector-only match = 0.5,
 *      neither = 0.0.
 *   2. Revenue   — log-scale distance (companies vary by orders of
 *      magnitude, so a linear distance would make every large-cap look
 *      "far" from every mid-cap regardless of business similarity). Within
 *      the same order of magnitude scores well; ~32x apart (a log10
 *      distance of 1.5) scores 0.
 *   3. Market Cap — same log-scale approach as revenue.
 *   4. Growth    — linear distance on revenue growth rate; 50 percentage
 *      points apart scores 0.
 *   5. Margin    — linear distance on EBITDA margin; 50 percentage points
 *      apart scores 0.
 *
 * The five scores are combined with fixed, documented weights
 * (DEFAULT_SIMILARITY_WEIGHTS) into a single 0-100 total. If a dimension
 * can't be computed for a given pair (missing data on either side), it is
 * dropped from the weighted average and the remaining weights are
 * renormalized to sum to 1 — a company with one year of history (so growth
 * can't be computed) isn't unfairly penalized for a gap in Atlas's data,
 * but the `computed` flags on the result make exactly which dimensions were
 * actually evaluated visible in the UI.
 */

export const DEFAULT_SIMILARITY_WEIGHTS: SimilarityWeights = {
  industry: 0.3,
  revenue: 0.2,
  marketCap: 0.2,
  growth: 0.15,
  margin: 0.15,
};

const REVENUE_MAX_LOG_DISTANCE = 1.5;
const MARKET_CAP_MAX_LOG_DISTANCE = 1.5;
const GROWTH_MAX_DISTANCE = 0.5;
const MARGIN_MAX_DISTANCE = 0.5;

interface ComponentScore {
  score: number;
  computed: boolean;
}

function normalizeLabel(value: string | null): string | null {
  const trimmed = value?.trim().toLowerCase();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

export function industrySimilarity(
  targetIndustry: string | null,
  targetSector: string | null,
  peerIndustry: string | null,
  peerSector: string | null,
): ComponentScore {
  const ti = normalizeLabel(targetIndustry);
  const ts = normalizeLabel(targetSector);
  const pi = normalizeLabel(peerIndustry);
  const ps = normalizeLabel(peerSector);

  if ((ti === null && ts === null) || (pi === null && ps === null)) {
    return { score: 0, computed: false };
  }
  if (ti !== null && pi !== null && ti === pi) return { score: 1, computed: true };
  if (ts !== null && ps !== null && ts === ps) return { score: 0.5, computed: true };
  return { score: 0, computed: true };
}

/** Similarity on a log10 scale — appropriate for values that span orders of
 * magnitude (revenue, market cap). Non-positive values can't be logged, so
 * they're treated as "can't be computed" rather than silently coerced. */
export function logScaleSimilarity(
  targetValue: number | null,
  peerValue: number | null,
  maxLogDistance: number,
): ComponentScore {
  if (targetValue === null || peerValue === null || targetValue <= 0 || peerValue <= 0) {
    return { score: 0, computed: false };
  }
  const distance = Math.abs(Math.log10(targetValue) - Math.log10(peerValue));
  return { score: Math.max(0, 1 - distance / maxLogDistance), computed: true };
}

/** Similarity on a linear scale — appropriate for rates (growth, margin)
 * that are already comparable without a log transform. */
export function linearSimilarity(
  targetValue: number | null,
  peerValue: number | null,
  maxDistance: number,
): ComponentScore {
  if (targetValue === null || peerValue === null) return { score: 0, computed: false };
  const distance = Math.abs(targetValue - peerValue);
  return { score: Math.max(0, 1 - distance / maxDistance), computed: true };
}

function ebitdaMargin(metrics: CompanyValuationMetrics): number | null {
  return safeDivide(metrics.ebitda, metrics.revenue);
}

export function scorePeerCandidate(
  target: CompanyValuationMetrics,
  candidate: CompanyValuationMetrics,
  weights: SimilarityWeights = DEFAULT_SIMILARITY_WEIGHTS,
): SimilarityScoreBreakdown {
  const industry = industrySimilarity(target.industry, target.sector, candidate.industry, candidate.sector);
  const revenue = logScaleSimilarity(target.revenue, candidate.revenue, REVENUE_MAX_LOG_DISTANCE);
  const marketCap = logScaleSimilarity(target.marketCap, candidate.marketCap, MARKET_CAP_MAX_LOG_DISTANCE);
  const growth = linearSimilarity(target.revenueGrowth, candidate.revenueGrowth, GROWTH_MAX_DISTANCE);
  const margin = linearSimilarity(ebitdaMargin(target), ebitdaMargin(candidate), MARGIN_MAX_DISTANCE);

  const components = [
    { component: industry, weight: weights.industry },
    { component: revenue, weight: weights.revenue },
    { component: marketCap, weight: weights.marketCap },
    { component: growth, weight: weights.growth },
    { component: margin, weight: weights.margin },
  ];

  const totalWeight = components.reduce((sum, { component, weight }) => sum + (component.computed ? weight : 0), 0);
  const weightedScore = components.reduce(
    (sum, { component, weight }) => sum + (component.computed ? component.score * weight : 0),
    0,
  );
  const totalScore = totalWeight > 0 ? Math.round(((weightedScore / totalWeight) * 100) * 100) / 100 : 0;

  return {
    industryScore: industry.score,
    revenueScore: revenue.score,
    marketCapScore: marketCap.score,
    growthScore: growth.score,
    marginScore: margin.score,
    totalScore,
    computed: {
      industry: industry.computed,
      revenue: revenue.computed,
      marketCap: marketCap.computed,
      growth: growth.computed,
      margin: margin.computed,
    },
  };
}
