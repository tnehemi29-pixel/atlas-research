import type { AssumptionKey, MaterialityLevel } from '@prisma/client';
import type { EightKCategory } from '@/lib/sec/eightKItems';
import type { ImportanceLevel } from '@/lib/sec/types';

/**
 * The ONE place every materiality threshold in Milestone 11 lives — "do not
 * hardcode arbitrary thresholds throughout the codebase." Every detector in
 * lib/services/researchEventDetectionService.ts calls one of the
 * `classify*` functions below rather than inlining its own magic number, so
 * changing "how big a guidance change has to be to count as HIGH" is a
 * one-line edit here, never a hunt through detection code.
 *
 * Thresholds are expressed as the minimum |magnitude| a change must reach to
 * clear each tier — LOW is simply "didn't clear MEDIUM." All percent
 * thresholds are ratios (0.05 = 5%), matching lib/analytics/ratios.ts's own
 * convention; margin thresholds are in basis points, matching how the
 * milestone spec itself expresses margin moves ("-300 bps").
 */

export interface MagnitudeThresholds {
  mediumAt: number;
  highAt: number;
  criticalAt: number;
}

export const MATERIALITY_THRESHOLDS = {
  /** Revenue, EPS, free cash flow, debt, cash, shares outstanding — any
   * dollar-or-count financial metric expressed as a percent change. */
  financialPercent: { mediumAt: 0.05, highAt: 0.15, criticalAt: 0.3 } satisfies MagnitudeThresholds,
  /** Gross/operating/net margin, expressed in basis points (25% -> 21% = 400). */
  marginBps: { mediumAt: 100, highAt: 300, criticalAt: 600 } satisfies MagnitudeThresholds,
  /** Guidance midpoint change, as a percent of the prior midpoint. */
  guidancePercent: { mediumAt: 0.03, highAt: 0.07, criticalAt: 0.2 } satisfies MagnitudeThresholds,
  /** DCF implied-share-price change (Base case), as a percent. */
  dcfValuationPercent: { mediumAt: 0.05, highAt: 0.12, criticalAt: 0.25 } satisfies MagnitudeThresholds,
  /** Comps-implied-share-price / peer-median-multiple change, as a percent. */
  compsValuationPercent: { mediumAt: 0.05, highAt: 0.15, criticalAt: 0.25 } satisfies MagnitudeThresholds,
} as const;

/** Cost control (spec section 24): AI analysis is only attempted for events
 * at or above this materiality tier — a LOW/MEDIUM change is stored with
 * its deterministic changes/sources but never spends a token. */
export const AI_TRIGGER_MIN_MATERIALITY: MaterialityLevel = 'HIGH';

const MATERIALITY_ORDER: MaterialityLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export function materialityAtLeast(level: MaterialityLevel, threshold: MaterialityLevel): boolean {
  return MATERIALITY_ORDER.indexOf(level) >= MATERIALITY_ORDER.indexOf(threshold);
}

export function shouldRunAiAnalysis(materiality: MaterialityLevel): boolean {
  return materialityAtLeast(materiality, AI_TRIGGER_MIN_MATERIALITY);
}

/** When one event is driven by more than one underlying change (e.g. a
 * guidance cut that also moves the DCF), the event's overall materiality is
 * the highest tier any single contributing change reached — a severe input
 * is never diluted by averaging it against milder ones. */
export function maxMateriality(a: MaterialityLevel, b: MaterialityLevel): MaterialityLevel {
  return MATERIALITY_ORDER.indexOf(a) >= MATERIALITY_ORDER.indexOf(b) ? a : b;
}

function classifyByMagnitude(value: number | null, thresholds: MagnitudeThresholds): MaterialityLevel {
  if (value === null) return 'LOW';
  const magnitude = Math.abs(value);
  if (magnitude >= thresholds.criticalAt) return 'CRITICAL';
  if (magnitude >= thresholds.highAt) return 'HIGH';
  if (magnitude >= thresholds.mediumAt) return 'MEDIUM';
  return 'LOW';
}

