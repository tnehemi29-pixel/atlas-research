import { calculateFreeCashFlow } from '@/lib/analytics/ratios';

/**
 * Milestone 14 spec section 6 — automated financial-statement reconciliation
 * checks, with tolerance thresholds (spec: "Allow for accounting/data-
 * provider differences. Do NOT require exact equality"). Every check is a
 * pure function over already-fetched FinancialPeriod fields (Milestone 3) —
 * this module never fetches data itself and never mutates a statement; it
 * only reports whether two independently-reported numbers agree.
 *
 * A check is CHECKABLE only when every required input is present. A missing
 * input is never treated as a failure (that's what data-completeness checks
 * are for) and never silently treated as zero — it's reported as
 * `checkable: false`, matching Milestone 13's InvalidationEvaluation's own
 * "checkable" discipline for the same reason: "cannot verify" and "verified
 * and it failed" are different facts and must never be collapsed into one.
 */

export const DEFAULT_TOLERANCE_PERCENT = 0.02; // 2% of the larger figure
// A floor tolerance in dollars, so a reconciliation on a small-cap company's
// small-dollar line items doesn't fail on rounding noise the percent-based
// tolerance alone wouldn't catch.
export const DEFAULT_TOLERANCE_ABSOLUTE_FLOOR = 1_000_000;

export interface ReconciliationCheck {
  check: string;
  checkable: boolean;
  passed: boolean;
  actual: number | null;
  expected: number | null;
  differenceAbsolute: number | null;
  differencePercent: number | null;
  tolerancePercent: number;
  detail: string;
}

function withinTolerance(actual: number, expected: number, tolerancePercent: number, absoluteFloor: number): boolean {
  const diff = Math.abs(actual - expected);
  const allowed = Math.max(Math.abs(expected) * tolerancePercent, absoluteFloor);
  return diff <= allowed;
}

/** Exported so other integrity modules (marketDataValidation.ts) build their
 * own tolerance-based checks the exact same way, rather than a second,
 * possibly-drifting implementation of "what counts as reconciling." */
export function buildCheck(
  check: string,
  actual: number | null,
  expected: number | null,
  tolerancePercent: number = DEFAULT_TOLERANCE_PERCENT,
  absoluteFloor: number = DEFAULT_TOLERANCE_ABSOLUTE_FLOOR,
): ReconciliationCheck {
  if (actual === null || expected === null) {
    return {
      check,
      checkable: false,
      passed: false,
      actual,
      expected,
      differenceAbsolute: null,
      differencePercent: null,
      tolerancePercent,
      detail: `${check}: cannot verify — one or more required figures is unavailable.`,
    };
  }

  const differenceAbsolute = actual - expected;
  const differencePercent = expected !== 0 ? differenceAbsolute / Math.abs(expected) : null;
  const passed = withinTolerance(actual, expected, tolerancePercent, absoluteFloor);

  return {
    check,
    checkable: true,
    passed,
    actual,
    expected,
    differenceAbsolute,
    differencePercent,
    tolerancePercent,
    detail: passed
      ? `${check} reconciles within tolerance.`
      : `${check} does not reconcile: reported ${actual.toLocaleString()} vs. expected ${expected.toLocaleString()} (difference ${differenceAbsolute.toLocaleString()}).`,
  };
}

/** Assets ≈ Liabilities + Equity. */
export function checkBalanceSheetReconciliation(input: { totalAssets: number | null; totalLiabilities: number | null; stockholdersEquity: number | null }): ReconciliationCheck {
  const expected = input.totalLiabilities !== null && input.stockholdersEquity !== null ? input.totalLiabilities + input.stockholdersEquity : null;
  return buildCheck('Balance sheet (Assets = Liabilities + Equity)', input.totalAssets, expected);
}

/** Gross Profit ≈ Revenue - COGS. */
export function checkGrossProfitReconciliation(input: { revenue: number | null; costOfRevenue: number | null; grossProfit: number | null }): ReconciliationCheck {
  const expected = input.revenue !== null && input.costOfRevenue !== null ? input.revenue - input.costOfRevenue : null;
  return buildCheck('Gross profit (Revenue - COGS)', input.grossProfit, expected);
}

/** Operating Income ≈ Gross Profit - Operating Expenses. */
export function checkOperatingIncomeReconciliation(input: { grossProfit: number | null; operatingExpenses: number | null; operatingIncome: number | null }): ReconciliationCheck {
  const expected = input.grossProfit !== null && input.operatingExpenses !== null ? input.grossProfit - input.operatingExpenses : null;
  return buildCheck('Operating income (Gross Profit - OpEx)', input.operatingIncome, expected);
}

/** FCF ≈ Operating Cash Flow - Capex — reuses lib/analytics/ratios.ts's
 * calculateFreeCashFlow directly so this check and the number Atlas
 * displays everywhere else are always computed by the exact same formula. */
export function checkFreeCashFlowReconciliation(input: { operatingCashFlow: number | null; capex: number | null; freeCashFlow: number | null }): ReconciliationCheck {
  const expected = calculateFreeCashFlow(input.operatingCashFlow, input.capex);
  return buildCheck('Free cash flow (OCF - Capex)', input.freeCashFlow, expected);
}

/** Ending Cash ≈ Beginning Cash + Net Change in Cash, where beginning cash
 * is the PRIOR period's own ending cash balance and net change is the sum
 * of the three cash-flow-statement sections for the CURRENT period. */
export function checkCashRollForwardReconciliation(input: {
  priorPeriodCash: number | null;
  currentPeriodCash: number | null;
  operatingCashFlow: number | null;
  investingCashFlow: number | null;
  financingCashFlow: number | null;
}): ReconciliationCheck {
  const netChange =
    input.operatingCashFlow !== null && input.investingCashFlow !== null && input.financingCashFlow !== null
      ? input.operatingCashFlow + input.investingCashFlow + input.financingCashFlow
      : null;
  const expected = input.priorPeriodCash !== null && netChange !== null ? input.priorPeriodCash + netChange : null;
  return buildCheck('Cash roll-forward (Beginning Cash + Net Change)', input.currentPeriodCash, expected);
}

/** Runs every statement-level check this module supports for one financial
 * period (plus the prior period's ending cash, when available, for the
 * roll-forward check) and returns them all together — the shape
 * lib/services/dataQualityService.ts persists as CALCULATION_INTEGRITY
 * DataQualityChecks. */
export interface FinancialPeriodReconciliationInput {
  revenue: number | null;
  costOfRevenue: number | null;
  grossProfit: number | null;
  operatingExpenses: number | null;
  operatingIncome: number | null;
  totalAssets: number | null;
  totalLiabilities: number | null;
  stockholdersEquity: number | null;
  operatingCashFlow: number | null;
  capex: number | null;
  freeCashFlow: number | null;
  investingCashFlow: number | null;
  financingCashFlow: number | null;
  cashAndEquivalents: number | null;
  priorPeriodCashAndEquivalents: number | null;
}

export function runFinancialReconciliation(input: FinancialPeriodReconciliationInput): ReconciliationCheck[] {
  return [
    checkBalanceSheetReconciliation(input),
    checkGrossProfitReconciliation(input),
    checkOperatingIncomeReconciliation(input),
    checkFreeCashFlowReconciliation(input),
    checkCashRollForwardReconciliation({
      priorPeriodCash: input.priorPeriodCashAndEquivalents,
      currentPeriodCash: input.cashAndEquivalents,
      operatingCashFlow: input.operatingCashFlow,
      investingCashFlow: input.investingCashFlow,
      financingCashFlow: input.financingCashFlow,
    }),
  ];
}
