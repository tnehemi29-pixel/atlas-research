import { describe, expect, it } from 'vitest';
import type { SensitivityGrid } from '@/lib/valuation/sensitivity';
import { auditDcfSensitivity, checkAxisMonotonicity } from './dcfSensitivityAudit';

/** A well-behaved grid: rows = WACC (7%, 8%, 9%), columns = terminal growth
 * (2%, 2.5%, 3%). Price should fall as WACC rises (down each column) and
 * rise as terminal growth rises (across each row). */
function makeWellBehavedGrid(): SensitivityGrid {
  const rowValues = [0.07, 0.08, 0.09];
  const columnValues = [0.02, 0.025, 0.03];
  // priceTable[rowIndex][colIndex]
  const priceTable = [
    [180, 190, 205],
    [160, 168, 178],
    [145, 150, 157],
  ];
  return {
    rowLabel: 'WACC',
    columnLabel: 'Terminal Growth',
    rowValues,
    columnValues,
    cells: rowValues.map((rowValue, r) => columnValues.map((columnValue, c) => ({ rowValue, columnValue, impliedSharePrice: priceTable[r]![c]!, isBaseCase: r === 1 && c === 1 }))),
  };
}

function makeBrokenGrid(): SensitivityGrid {
  const grid = makeWellBehavedGrid();
  // Corrupt one cell so price INCREASES as WACC rises in the first column.
  grid.cells[1]![0]!.impliedSharePrice = 500;
  return grid;
}

describe('checkAxisMonotonicity', () => {
  it('finds no violations walking rows (WACC) in the decreasing direction on a well-behaved grid', () => {
    const violations = checkAxisMonotonicity(makeWellBehavedGrid(), 'row', 'decreasing');
    expect(violations).toHaveLength(0);
  });

  it('finds no violations walking columns (growth) in the increasing direction on a well-behaved grid', () => {
    const violations = checkAxisMonotonicity(makeWellBehavedGrid(), 'column', 'increasing');
    expect(violations).toHaveLength(0);
  });

  it('detects a violation when a higher-WACC cell has a higher price than a lower-WACC cell', () => {
    const violations = checkAxisMonotonicity(makeBrokenGrid(), 'row', 'decreasing');
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]!.fromValue).toBe(0.07);
    expect(violations[0]!.toValue).toBe(0.08);
  });

  it('tolerates a tiny, effectively-flat difference without flagging it', () => {
    const grid = makeWellBehavedGrid();
    grid.cells[0]![0]!.impliedSharePrice = 180;
    grid.cells[1]![0]!.impliedSharePrice = 179.999; // essentially tied, well within tolerance
    const violations = checkAxisMonotonicity(grid, 'row', 'decreasing');
    expect(violations).toHaveLength(0);
  });

  it('skips cells with a null implied price rather than flagging them', () => {
    const grid = makeWellBehavedGrid();
    grid.cells[1]![0]!.impliedSharePrice = null;
    const violations = checkAxisMonotonicity(grid, 'row', 'decreasing');
    expect(violations).toHaveLength(0);
  });
});

describe('auditDcfSensitivity', () => {
  it('passes for a well-behaved grid with WACC on rows and growth on columns', () => {
    const result = auditDcfSensitivity(makeWellBehavedGrid(), { waccAxis: 'row', growthAxis: 'column' });
    expect(result.passed).toBe(true);
    expect(result.waccViolations).toHaveLength(0);
    expect(result.growthViolations).toHaveLength(0);
  });

  it('flags "Potential model calculation issue" for a broken grid', () => {
    const result = auditDcfSensitivity(makeBrokenGrid(), { waccAxis: 'row', growthAxis: 'column' });
    expect(result.passed).toBe(false);
    expect(result.waccViolations.length).toBeGreaterThan(0);
    expect(result.message).toMatch(/Potential model calculation issue/);
  });
});
