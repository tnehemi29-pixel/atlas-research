import { describe, expect, it } from 'vitest';
import { searchSections } from './search';
import type { SearchableSection } from './search';

function section(overrides: Partial<SearchableSection> = {}): SearchableSection {
  return {
    sectionType: 'RISK_FACTORS',
    title: 'Item 1A. Risk Factors',
    anchor: 'risk-factors',
    content: 'Our business faces significant competition from established players in the industry.',
    ...overrides,
  };
}

describe('searchSections', () => {
  it('finds a case-insensitive match and splits the snippet around it', () => {
    const results = searchSections([section()], 'COMPETITION');
    expect(results).toHaveLength(1);
    expect(results[0]?.match).toBe('competition'); // preserves original casing from the source text
    expect(results[0]?.before).toContain('faces significant');
    expect(results[0]?.after).toContain('from established players');
  });

  it('returns an empty array for an empty or whitespace-only query', () => {
    expect(searchSections([section()], '')).toEqual([]);
    expect(searchSections([section()], '   ')).toEqual([]);
  });

  it('returns no results when nothing matches', () => {
    expect(searchSections([section()], 'nonexistent phrase')).toEqual([]);
  });

  it('finds multiple matches within the same section', () => {
    const results = searchSections(
      [section({ content: 'Risk one is real. Risk two is also real. Risk three is real too.' })],
      'risk',
    );
    expect(results).toHaveLength(3);
  });

  it('finds matches across multiple sections and preserves section identity', () => {
    const sections = [
      section({ sectionType: 'RISK_FACTORS', title: 'Item 1A. Risk Factors', content: 'A liquidity risk exists.' }),
      section({ sectionType: 'LIQUIDITY', title: 'Liquidity and Capital Resources', content: 'Our liquidity position is strong.' }),
    ];
    const results = searchSections(sections, 'liquidity');
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.sectionType)).toEqual(['RISK_FACTORS', 'LIQUIDITY']);
  });

  it('caps the number of matches returned per section', () => {
    const repeated = 'word '.repeat(20);
    const results = searchSections([section({ content: repeated })], 'word');
    expect(results.length).toBeLessThanOrEqual(5);
  });
});
