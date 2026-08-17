import { readField, type NormalizedPeriod, type ValidationIssue } from './types';

/**
 * Sanity checks over a normalized period. WARNING issues are logged but the
 * value is kept (a real business event can legitimately cause a large
 * swing — flagging it for a human is more honest than guessing it's wrong).
 * ERROR issues mean the specific field is implausible enough that keeping it
 * would be silently corrupting the data, so applyValidation() nulls that one
 * field out while leaving the rest of the period intact.
 *
 * Negative values are never treated as an error condition on their own —
 * negative net income, negative FCF, and negative working-capital changes
 * are all financially meaningful and are preserved throughout this pipeline.
 * Nothing here (or in normalize.ts) ever calls Math.abs() on a reported
 * value; only comparisons use absolute differences.
 */

const BALANCE_EQUATION_TOLERANCE = 0.01; // 1% of total assets
const MAGNITUDE_JUMP_FACTOR = 50; // flag if a same-type-period value changes by more than 50x
const MAX_PLAUSIBLE_EPS = 10_000; // guards against an EPS field accidentally holding a dollar-value tag
const MIN_PLAUSIBLE_SHARES = 1_000; // guards against a shares field accidentally holding a per-share value

export function validatePeriod(
  period: NormalizedPeriod,
  previousSameType?: NormalizedPeriod,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const at = (
    field: string | null,
    message: string,
    severity: ValidationIssue['severity'],
  ): ValidationIssue => ({
    severity,
    fiscalYear: period.fiscalYear,
    fiscalPeriod: period.fiscalPeriod,
    field,
    message,
  });

  // 1. Balance equation: Assets = Liabilities + Stockholders' Equity.
  const totalAssets = readField(period.balanceSheet, 'totalAssets');
  const totalLiabilities = readField(period.balanceSheet, 'totalLiabilities');
  const stockholdersEquity = readField(period.balanceSheet, 'stockholdersEquity');
  if (totalAssets && totalLiabilities !== null && stockholdersEquity !== null) {
    const diff = Math.abs(totalAssets - (totalLiabilities + stockholdersEquity));
    if (diff / totalAssets > BALANCE_EQUATION_TOLERANCE) {
      issues.push(
        at(
          'totalAssets',
          `Assets (${totalAssets}) do not approximately equal liabilities + equity (${
            totalLiabilities + stockholdersEquity
          }) — off by ${(diff / totalAssets).toPrecision(3)} of total assets.`,
          'WARNING',
        ),
      );
    }
  }

  // 2. EPS plausibility — catches a dollar-value tag accidentally mapped to EPS.
  for (const epsField of ['eps', 'dilutedEps'] as const) {
    const value = readField(period.incomeStatement, epsField);
    if (value !== null && Math.abs(value) > MAX_PLAUSIBLE_EPS) {
      issues.push(
        at(epsField, `${epsField} value ${value} is implausible for a per-share figure.`, 'ERROR'),
      );
    }
  }

  // 3. Shares plausibility — catches a per-share value accidentally mapped to a share count.
  for (const sharesField of ['basicSharesOutstanding', 'dilutedSharesOutstanding'] as const) {
    const shares = readField(period.incomeStatement, sharesField);
    if (shares !== null && shares !== 0 && Math.abs(shares) < MIN_PLAUSIBLE_SHARES) {
      issues.push(
        at(
          sharesField,
          `${sharesField} value ${shares} is implausible for a share count.`,
          'ERROR',
        ),
      );
    }
  }

  // 4. Period-type consistency — defensive re-check of what normalize.ts's
  // period calendar should already guarantee.
  if (period.periodStart) {
    const days = Math.round(
      (period.periodEnd.getTime() - period.periodStart.getTime()) / 86_400_000,
    );
    const [minDays, maxDays] = period.periodType === 'annual' ? [350, 380] : [80, 100];
    if (days < minDays || days > maxDays) {
      issues.push(
        at(
          null,
          `Period spans ${days} days but is labeled ${period.periodType} — possible quarterly/annual mixing.`,
          'ERROR',
        ),
      );
    }
  }

  // 5. Magnitude-jump check against the prior same-type period — a >50x
  // swing is far more likely to be a units mismatch than real growth.
  if (previousSameType) {
    for (const magField of ['revenue', 'netIncome'] as const) {
      const current = readField(period.incomeStatement, magField);
      const previous = readField(previousSameType.incomeStatement, magField);
      if (current && previous && previous !== 0) {
        const ratio = Math.abs(current / previous);
        if (ratio > MAGNITUDE_JUMP_FACTOR || ratio < 1 / MAGNITUDE_JUMP_FACTOR) {
          issues.push(
            at(
              magField,
              `${magField} changed ${ratio.toFixed(1)}x vs. the prior ${period.periodType} period (${previous} -> ${current}) — check for a unit mismatch.`,
              'WARNING',
            ),
          );
        }
      }
    }
  }

  return issues;
}

/** Applies ERROR-level issues by nulling just the offending field; WARNING issues are left as-is (logged, not corrected). */
export function applyValidation(
  period: NormalizedPeriod,
  issues: ValidationIssue[],
): NormalizedPeriod {
  const errors = issues.filter((issue) => issue.severity === 'ERROR' && issue.field);
  if (errors.length === 0) return period;

  const next: NormalizedPeriod = {
    ...period,
    incomeStatement: { ...period.incomeStatement },
    balanceSheet: { ...period.balanceSheet },
    cashFlow: { ...period.cashFlow },
  };

  for (const issue of errors) {
    if (!issue.field) continue;
    if (issue.field in next.incomeStatement) next.incomeStatement[issue.field] = null;
    else if (issue.field in next.balanceSheet) next.balanceSheet[issue.field] = null;
    else if (issue.field in next.cashFlow) next.cashFlow[issue.field] = null;
  }

  return next;
}
