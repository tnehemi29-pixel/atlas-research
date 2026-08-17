import type { TextBlock } from './htmlExtraction';

/**
 * Identifies named sections (10-K/10-Q Items, 8-K Items) within a filing's
 * ordered text blocks. Matches on the heading's own text via documented
 * regex patterns rather than assuming any particular HTML structure — real
 * EDGAR filings almost never use semantic `<h1>`-`<h6>` tags for these
 * headings (see htmlExtraction.ts), so structure alone can't identify them.
 */

export type FilingSectionTypeValue =
  | 'BUSINESS'
  | 'RISK_FACTORS'
  | 'MDA'
  | 'LIQUIDITY'
  | 'MARKET_RISK'
  | 'FINANCIAL_STATEMENTS'
  | 'LEGAL_PROCEEDINGS'
  | 'CONTROLS_AND_PROCEDURES'
  | 'EIGHT_K_ITEM'
  | 'OTHER';

export interface ExtractedSection {
  sectionType: FilingSectionTypeValue;
  title: string;
  itemCode: string | null;
  /** Raw block text joined with blank lines — textCleaning.ts normalizes this. */
  content: string;
}

interface SectionPattern {
  type: FilingSectionTypeValue;
  regex: RegExp;
}

// A genuine section heading is short — a paragraph of prose that happens to
// start with matching words is not a heading. This also keeps the O(n *
// patterns) scan cheap on a filing with thousands of blocks.
const MAX_HEADING_LENGTH = 200;

// Matched against the ENTIRE trimmed text of a block (^...$ with the 'm'
// flag off — deliberately anchored at both ends so "Item 7 of our credit
// agreement requires..." mid-sentence never matches). Order doesn't matter;
// each block is tested against every pattern for its form type.
const TEN_K_PATTERNS: SectionPattern[] = [
  { type: 'BUSINESS', regex: /^item\s+1\.?\s*business\b/i },
  { type: 'RISK_FACTORS', regex: /^item\s+1a\.?\s*risk\s+factors\b/i },
  { type: 'LEGAL_PROCEEDINGS', regex: /^item\s+3\.?\s*legal\s+proceedings\b/i },
  { type: 'MDA', regex: /^item\s+7\.?\s*management.s\s+discussion\s+and\s+analysis\b/i },
  {
    type: 'MARKET_RISK',
    regex: /^item\s+7a\.?\s*quantitative\s+and\s+qualitative\s+disclosures?\s+about\s+market\s+risk\b/i,
  },
  { type: 'FINANCIAL_STATEMENTS', regex: /^item\s+8\.?\s*financial\s+statements/i },
  { type: 'CONTROLS_AND_PROCEDURES', regex: /^item\s+9a\.?\s*controls\s+and\s+procedures\b/i },
];

const TEN_Q_PATTERNS: SectionPattern[] = [
  { type: 'FINANCIAL_STATEMENTS', regex: /^item\s+1\.?\s*(condensed\s+)?(consolidated\s+)?financial\s+statements\b/i },
  { type: 'MDA', regex: /^item\s+2\.?\s*management.s\s+discussion\s+and\s+analysis\b/i },
  {
    type: 'MARKET_RISK',
    regex: /^item\s+3\.?\s*quantitative\s+and\s+qualitative\s+disclosures?\s+about\s+market\s+risk\b/i,
  },
  { type: 'CONTROLS_AND_PROCEDURES', regex: /^item\s+4\.?\s*controls\s+and\s+procedures\b/i },
  // Part II items — distinguished from Part I's "Item 1" by the trailing
  // words, not the item number (which resets in Part II), so no separate
  // Part-tracking is needed.
  { type: 'LEGAL_PROCEEDINGS', regex: /^item\s+1\.?\s*legal\s+proceedings\b/i },
  { type: 'RISK_FACTORS', regex: /^item\s+1a\.?\s*risk\s+factors\b/i },
];

// Checked for every filing type, independent of "Item N" numbering —
// Liquidity and Capital Resources is conventionally a sub-heading inside
// MD&A rather than its own top-level Item, but it's important enough to
// analyze as its own citable section. Because this is matched in the same
// unified pass as the Item patterns below, when it appears between the MD&A
// heading and the next Item heading, it naturally splits out of MD&A's
// range with no special-case carve-out logic required.
const LIQUIDITY_PATTERN: SectionPattern = {
  type: 'LIQUIDITY',
  regex: /^liquidity\s+and\s+capital\s+resources\b/i,
};

