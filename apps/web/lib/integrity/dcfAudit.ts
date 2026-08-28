import { computeEnterpriseValue, computeEquityValue, computeImpliedSharePrice } from '@/lib/valuation/bridge';
import type { DcfAssumptions, DcfMarketData, DcfResult } from '@/lib/valuation/types';
import type { IntegrityFinding, IntegrityFindingSeverity } from './types';

export type { IntegrityFinding, IntegrityFindingSeverity };

/**
 * Milestone 14 spec section 9 — a dedicated DCF audit. This module never
 * recomputes a DCF and never changes an assumption — it takes the exact
 * assumptions and result an existing `runDcf()` call already produced
 * (Milestone 5's engine, unchanged) and checks that the model's own
 * mathematical relationships actually hold, and that the one
 * "never let this silently produce a result" rule (Terminal Growth < WACC)
 * is enforced. A DCF that fails its own arithmetic is a bug, not a
 * disagreement between two data sources — so this module uses a much
 * tighter tolerance than financialReconciliation.ts's cross-source checks.
 */

// Internal-consistency checks compare a number Atlas computed against a
// recomputation of the exact same formula — the only real disagreement
// possible is a genuine bug, so the tolerance is tight: 0.5% or $10,
// whichever is larger (a few cents of floating-point noise should never
// trip this; a real formula bug always will).
const INTERNAL_TOLERANCE_PERCENT = 0.005;
const INTERNAL_TOLERANCE_ABSOLUTE_FLOOR = 10;

function withinInternalTolerance(actual: number, expected: number): boolean {
  const diff = Math.abs(actual - expected);
  const allowed = Math.max(Math.abs(expected) * INTERNAL_TOLERANCE_PERCENT, INTERNAL_TOLERANCE_ABSOLUTE_FLOOR);
  return diff <= allowed;
}

function relationshipCheck(check: string, actual: number | null, expected: number | null, severity: IntegrityFindingSeverity = 'HIGH'): IntegrityFinding {
  if (actual === null || expected === null) {
    return { check, severity: 'INFO', passed: true, message: `${check}: not applicable — one or both values are unavailable.` };
  }
  const passed = withinInternalTolerance(actual, expected);
  return {
    check,
    severity: passed ? 'INFO' : severity,
    passed,
    message: passed
      ? `${check} checks out.`
      : `${check} does not check out: model reports ${actual.toLocaleString()}, recomputing the same formula gives ${expected.toLocaleString()}.`,
  };
}

/** The one check the spec explicitly forbids letting a model "silently
 * produce a result" for. Only meaningful when the terminal value method is
 * perpetuity growth — an exit-multiple terminal value has no growth-vs-WACC
 * relationship to violate. */
export function checkTerminalGrowthBelowWacc(assumptions: DcfAssumptions, result: DcfResult): IntegrityFinding {
  if (assumptions.terminalValue.method !== 'perpetuityGrowth') {
    return { check: 'Terminal growth < WACC', severity: 'INFO', passed: true, message: 'Not applicable — terminal value uses the exit-multiple method.' };
  }
  const wacc = result.wacc.wacc.value;
  const terminalGrowth = assumptions.terminalValue.perpetuityGrowthRate;
  if (wacc === null) {
    return { check: 'Terminal growth < WACC', severity: 'INFO', passed: true, message: 'Cannot verify — WACC could not be computed.' };
  }
  const passed = terminalGrowth < wacc;
  return {
    check: 'Terminal growth < WACC',
    severity: passed ? 'INFO' : 'CRITICAL',
    passed,
    message: passed
      ? `Terminal growth (${(terminalGrowth * 100).toFixed(2)}%) is below WACC (${(wacc * 100).toFixed(2)}%).`
      : `CRITICAL MODEL ERROR: terminal growth (${(terminalGrowth * 100).toFixed(2)}%) is not below WACC (${(wacc * 100).toFixed(2)}%) — a perpetuity-growth terminal value is mathematically undefined or diverges in this case.`,
  };
}

