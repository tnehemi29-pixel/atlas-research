import { describe, expect, it } from 'vitest';
import { MAX_CHARS_PER_SECTION, MAX_TOTAL_CHARS, selectSectionsForAnalysis, selectSectionsForComparison } from './sectionSelection';
import type { SectionInput } from './sectionSelection';

function section(sectionType: SectionInput['sectionType'], length: number): SectionInput {
  return { sectionType, title: sectionType, content: 'x'.repeat(length) };
}

describe('selectSectionsForAnalysis', () => {
  it('excludes FINANCIAL_STATEMENTS — numeric tables are handled by computed financial data, not sent to the LLM', () => {
    const sections = [section('BUSINESS', 100), section('FINANCIAL_STATEMENTS', 100)];
    const selected = selectSectionsForAnalysis(sections);
    expect(selected.map((s) => s.sectionType)).toEqual(['BUSINESS']);
  });

  it('includes every other narrative section type', () => {
    const types: SectionInput['sectionType'][] = [
      'BUSINESS', 'RISK_FACTORS', 'MDA', 'LIQUIDITY', 'MARKET_RISK', 'LEGAL_PROCEEDINGS', 'CONTROLS_AND_PROCEDURES', 'EIGHT_K_ITEM',
    ];
    const sections = types.map((t) => section(t, 50));
    const selected = selectSectionsForAnalysis(sections);
    expect(selected.map((s) => s.sectionType)).toEqual(types);
  });

  it('does not truncate a section within the per-section budget', () => {
    const selected = selectSectionsForAnalysis([section('RISK_FACTORS', 100)]);
    expect(selected[0]?.truncated).toBe(false);
    expect(selected[0]?.content).toHaveLength(100);
  });

  it('truncates a single section that exceeds the per-section budget', () => {
    const selected = selectSectionsForAnalysis([section('RISK_FACTORS', MAX_CHARS_PER_SECTION + 5000)]);
    expect(selected[0]?.truncated).toBe(true);
    expect(selected[0]?.content).toHaveLength(MAX_CHARS_PER_SECTION);
    expect(selected[0]?.originalCharCount).toBe(MAX_CHARS_PER_SECTION + 5000);
  });

  it('enforces the total character budget across multiple large sections', () => {
    // Three sections each at the per-section cap would exceed the total budget.
    const sections = [
      section('BUSINESS', MAX_CHARS_PER_SECTION),
      section('RISK_FACTORS', MAX_CHARS_PER_SECTION),
      section('MDA', MAX_CHARS_PER_SECTION),
      section('LIQUIDITY', MAX_CHARS_PER_SECTION),
      section('MARKET_RISK', MAX_CHARS_PER_SECTION),
      section('LEGAL_PROCEEDINGS', MAX_CHARS_PER_SECTION),
    ];
    const selected = selectSectionsForAnalysis(sections);
    const totalChars = selected.reduce((sum, s) => sum + s.content.length, 0);
    expect(totalChars).toBeLessThanOrEqual(MAX_TOTAL_CHARS);
  });

  it('drops sections entirely once the total budget is exhausted, rather than sending an empty stub', () => {
    const sections = Array.from({ length: 10 }, (_, i) => section('RISK_FACTORS', MAX_CHARS_PER_SECTION));
    const selected = selectSectionsForAnalysis(sections);
    expect(selected.length).toBeLessThan(sections.length);
  });
});

describe('selectSectionsForComparison', () => {
  it('only includes Risk Factors, MD&A, and Liquidity — sections whose language plausibly changes between filings', () => {
    const sections = [section('BUSINESS', 50), section('RISK_FACTORS', 50), section('MDA', 50), section('CONTROLS_AND_PROCEDURES', 50)];
    const selected = selectSectionsForComparison(sections);
    expect(selected.map((s) => s.sectionType).sort()).toEqual(['MDA', 'RISK_FACTORS']);
  });
});
