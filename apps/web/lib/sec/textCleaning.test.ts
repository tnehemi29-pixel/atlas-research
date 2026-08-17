import { describe, expect, it } from 'vitest';
import { cleanSectionText } from './textCleaning';

describe('cleanSectionText', () => {
  it('removes a standalone page-number line', () => {
    expect(cleanSectionText('Some text.\n\n42\n\nMore text.')).toBe('Some text.\n\nMore text.');
  });

  it('removes a standalone "Table of Contents" line', () => {
    const result = cleanSectionText('Item 1. Business\n\nTable of Contents\n\nWe make things.');
    expect(result).not.toContain('Table of Contents');
    expect(result).toContain('We make things.');
  });

  it('never alters a dollar figure or number embedded in a sentence', () => {
    const text = 'Revenue increased to $1,234.5 million in fiscal 2024, up from $1,100.0 million.';
    expect(cleanSectionText(text)).toBe(text);
  });

  it('does not remove a line that merely starts with digits followed by real content', () => {
    const text = '2024 was a strong year for the company.';
    expect(cleanSectionText(text)).toBe(text);
  });

  it('collapses 3+ consecutive blank lines to a single paragraph break', () => {
    const result = cleanSectionText('Paragraph one.\n\n\n\n\nParagraph two.');
    expect(result).toBe('Paragraph one.\n\nParagraph two.');
  });

  it('normalizes internal multi-space runs without touching word content', () => {
    const result = cleanSectionText('Revenue   was    strong   this   quarter.');
    expect(result).toBe('Revenue was strong this quarter.');
  });

  it('trims leading and trailing whitespace from the whole block', () => {
    expect(cleanSectionText('\n\n  Some content.  \n\n')).toBe('Some content.');
  });

  it('preserves dates unchanged', () => {
    const text = 'The fiscal year ended December 31, 2024, and the 10-K was filed on February 15, 2025.';
    expect(cleanSectionText(text)).toBe(text);
  });
});
