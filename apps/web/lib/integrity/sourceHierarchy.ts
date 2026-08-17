import type { SourceTier } from '@prisma/client';

/**
 * Milestone 14 spec section 4 — a configurable source hierarchy. Every
 * research claim should be traceable to a source, and every source should be
 * ranked so a reader can judge how much weight to give it. The hierarchy is
 * data, not logic: swapping which concrete source types map to which tier
 * never touches the modules that consume it (claimValidation.ts,
 * evidenceValidation.ts-style checks, the company integrity panel).
 *
 * Tier 1 — primary, audited, or regulator-filed sources.
 * Tier 2 — company-produced but not independently audited, or a reliable
 *          structured financial dataset (a data provider, not a filing).
 * Tier 3 — other reputable financial sources not directly tied to the
 *          company or a regulator.
 * Tier 4 — unverified or secondary information — the default for anything
 *          not explicitly classified, so an unrecognized source is never
 *          silently trusted.
 */

export const SOURCE_TIER_CONFIG: Record<string, SourceTier> = {
  // Tier 1 — SEC filings, company filings, audited financial statements,
  // official earnings releases.
  SEC_FILING: 'TIER_1',
  TEN_K: 'TIER_1',
  TEN_Q: 'TIER_1',
  EIGHT_K: 'TIER_1',
  FINANCIAL_STATEMENT: 'TIER_1',
  AUDITED_FINANCIAL_STATEMENT: 'TIER_1',
  EARNINGS_RELEASE: 'TIER_1',

  // Tier 2 — earnings transcripts, investor presentations, reliable
  // structured financial datasets (a data provider's own numbers), and
  // Atlas's own derived models built directly from Tier 1/2 inputs.
  EARNINGS_CALL: 'TIER_2',
  EARNINGS_TRANSCRIPT: 'TIER_2',
  INVESTOR_PRESENTATION: 'TIER_2',
  FINANCIAL_DATA_PROVIDER: 'TIER_2',
  MARKET_DATA: 'TIER_2',
  DCF: 'TIER_2',
  COMPS: 'TIER_2',
  HISTORICAL_VALIDATION: 'TIER_2',
  RESEARCH_EVENT: 'TIER_2',
  RESEARCH_REPORT: 'TIER_2',
  INVESTMENT_CASE: 'TIER_2',

  // Tier 3 — other reputable financial sources not tied to the company or a
  // regulator.
  NEWS: 'TIER_3',
  THIRD_PARTY_ANALYSIS: 'TIER_3',

  // Tier 4 — unverified or secondary information.
  MANUAL: 'TIER_4',
  AI_GENERATED: 'TIER_4',
  UNVERIFIED: 'TIER_4',
};

export const SOURCE_TIER_LABELS: Record<SourceTier, string> = {
  TIER_1: 'Tier 1 — SEC filings & audited statements',
  TIER_2: 'Tier 2 — transcripts, presentations & structured data',
  TIER_3: 'Tier 3 — other reputable financial sources',
  TIER_4: 'Tier 4 — unverified or secondary information',
};

/** Unrecognized source types resolve to TIER_4 — the least-trusted tier —
 * never to an assumed-safe default. This is the one place in the codebase
 * that decides "how much do we trust this kind of source." */
export function getSourceTier(sourceType: string): SourceTier {
  return SOURCE_TIER_CONFIG[sourceType] ?? 'TIER_4';
}