export function classifyFinancialChange(percentChange: number | null): MaterialityLevel {
  return classifyByMagnitude(percentChange, MATERIALITY_THRESHOLDS.financialPercent);
}

export function classifyMarginChange(bpsChange: number | null): MaterialityLevel {
  return classifyByMagnitude(bpsChange, MATERIALITY_THRESHOLDS.marginBps);
}

export function classifyGuidanceChange(percentChange: number | null): MaterialityLevel {
  return classifyByMagnitude(percentChange, MATERIALITY_THRESHOLDS.guidancePercent);
}

export function classifyDcfValuationChange(percentChange: number | null): MaterialityLevel {
  return classifyByMagnitude(percentChange, MATERIALITY_THRESHOLDS.dcfValuationPercent);
}

export function classifyCompsValuationChange(percentChange: number | null): MaterialityLevel {
  return classifyByMagnitude(percentChange, MATERIALITY_THRESHOLDS.compsValuationPercent);
}

// ---------------------------------------------------------------------------
// SEC filings / corporate events — reuses Milestone 7's own rule-based
// classification (lib/sec/importance.ts, lib/sec/eightKItems.ts) rather than
// inventing a second one; this table only maps its 3-tier output onto
// Milestone 11's 4-tier scale, adding CRITICAL for the categories the
// milestone spec explicitly calls out (bankruptcy/liquidity, material legal
// events) that Milestone 7 had no reason to distinguish from "High."
// ---------------------------------------------------------------------------

export const FILING_IMPORTANCE_MATERIALITY: Record<ImportanceLevel, MaterialityLevel> = {
  Low: 'LOW',
  Medium: 'MEDIUM',
  High: 'HIGH',
};

export const EIGHT_K_CATEGORY_MATERIALITY: Record<EightKCategory, MaterialityLevel> = {
  EARNINGS: 'MEDIUM',
  ACQUISITION: 'HIGH',
  EXECUTIVE_CHANGE: 'HIGH',
  FINANCING: 'MEDIUM',
  BANKRUPTCY_RESTRUCTURING: 'CRITICAL',
  MAJOR_CONTRACT: 'MEDIUM',
  LEGAL_EVENT: 'CRITICAL',
  OTHER: 'LOW',
};

// ---------------------------------------------------------------------------
// Thesis monitor (lib/services/thesisMonitorService.ts) — how far a live
// observation has to drift from a report's originally-extracted assumption
// before it's worth flagging as "potentially inconsistent." 'absolute' means
// the threshold is a raw difference in the assumption's own unit (a ratio,
// so 0.01 = 1 percentage point); 'relative' means percent-of-the-original-
// value, matching how guidance changes are already classified above.
// ---------------------------------------------------------------------------

interface AssumptionFlagThreshold {
  mode: 'absolute' | 'relative';
  threshold: number;
}

export const ASSUMPTION_FLAG_THRESHOLDS: Record<AssumptionKey, AssumptionFlagThreshold> = {
  REVENUE_CAGR: { mode: 'absolute', threshold: 0.02 },
  OPERATING_MARGIN: { mode: 'absolute', threshold: 0.01 },
  FCF_MARGIN: { mode: 'absolute', threshold: 0.01 },
  WACC: { mode: 'absolute', threshold: 0.005 },
  TERMINAL_GROWTH: { mode: 'absolute', threshold: 0.005 },
  EXIT_MULTIPLE: { mode: 'relative', threshold: 0.1 },
  REVENUE_GUIDANCE: { mode: 'relative', threshold: MATERIALITY_THRESHOLDS.guidancePercent.mediumAt },
};

/** Never implies certainty about the future — just "this live observation
 * has drifted far enough from the report's original assumption to be worth
 * a second look," per spec section 13's "potentially inconsistent," not
 * "thesis broken." */
export function isAssumptionChangeFlagged(key: AssumptionKey, previousValue: number, newValue: number): boolean {
  const config = ASSUMPTION_FLAG_THRESHOLDS[key];
  if (config.mode === 'absolute') return Math.abs(newValue - previousValue) >= config.threshold;
  return previousValue !== 0 && Math.abs((newValue - previousValue) / Math.abs(previousValue)) >= config.threshold;
}
