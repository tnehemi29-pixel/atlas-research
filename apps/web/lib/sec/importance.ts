import { categorizeEightKItem } from './eightKItems';
import type { ImportanceLevel, SecFilingTypeValue } from './types';

/**
 * Rule-based (never AI) importance classification for the research
 * timeline — "the importance classification must be based on explicit
 * rules or clearly labeled AI classification; do not present subjective
 * classifications as objective facts." These rules are the whole
 * classification: annual/quarterly results always matter to a research
 * workflow (High); a proxy statement is procedurally important but rarely
 * time-sensitive (Medium); an 8-K's importance depends on which item(s) it
 * discloses, via the same category table eightKItems.ts already defines.
 */

const HIGH_EIGHT_K_CATEGORIES = new Set(['EARNINGS', 'ACQUISITION', 'BANKRUPTCY_RESTRUCTURING']);
const MEDIUM_EIGHT_K_CATEGORIES = new Set(['EXECUTIVE_CHANGE', 'FINANCING', 'MAJOR_CONTRACT']);

/**
 * `itemCodes` should be every item disclosed in the same 8-K (a single 8-K
 * commonly discloses more than one item, e.g. "2.02,9.01") — importance is
 * the highest level implied by any of them, since a filing that includes
 * even one high-importance item deserves a researcher's attention.
 */
export function classifyFilingImportance(filingType: SecFilingTypeValue, itemCodes: string[] = []): ImportanceLevel {
  switch (filingType) {
    case 'TEN_K':
    case 'TEN_Q':
    case 'TWENTY_F':
      return 'High';
    case 'DEF_14A':
      return 'Medium';
    case 'EIGHT_K': {
      const categories = itemCodes.map((code) => categorizeEightKItem(code).category);
      if (categories.some((category) => HIGH_EIGHT_K_CATEGORIES.has(category))) return 'High';
      if (categories.some((category) => MEDIUM_EIGHT_K_CATEGORIES.has(category))) return 'Medium';
      return 'Low';
    }
    case 'OTHER':
    default:
      return 'Low';
  }
}
