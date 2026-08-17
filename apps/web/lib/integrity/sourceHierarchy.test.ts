import { describe, expect, it } from 'vitest';
import { getSourceTier, SOURCE_TIER_LABELS } from './sourceHierarchy';

describe('getSourceTier', () => {
  it('classifies SEC filings and audited statements as Tier 1', () => {
    expect(getSourceTier('SEC_FILING')).toBe('TIER_1');
    expect(getSourceTier('TEN_K')).toBe('TIER_1');
    expect(getSourceTier('FINANCIAL_STATEMENT')).toBe('TIER_1');
    expect(getSourceTier('EARNINGS_RELEASE')).toBe('TIER_1');
  });

  it('classifies transcripts, presentations, and Atlas-derived models as Tier 2', () => {
    expect(getSourceTier('EARNINGS_CALL')).toBe('TIER_2');
    expect(getSourceTier('INVESTOR_PRESENTATION')).toBe('TIER_2');
    expect(getSourceTier('DCF')).toBe('TIER_2');
    expect(getSourceTier('COMPS')).toBe('TIER_2');
  });

  it('classifies other reputable sources as Tier 3', () => {
    expect(getSourceTier('NEWS')).toBe('TIER_3');
  });

  it('classifies manual/AI-generated/unverified sources as Tier 4', () => {
    expect(getSourceTier('MANUAL')).toBe('TIER_4');
    expect(getSourceTier('AI_GENERATED')).toBe('TIER_4');
    expect(getSourceTier('UNVERIFIED')).toBe('TIER_4');
  });

  it('defaults an unrecognized source type to Tier 4 — never assumed trustworthy', () => {
    expect(getSourceTier('SOMETHING_MADE_UP')).toBe('TIER_4');
  });

  it('has a human-readable label for every tier', () => {
    expect(SOURCE_TIER_LABELS.TIER_1).toMatch(/SEC/);
    expect(SOURCE_TIER_LABELS.TIER_4).toMatch(/unverified/i);
  });
});
