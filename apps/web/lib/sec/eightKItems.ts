/**
 * SEC Form 8-K's own item taxonomy — a stable, publicly-documented
 * regulatory numbering scheme (see SEC Release No. 33-8400), not something
 * Atlas Research invents or guesses. Mapping an item CODE to a category is
 * a deterministic lookup, never an AI judgment call — see importance.ts,
 * which builds on this for rule-based (not AI) filing-importance
 * classification, per the milestone's explicit requirement that importance
 * be rule-based or clearly labeled as AI.
 */

export type EightKCategory =
  | 'EARNINGS'
  | 'ACQUISITION'
  | 'EXECUTIVE_CHANGE'
  | 'FINANCING'
  | 'BANKRUPTCY_RESTRUCTURING'
  | 'MAJOR_CONTRACT'
  | 'LEGAL_EVENT'
  | 'OTHER';

export interface EightKItemInfo {
  /** SEC's own official item title. */
  label: string;
  category: EightKCategory;
}

// SEC's official item labels, current as of the most recent 8-K item set
// (Item 1.05 "Material Cybersecurity Incidents" was added in 2023).
export const EIGHT_K_ITEM_CATEGORIES: Record<string, EightKItemInfo> = {
  '1.01': { label: 'Entry into a Material Definitive Agreement', category: 'MAJOR_CONTRACT' },
  '1.02': { label: 'Termination of a Material Definitive Agreement', category: 'MAJOR_CONTRACT' },
  '1.03': { label: 'Bankruptcy or Receivership', category: 'BANKRUPTCY_RESTRUCTURING' },
  '1.04': { label: 'Mine Safety – Reporting of Shutdowns and Patterns of Violations', category: 'OTHER' },
  '1.05': { label: 'Material Cybersecurity Incidents', category: 'OTHER' },

  '2.01': { label: 'Completion of Acquisition or Disposition of Assets', category: 'ACQUISITION' },
  '2.02': { label: 'Results of Operations and Financial Condition', category: 'EARNINGS' },
  '2.03': {
    label: 'Creation of a Direct Financial Obligation or an Obligation under an Off-Balance Sheet Arrangement',
    category: 'FINANCING',
  },
  '2.04': {
    label: 'Triggering Events That Accelerate or Increase a Direct Financial Obligation',
    category: 'FINANCING',
  },
  '2.05': { label: 'Costs Associated with Exit or Disposal Activities', category: 'OTHER' },
  '2.06': { label: 'Material Impairments', category: 'OTHER' },

  '3.01': { label: 'Notice of Delisting or Failure to Satisfy a Continued Listing Rule', category: 'OTHER' },
  '3.02': { label: 'Unregistered Sales of Equity Securities', category: 'FINANCING' },
  '3.03': { label: 'Material Modification to Rights of Security Holders', category: 'OTHER' },

  '4.01': { label: "Changes in Registrant's Certifying Accountant", category: 'OTHER' },
  '4.02': {
    label: 'Non-Reliance on Previously Issued Financial Statements or a Related Audit Report or Completed Interim Review',
    category: 'OTHER',
  },

  '5.01': { label: 'Changes in Control of Registrant', category: 'EXECUTIVE_CHANGE' },
  '5.02': {
    label: 'Departure of Directors or Certain Officers; Election of Directors; Appointment of Certain Officers',
    category: 'EXECUTIVE_CHANGE',
  },
  '5.03': { label: 'Amendments to Articles of Incorporation or Bylaws; Change in Fiscal Year', category: 'OTHER' },
  '5.04': {
    label: "Temporary Suspension of Trading Under Registrant's Employee Benefit Plans",
    category: 'OTHER',
  },
  '5.05': { label: "Amendments to the Registrant's Code of Ethics", category: 'OTHER' },
  '5.06': { label: 'Change in Shell Company Status', category: 'OTHER' },
  '5.07': { label: 'Submission of Matters to a Vote of Security Holders', category: 'OTHER' },
  '5.08': { label: 'Shareholder Director Nominations', category: 'OTHER' },

  '7.01': { label: 'Regulation FD Disclosure', category: 'OTHER' },
  '8.01': { label: 'Other Events', category: 'OTHER' },
  '9.01': { label: 'Financial Statements and Exhibits', category: 'OTHER' },
};

/** Looks up an 8-K item code's official label and category. Unknown/rare
 * codes (e.g. the asset-backed-securities Section 6 items) fall back to a
 * generic label rather than throwing — an unrecognized code is not an
 * error, just one Atlas doesn't have a friendly label for yet. */
export function categorizeEightKItem(itemCode: string): EightKItemInfo {
  return EIGHT_K_ITEM_CATEGORIES[itemCode] ?? { label: `Item ${itemCode}`, category: 'OTHER' };
}