/** Surfaces the DCF engine's own blocking validation issues (Milestone 5's
 * `issues`/`isValid`) as integrity findings — never a duplicate, second
 * validation pass, just a re-statement in this milestone's own finding
 * shape so the company integrity panel doesn't need to know two different
 * "is this DCF okay" vocabularies.
 *
 * Every field here only ever surfaces a finding while it's currently
 * failing — silence on success, same as this function has always behaved —
 * with one deliberate exception: `wacc`. A saved company-level cost-of-debt
 * override (Company.costOfDebtOverride) can turn a previously-blocking WACC
 * error into a valid, calculable WACC, and lib/services/integrityIssueService.ts's
 * syncIssuesFromFindings needs an explicit `passed: true` finding to ever
 * observe that transition and resolve the previously-tracked issue — a
 * check that's silently absent when it passes can never be observed to have
 * started passing. See AUTO_RESOLVABLE_FINDING_KEYS there. Every other
 * field's silence-on-success behavior is unchanged. */
export function checkDcfOwnValidation(result: DcfResult): IntegrityFinding[] {
  const findings: IntegrityFinding[] = result.issues
    .filter((issue) => issue.severity === 'ERROR')
    .map((issue) => ({
      check: `DCF validation: ${issue.field}`,
      // A genuinely missing/broken input (no market cap, no total debt, no
      // cost of equity) is CRITICAL — the platform is missing something it
      // should have. An analyst-assumption gap (a real company whose latest
      // filing just doesn't disclose interest expense) is a real, expected,
      // and common situation, not a data-quality failure — MEDIUM keeps it
      // visible without misrepresenting a normal case as the model being
      // broken. See ValidationIssue.assumptionRequired's doc comment.
      severity: issue.assumptionRequired ? ('MEDIUM' as const) : ('CRITICAL' as const),
      passed: false,
      message: issue.message,
    }));

  const hasFailingWaccFinding = findings.some((finding) => finding.check === 'DCF validation: wacc');
  // result.wacc.wacc.value !== null is a defensive re-check, not an
  // independent source of truth: the absence of a wacc ERROR issue above
  // already means whatever WACC value was validated was non-null and
  // positive. If that were ever untrue anyway, this simply emits nothing
  // (matching the prior/default behavior) rather than fabricate a "passed"
  // claim about a value that isn't actually there.
  if (!hasFailingWaccFinding && result.wacc.wacc.value !== null) {
    findings.push({
      check: 'DCF validation: wacc',
      severity: 'INFO',
      passed: true,
      message: `WACC is calculable (${(result.wacc.wacc.value * 100).toFixed(2)}%) from the currently provided inputs. This confirms the discount rate itself resolves — it is not an independent verification of every underlying assumption.`,
    });
  }

  return findings;
}

export function auditDcf(assumptions: DcfAssumptions, result: DcfResult, marketData: DcfMarketData): IntegrityFinding[] {
  const expectedEnterpriseValue = computeEnterpriseValue(result.pvOfForecastFcf, result.terminalValue.presentValue);
  const expectedEquityValue = computeEquityValue(result.enterpriseValue, marketData.cash, marketData.totalDebt);
  const expectedImpliedSharePrice = computeImpliedSharePrice(result.equityValue, marketData.dilutedSharesOutstanding);

  return [
    checkTerminalGrowthBelowWacc(assumptions, result),
    relationshipCheck('Enterprise value (PV of FCF + PV of Terminal Value)', result.enterpriseValue, expectedEnterpriseValue),
    relationshipCheck('Equity value (Enterprise Value + Cash - Debt)', result.equityValue, expectedEquityValue),
    relationshipCheck('Implied share price (Equity Value / Diluted Shares)', result.impliedSharePrice, expectedImpliedSharePrice),
    ...checkDcfOwnValidation(result),
  ];
}
