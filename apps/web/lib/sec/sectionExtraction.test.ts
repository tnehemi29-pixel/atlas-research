import { describe, expect, it } from 'vitest';
import { extractTextBlocks } from './htmlExtraction';
import { extractEightKSections, extractTenKSections, extractTenQSections } from './sectionExtraction';
import type { TextBlock } from './htmlExtraction';

function textBlocks(...texts: string[]): TextBlock[] {
  return texts.map((text) => ({ type: 'text' as const, text }));
}

describe('extractTenKSections', () => {
  it('splits a simple 10-K into Business, Risk Factors, and MD&A sections', () => {
    const blocks = textBlocks(
      'Item 1. Business',
      'We make products.',
      'Item 1A. Risk Factors',
      'Risk one.',
      'Risk two.',
      "Item 7. Management's Discussion and Analysis",
      'Revenue grew.',
    );
    const sections = extractTenKSections(blocks);
    expect(sections.map((s) => s.sectionType)).toEqual(['BUSINESS', 'RISK_FACTORS', 'MDA']);
    expect(sections[0]?.content).toBe('We make products.');
    expect(sections[1]?.content).toBe('Risk one.\n\nRisk two.');
    expect(sections[2]?.content).toBe('Revenue grew.');
  });

  it('carves Liquidity and Capital Resources out of the MD&A range as its own section', () => {
    const blocks = textBlocks(
      "Item 7. Management's Discussion and Analysis",
      'Results of operations commentary.',
      'Liquidity and Capital Resources',
      'We have $5B in cash.',
      'Item 7A. Quantitative and Qualitative Disclosures About Market Risk',
      'Interest rate exposure.',
    );
    const sections = extractTenKSections(blocks);
    expect(sections.map((s) => s.sectionType)).toEqual(['MDA', 'LIQUIDITY', 'MARKET_RISK']);
    expect(sections[0]?.content).toBe('Results of operations commentary.');
    expect(sections[1]?.content).toBe('We have $5B in cash.');
    expect(sections[2]?.content).toBe('Interest rate exposure.');
  });

  it('picks the real section over a Table of Contents reference by taking the last match', () => {
    const blocks = textBlocks(
      'TABLE OF CONTENTS',
      'Item 1. Business ... 3', // ToC entry — short, matches the pattern too
      'Item 1A. Risk Factors ... 12',
      'Item 1. Business', // the real section starts here
      'Full business description spanning many paragraphs.',
      'Item 1A. Risk Factors',
      'The real risk factors content.',
    );
    const sections = extractTenKSections(blocks);
    const business = sections.find((s) => s.sectionType === 'BUSINESS');
    const risks = sections.find((s) => s.sectionType === 'RISK_FACTORS');
    expect(business?.content).toBe('Full business description spanning many paragraphs.');
    expect(risks?.content).toBe('The real risk factors content.');
  });

  it('ignores a paragraph that merely starts with matching words but is not a standalone heading block', () => {
    const blocks = textBlocks(
      'Item 1. Business',
      'Item 7 of our credit agreement requires us to maintain certain covenants, which we discuss further below in a very long sentence that keeps going and going well past what any heading would reasonably be, since this is prose embedded in a paragraph rather than a section title on its own line.',
    );
    const sections = extractTenKSections(blocks);
    expect(sections).toHaveLength(1);
    expect(sections[0]?.sectionType).toBe('BUSINESS');
  });

  it('returns no sections when no recognizable headings are present', () => {
    const sections = extractTenKSections(textBlocks('Just some unrelated text.'));
    expect(sections).toHaveLength(0);
  });
});

describe('extractTenQSections', () => {
  it('distinguishes Part I Item 1 (Financial Statements) from Part II Item 1 (Legal Proceedings) by heading text, not item number', () => {
    const blocks = textBlocks(
      'PART I',
      'Item 1. Financial Statements',
      'Condensed balance sheet data.',
      'Item 2. Management’s Discussion and Analysis',
      'Quarterly commentary.',
      'PART II',
      'Item 1. Legal Proceedings',
      'No material legal proceedings.',
    );
    const sections = extractTenQSections(blocks);
    expect(sections.map((s) => s.sectionType)).toEqual(['FINANCIAL_STATEMENTS', 'MDA', 'LEGAL_PROCEEDINGS']);
    expect(sections[2]?.content).toBe('No material legal proceedings.');
  });
});

describe('extractEightKSections', () => {
  it('extracts item code and title from standardized 8-K item headings', () => {
    const blocks = textBlocks(
      'Item 2.02 Results of Operations and Financial Condition',
      'The company announced quarterly earnings.',
      'Item 9.01 Financial Statements and Exhibits',
      'See attached exhibits.',
    );
    const sections = extractEightKSections(blocks);
    expect(sections).toHaveLength(2);
    expect(sections[0]).toMatchObject({
      sectionType: 'EIGHT_K_ITEM',
      itemCode: '2.02',
      content: 'The company announced quarterly earnings.',
    });
    expect(sections[1]?.itemCode).toBe('9.01');
  });

  it('handles multiple items disclosed under one 8-K correctly, each as its own section', () => {
    const blocks = textBlocks(
      'Item 5.02 Departure of Directors or Certain Officers',
      'The CFO resigned effective immediately.',
      'Item 8.01 Other Events',
      'The company also announced a new office lease.',
    );
    const sections = extractEightKSections(blocks);
    expect(sections.map((s) => s.itemCode)).toEqual(['5.02', '8.01']);
  });
});

describe('end-to-end: extractTextBlocks + extractTenKSections against realistic HTML', () => {
  it('correctly sections a synthetic 10-K with a real ToC and non-semantic bolded headings', () => {
    const html = `
      <html><body>
        <div style="text-align:center"><b>TABLE OF CONTENTS</b></div>
        <p>Item 1. Business ....... 4</p>
        <p>Item 1A. Risk Factors ....... 15</p>
        <div style="font-weight:bold">Item 1. Business</div>
        <p>Acme Corp designs and sells widgets globally.</p>
        <div style="font-weight:bold">Item 1A. Risk Factors</div>
        <p>Our supply chain is concentrated in a small number of vendors.</p>
        <p>We face intense competition in our markets.</p>
      </body></html>
    `;
    const blocks = extractTextBlocks(html);
    const sections = extractTenKSections(blocks);

    const business = sections.find((s) => s.sectionType === 'BUSINESS');
    const risks = sections.find((s) => s.sectionType === 'RISK_FACTORS');
    expect(business?.content).toContain('Acme Corp designs and sells widgets globally.');
    expect(risks?.content).toContain('concentrated in a small number of vendors');
    expect(risks?.content).toContain('intense competition');
  });
});
