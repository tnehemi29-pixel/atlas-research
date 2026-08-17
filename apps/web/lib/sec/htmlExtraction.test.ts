import { describe, expect, it } from 'vitest';
import { extractTextBlocks } from './htmlExtraction';

describe('extractTextBlocks', () => {
  it('extracts a simple sequence of headings and paragraphs in document order', () => {
    const html = `
      <html><body>
        <h1>Item 1. Business</h1>
        <p>We design, manufacture, and sell things.</p>
        <h1>Item 1A. Risk Factors</h1>
        <p>Our business is subject to numerous risks.</p>
      </body></html>
    `;
    const blocks = extractTextBlocks(html);
    expect(blocks.map((b) => b.text)).toEqual([
      'Item 1. Business',
      'We design, manufacture, and sell things.',
      'Item 1A. Risk Factors',
      'Our business is subject to numerous risks.',
    ]);
  });

  it('does not duplicate text when a <div> wraps a <p> (only the leaf contributes)', () => {
    const html = `<div class="wrapper"><p>Only counted once.</p></div>`;
    const blocks = extractTextBlocks(html);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.text).toBe('Only counted once.');
  });

  it('captures a non-semantic "heading" — a bolded <p>/<div> with no real <h1>-<h6> tag, common in real EDGAR filings', () => {
    const html = `
      <div style="font-weight:bold; font-size:12pt">ITEM 1A. RISK FACTORS</div>
      <p>Risk text here.</p>
    `;
    const blocks = extractTextBlocks(html);
    expect(blocks.map((b) => b.text)).toEqual(['ITEM 1A. RISK FACTORS', 'Risk text here.']);
  });

  it('unwraps inline XBRL tags (<ix:nonFraction> etc.) so the numeric text inside them is preserved', () => {
    const html = `<p>Revenue was $<ix:nonFraction name="us-gaap:Revenues">1,234</ix:nonFraction> million.</p>`;
    const blocks = extractTextBlocks(html);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.text).toContain('1,234');
    expect(blocks[0]?.text).toContain('Revenue was $');
  });

  it('removes <script> and <style> content entirely', () => {
    const html = `
      <style>.foo { color: red; }</style>
      <script>var x = "should not appear";</script>
      <p>Real content.</p>
    `;
    const blocks = extractTextBlocks(html);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.text).toBe('Real content.');
  });

  it('converts a table into a single "table" block preserving row/cell structure, not one block per cell', () => {
    const html = `
      <table>
        <tr><th>Year</th><th>Revenue</th></tr>
        <tr><td>2023</td><td>$100</td></tr>
        <tr><td>2024</td><td>$120</td></tr>
      </table>
    `;
    const blocks = extractTextBlocks(html);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.type).toBe('table');
    expect(blocks[0]?.text).toBe('Year | Revenue\n2023 | $100\n2024 | $120');
  });

  it('collapses excessive whitespace and normalizes internal newlines', () => {
    const html = `<p>Line one.\n\n\n   Line   two   with   extra   spaces.</p>`;
    const blocks = extractTextBlocks(html);
    expect(blocks[0]?.text).toBe('Line one.\nLine two with extra spaces.');
  });

  it('skips empty blocks rather than emitting blank entries', () => {
    const html = `<div></div><p>   </p><p>Real text.</p>`;
    const blocks = extractTextBlocks(html);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.text).toBe('Real text.');
  });

  it('handles deeply nested structure (div > div > table wrapper, a real EDGAR pattern)', () => {
    const html = `
      <div>
        <div>
          <div>
            <p>Item 7. Management's Discussion and Analysis</p>
            <div><div><p>Revenue increased year over year.</p></div></div>
          </div>
        </div>
      </div>
    `;
    const blocks = extractTextBlocks(html);
    expect(blocks.map((b) => b.text)).toEqual([
      "Item 7. Management's Discussion and Analysis",
      'Revenue increased year over year.',
    ]);
  });
});
