import { describe, expect, it } from 'vitest';
import { buildSensitivityGrid } from './sensitivity';

describe('buildSensitivityGrid', () => {
  const grid = buildSensitivityGrid({
    rowLabel: 'Terminal growth',
    columnLabel: 'WACC',
    baseRow: 0.03,
    baseColumn: 0.1,
    rowStepCount: 2,
    rowStep: 0.005,
    columnStepCount: 3,
    columnStep: 0.005,
    recompute: (row, column) => 100 + (row - 0.03) * 1000 - (column - 0.1) * 500,
  });

  it('centers the range on the base values rather than a hardcoded absolute range', () => {
    expect(grid.rowValues).toEqual([0.02, 0.025, 0.03, 0.035, 0.04].map((v) => expect.closeTo(v, 9)));
    expect(grid.columnValues).toEqual(
      [0.085, 0.09, 0.095, 0.1, 0.105, 0.11, 0.115].map((v) => expect.closeTo(v, 9)),
    );
  });

  it('produces a rowCount x columnCount grid', () => {
    expect(grid.cells).toHaveLength(5);
    expect(grid.cells[0]).toHaveLength(7);
  });

  it('flags exactly one cell as the base case, at the base row/column intersection', () => {
    const flagged = grid.cells.flat().filter((cell) => cell.isBaseCase);
    expect(flagged).toHaveLength(1);
    expect(flagged[0]?.rowValue).toBeCloseTo(0.03);
    expect(flagged[0]?.columnValue).toBeCloseTo(0.1);
    expect(flagged[0]?.impliedSharePrice).toBeCloseTo(100);
  });

  it('calls recompute for every cell with the exact row/column values', () => {
    const cell = grid.cells[0]![0]!; // row 0.02, column 0.085
    expect(cell.impliedSharePrice).toBeCloseTo(100 + (0.02 - 0.03) * 1000 - (0.085 - 0.1) * 500);
  });

  it('propagates a null recompute result (e.g. an invalid WACC/growth combination) without crashing', () => {
    const gridWithNulls = buildSensitivityGrid({
      rowLabel: 'g',
      columnLabel: 'WACC',
      baseRow: 0.1, // deliberately >= some WACC columns to trigger invalid combos
      baseColumn: 0.1,
      rowStepCount: 1,
      rowStep: 0.05,
      columnStepCount: 1,
      columnStep: 0.02,
      recompute: (row, column) => (column <= row ? null : 100),
    });
    const hasNull = gridWithNulls.cells.flat().some((cell) => cell.impliedSharePrice === null);
    expect(hasNull).toBe(true);
  });
});
