import { describe, expect, it } from 'vitest';
import { getImpactedResearchAreas } from './impactMapping';

describe('getImpactedResearchAreas', () => {
  it('matches the spec worked example for a guidance change', () => {
    const areas = getImpactedResearchAreas('GUIDANCE_CHANGE').map((i) => i.area);
    expect(areas).toEqual(expect.arrayContaining(['FINANCIALS', 'DCF', 'GROWTH', 'INVESTMENT_THESIS']));
  });

  it('never phrases an impact as an automatic change', () => {
    const allTypes = [
      'NEW_FILING',
      'FINANCIAL_CHANGE',
      'MARGIN_CHANGE',
      'GUIDANCE_CHANGE',
      'DCF_VALUATION_CHANGE',
      'COMPS_VALUATION_CHANGE',
      'NEW_RESEARCH_REPORT',
      'RESEARCH_REPORT_UPDATED',
      'NEW_RISK',
      'CORPORATE_EVENT',
      'EARNINGS_CALL',
    ] as const;

    for (const type of allTypes) {
      const impacts = getImpactedResearchAreas(type);
      expect(impacts.length).toBeGreaterThan(0);
      for (const impact of impacts) {
        expect(impact.note.toLowerCase()).not.toMatch(/\b(will|has been changed|was updated automatically)\b/);
      }
    }
  });

  it('routes an acquisition 8-K to capital allocation and growth', () => {
    const areas = getImpactedResearchAreas('CORPORATE_EVENT', { eightKCategory: 'ACQUISITION' }).map((i) => i.area);
    expect(areas).toContain('CAPITAL_ALLOCATION');
    expect(areas).toContain('GROWTH');
  });

  it('routes an executive-change 8-K to management', () => {
    const areas = getImpactedResearchAreas('CORPORATE_EVENT', { eightKCategory: 'EXECUTIVE_CHANGE' }).map((i) => i.area);
    expect(areas).toContain('MANAGEMENT');
  });

  it('routes a bankruptcy/restructuring 8-K to risks', () => {
    const areas = getImpactedResearchAreas('CORPORATE_EVENT', { eightKCategory: 'BANKRUPTCY_RESTRUCTURING' }).map((i) => i.area);
    expect(areas).toContain('RISKS');
  });

  it('falls back to a default impact for an uncategorized corporate event', () => {
    const impacts = getImpactedResearchAreas('CORPORATE_EVENT');
    expect(impacts.length).toBeGreaterThan(0);
  });

  it('routes a DCF valuation change to DCF and investment thesis', () => {
    const areas = getImpactedResearchAreas('DCF_VALUATION_CHANGE').map((i) => i.area);
    expect(areas).toEqual(expect.arrayContaining(['DCF', 'INVESTMENT_THESIS']));
  });

  it('routes a comps valuation change to comps', () => {
    const areas = getImpactedResearchAreas('COMPS_VALUATION_CHANGE').map((i) => i.area);
    expect(areas).toContain('COMPS');
  });
});
