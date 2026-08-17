import type { SensitivityGrid } from '@/lib/valuation/sensitivity';

/**
 * Milestone 14 spec section 10 — the DCF sensitivity audit. Verifies that a
 * sensitivity grid (Milestone 5's `buildSensitivityGrid`) behaves the way a
 * DCF is supposed to: value should move monotonically (allowing for flat/
 * tied regions) along each axis, in the expected direction. This module
 * never rebuilds or recomputes the grid — it only inspects one that was
 * already built from a real DCF run.
 */

export type MonotonicityDirection = 'increasing' | 'decreasing';

export interface MonotonicityViolation {
  /** Which axis was held fixed while walking the other one. */
  fixedAxis: 'row' | 'column';
  fixedValue: number;
  fromValue: number;
  toValue: number;
  fromPrice: number;
  toPrice: number;
}

// A small relative tolerance so two adjacent cells that are essentially tied
// (float noise, or a genuinely flat region of the model) never register as a
// "violation" — only a real, directionally-wrong move does.
const FLAT_TOLERANCE_PERCENT = 0.001;

function isViolation(direction: MonotonicityDirection, fromPrice: number, toPrice: number): boolean {
  const tolerance = Math.abs(fromPrice) * FLAT_TOLERANCE_PERCENT;
  if (direction === 'decreasing') return toPrice > fromPrice + tolerance;
  return toPrice < fromPrice - tolerance;
}

/** Walks one axis of the grid (holding the other fixed) and reports every
 * adjacent-cell step that moves the wrong direction. `axis: 'row'` walks
 * down increasing row values for each column; `axis: 'column'` walks across
 * increasing column values for each row. */
export function checkAxisMonotonicity(grid: SensitivityGrid, axis: 'row' | 'column', direction: MonotonicityDirection): MonotonicityViolation[] {
  const violations: MonotonicityViolation[] = [];

  if (axis === 'row') {
    for (let col = 0; col < grid.columnValues.length; col++) {
      for (let row = 0; row < grid.rowValues.length - 1; row++) {
        const a = grid.cells[row]?.[col];
        const b = grid.cells[row + 1]?.[col];
        if (!a || !b || a.impliedSharePrice === null || b.impliedSharePrice === null) continue;
        if (isViolation(direction, a.impliedSharePrice, b.impliedSharePrice)) {
          violations.push({ fixedAxis: 'column', fixedValue: grid.columnValues[col]!, fromValue: a.rowValue, toValue: b.rowValue, fromPrice: a.impliedSharePrice, toPrice: b.impliedSharePrice });
        }
      }
    }
  } else {
    for (let row = 0; row < grid.rowValues.length; row++) {
      for (let col = 0; col < grid.columnValues.length - 1; col++) {
        const a = grid.cells[row]?.[col];
        const b = grid.cells[row]?.[col + 1];
        if (!a || !b || a.impliedSharePrice === null || b.impliedSharePrice === null) continue;
        if (isViolation(direction, a.impliedSharePrice, b.impliedSharePrice)) {
          violations.push({ fixedAxis: 'row', fixedValue: grid.rowValues[row]!, fromValue: a.columnValue, toValue: b.columnValue, fromPrice: a.impliedSharePrice, toPrice: b.impliedSharePrice });
        }
      }
    }
  }

  return violations;
}

export interface DcfSensitivityAuditResult {
  passed: boolean;
  waccViolations: MonotonicityViolation[];
  growthViolations: MonotonicityViolation[];
  message: string;
}

/** `waccAxis`/`growthAxis` tell the audit which grid axis represents WACC
 * (expected to lower value as it rises) and which represents the growth-
 * shaped input under test — terminal growth, revenue growth, or margin
 * (expected to raise value as it rises) — since a caller may build the grid
 * with either axis on rows or columns. */
export function auditDcfSensitivity(grid: SensitivityGrid, config: { waccAxis: 'row' | 'column'; growthAxis: 'row' | 'column' }): DcfSensitivityAuditResult {
  const waccViolations = checkAxisMonotonicity(grid, config.waccAxis, 'decreasing');
  const growthViolations = checkAxisMonotonicity(grid, config.growthAxis, 'increasing');
  const passed = waccViolations.length === 0 && growthViolations.length === 0;

  return {
    passed,
    waccViolations,
    growthViolations,
    message: passed
      ? 'Sensitivity table behaves as expected: higher WACC lowers value, higher growth/margin raises it.'
      : 'Potential model calculation issue: the sensitivity table violates an expected directional relationship.',
  };
}
