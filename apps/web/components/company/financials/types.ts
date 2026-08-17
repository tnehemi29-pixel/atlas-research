import type { FinancialPeriodData } from '@erp/types';

/**
 * One row in a statement table. `get` receives both the period being
 * rendered in this column and the *full* (unsliced) period list, because
 * growth/margin rows need to look up a prior period that might fall outside
 * the currently-displayed range (e.g. computing YoY growth for the oldest
 * visible column when the user has the range set to "3 years").
 */
export interface StatementRow {
  key: string;
  label: string;
  get: (period: FinancialPeriodData, allPeriods: FinancialPeriodData[]) => number | null;
  format: (value: number | null) => string;
  /** Indents the label — sub-line-items under a subtotal. */
  indent?: boolean;
  /** Bold label + value — subtotal/total rows. */
  emphasis?: boolean;
  /** Smaller, muted, sign-colored — a growth/derived row nested under its parent. */
  isDerived?: boolean;
}
