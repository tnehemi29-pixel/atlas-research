/**
 * Deterministic guidance resolution. The AI layer (lib/ai/earningsSchema.ts)
 * only extracts *candidates* — metric, period, and the low/high figures
 * management actually said — from prepared remarks and Q&A. Midpoint and the
 * increased/decreased/maintained/new change label are always computed here
 * in plain TypeScript, never left for the model to calculate, so guidance
 * math can never be wrong the way a hallucinated number could be.
 */

export type GuidanceMetricValue =
  | 'REVENUE'
  | 'EPS'
  | 'GROSS_MARGIN'
  | 'OPERATING_MARGIN'
  | 'CAPEX'
  | 'OPEX'
  | 'FREE_CASH_FLOW'
  | 'SEGMENT_REVENUE'
  | 'OTHER';

export type GuidanceChangeValue = 'INCREASED' | 'DECREASED' | 'MAINTAINED' | 'NEW';

export interface GuidanceCandidate {
  metric: GuidanceMetricValue;
  metricLabel: string;
  period: string;
  low: number | null;
  high: number | null;
  sourceExcerpt: string;
  sourceAnchor: string | null;
}

export interface PriorGuidance {
  metric: GuidanceMetricValue;
  period: string;
  low: number | null;
  high: number | null;
  midpoint: number | null;
}

export interface ResolvedGuidanceObservation extends GuidanceCandidate {
  midpoint: number | null;
  priorLow: number | null;
  priorHigh: number | null;
  priorMidpoint: number | null;
  change: GuidanceChangeValue;
}

const EPSILON = 1e-9;

/** Midpoint = (Low + High) / 2. A single-sided guide (only a floor or only a
 * ceiling was stated) resolves to that one value rather than null — it's
 * still the one number management gave. Both missing resolves to null. */
export function computeMidpoint(low: number | null, high: number | null): number | null {
  if (low !== null && high !== null) return (low + high) / 2;
  if (low !== null) return low;
  if (high !== null) return high;
  return null;
}

/** No matching prior-call guidance for this metric+period is always NEW —
 * not an assumption that the company never guided this before, just that
 * Atlas has nothing to compare against. */
export function resolveGuidanceChange(
  midpoint: number | null,
  priorMidpoint: number | null,
): GuidanceChangeValue {
  if (priorMidpoint === null || midpoint === null) return 'NEW';
  if (Math.abs(midpoint - priorMidpoint) < EPSILON) return 'MAINTAINED';
  return midpoint > priorMidpoint ? 'INCREASED' : 'DECREASED';
}

/** Matches each AI-extracted candidate against the previous call's guidance
 * for the same metric+period (exact string match on period, e.g. "Q4 2025"),
 * then computes midpoint and change deterministically for every candidate. */
export function resolveGuidanceObservations(
  candidates: GuidanceCandidate[],
  priorObservations: PriorGuidance[],
): ResolvedGuidanceObservation[] {
  return candidates.map((candidate) => {
    const midpoint = computeMidpoint(candidate.low, candidate.high);
    const prior = priorObservations.find(
      (p) => p.metric === candidate.metric && p.period === candidate.period,
    );

    return {
      ...candidate,
      midpoint,
      priorLow: prior?.low ?? null,
      priorHigh: prior?.high ?? null,
      priorMidpoint: prior?.midpoint ?? null,
      change: resolveGuidanceChange(midpoint, prior?.midpoint ?? null),
    };
  });
}