const EIGHT_K_ITEM_REGEX = /^item\s+(\d+\.\d+)\.?\s*(.*)$/i;

interface HeadingMatch {
  blockIndex: number;
  type: FilingSectionTypeValue;
  title: string;
  itemCode: string | null;
}

function findAllMatches(blocks: TextBlock[], patterns: SectionPattern[]): HeadingMatch[] {
  const matches: HeadingMatch[] = [];

  blocks.forEach((block, index) => {
    if (block.type !== 'text') return;
    if (block.text.length === 0 || block.text.length > MAX_HEADING_LENGTH) return;

    for (const pattern of patterns) {
      if (pattern.regex.test(block.text)) {
        matches.push({ blockIndex: index, type: pattern.type, title: block.text, itemCode: null });
        return; // one match per block — first pattern to match wins
      }
    }
  });

  return matches;
}

/**
 * Real SEC filings almost always list every section in a clickable Table of
 * Contents near the top, which also matches these same heading patterns.
 * The well-established, practical heuristic for telling a ToC entry from
 * the real section start (without needing to detect "is this inside a
 * <table>" or other structure that varies by filer) is: the ToC reference
 * always comes first in document order, and the real section is what's
 * left after it — so taking the LAST match of each type reliably selects
 * the real section over any ToC/cross-reference occurrences.
 */
function keepLastMatchPerType(matches: HeadingMatch[]): HeadingMatch[] {
  const lastByType = new Map<string, HeadingMatch>();
  for (const match of matches) {
    const key = match.itemCode ?? match.type;
    lastByType.set(key, match); // later matches overwrite earlier ones
  }
  return [...lastByType.values()].sort((a, b) => a.blockIndex - b.blockIndex);
}

function joinBlocks(blocks: TextBlock[], from: number, to: number): string {
  return blocks
    .slice(from, to)
    .map((block) => block.text)
    .join('\n\n');
}

function buildSections(blocks: TextBlock[], matches: HeadingMatch[]): ExtractedSection[] {
  const ordered = keepLastMatchPerType(matches);

  return ordered.map((match, i) => {
    const nextBoundary = ordered[i + 1]?.blockIndex ?? blocks.length;
    return {
      sectionType: match.type,
      title: match.title,
      itemCode: match.itemCode,
      content: joinBlocks(blocks, match.blockIndex + 1, nextBoundary),
    };
  });
}

/** Identifies 10-K sections: Business, Risk Factors, Legal Proceedings,
 * MD&A (+ Liquidity carved out of it where present), Market Risk, Financial
 * Statements, Controls and Procedures. */
export function extractTenKSections(blocks: TextBlock[]): ExtractedSection[] {
  const matches = [...findAllMatches(blocks, TEN_K_PATTERNS), ...findAllMatches(blocks, [LIQUIDITY_PATTERN])];
  return buildSections(blocks, matches);
}

/** Identifies 10-Q sections — the same idea as the 10-K, with 10-Q's item
 * numbering (Part I/Part II items disambiguated by heading text). */
export function extractTenQSections(blocks: TextBlock[]): ExtractedSection[] {
  const matches = [...findAllMatches(blocks, TEN_Q_PATTERNS), ...findAllMatches(blocks, [LIQUIDITY_PATTERN])];
  return buildSections(blocks, matches);
}

/**
 * Identifies 8-K sections by their standardized "Item X.XX" headings — SEC's
 * own 8-K item numbering is stable and self-describing (the heading text
 * itself names the event, e.g. "Item 2.02 Results of Operations and
 * Financial Condition"), so no separate pattern table is needed here; see
 * lib/sec/eightKItems.ts for the category/label lookup used at display time.
 */
export function extractEightKSections(blocks: TextBlock[]): ExtractedSection[] {
  const matches: HeadingMatch[] = [];

  blocks.forEach((block, index) => {
    if (block.type !== 'text') return;
    if (block.text.length > MAX_HEADING_LENGTH) return;

    const match = EIGHT_K_ITEM_REGEX.exec(block.text.trim());
    if (match) {
      matches.push({ blockIndex: index, type: 'EIGHT_K_ITEM', itemCode: match[1] ?? null, title: block.text });
    }
  });

  return buildSections(blocks, matches);
}
