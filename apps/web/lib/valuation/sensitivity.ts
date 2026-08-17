/**
 * Builds a 2D sensitivity grid by re-running the DCF at each combination of
 * two inputs. Deliberately takes a `recompute` callback rather than knowing
 * anything about historicals/forecasting/WACC itself — engine.ts supplies
 * that closure, so this module stays a pure grid-builder and is testable
 * with a trivial mock function.
 */

export interface SensitivityCell {
  rowValue: number;
  columnValue: number;
  impliedSharePrice: number | null;
  isBaseCase: boolean;
}

export interface SensitivityGrid {
  rowLabel: string;
  columnLabel: string;
  rowValues: number[];
  columnValues: number[];
  cells: SensitivityCell[][]; // cells[rowIndex][columnIndex]
}

function centeredRange(base: number, stepCount: number, step: number): number[] {
  return Array.from({ length: stepCount * 2 + 1 }, (_, i) => base + (i - stepCount) * step);
}

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-9;
}

/**
 * Builds an N x M grid, dynamically centered on the base row/column values
 * (never a hardcoded absolute range) — rowValues/columnValues are computed
 * from `baseRow`/`baseColumn` outward by `step` in each direction.
 */
export function buildSensitivityGrid(params: {
  rowLabel: string;
  columnLabel: string;
  baseRow: number;
  baseColumn: number;
  rowStepCount: number;
  rowStep: number;
  columnStepCount: number;
  columnStep: number;
  recompute: (rowValue: number, columnValue: number) => number | null;
}): SensitivityGrid {
  const {
    rowLabel,
    columnLabel,
    baseRow,
    baseColumn,
    rowStepCount,
    rowStep,
    columnStepCount,
    columnStep,
    recompute,
  } = params;

  const rowValues = centeredRange(baseRow, rowStepCount, rowStep);
  const columnValues = centeredRange(baseColumn, columnStepCount, columnStep);

  const cells = rowValues.map((rowValue) =>
    columnValues.map((columnValue) => ({
      rowValue,
      columnValue,
      impliedSharePrice: recompute(rowValue, columnValue),
      isBaseCase: nearlyEqual(rowValue, baseRow) && nearlyEqual(columnValue, baseColumn),
    })),
  );

  return { rowLabel, columnLabel, rowValues, columnValues, cells };
}
