import type { SensitivityGrid } from '@/lib/valuation/sensitivity';
import { formatPrice } from '@/lib/utils/format';

interface SensitivityTableProps {
  grid: SensitivityGrid;
  currentPrice: number | null;
  formatRowValue: (value: number) => string;
  formatColumnValue: (value: number) => string;
}

/** Cell shading is relative to the current market price (green = implied
 * price above it, red = below), the same diverging red/green pair used for
 * sign-colored bars elsewhere in the app — not a new palette. Purely
 * decorative: the number itself is always printed, so the table reads fine
 * without color. */
function cellStyle(impliedPrice: number | null, currentPrice: number | null, isBaseCase: boolean): string {
  const ring = isBaseCase ? 'ring-2 ring-inset ring-accent' : '';
  if (impliedPrice === null || currentPrice === null || currentPrice === 0) return ring;
  const upside = impliedPrice / currentPrice - 1;
  if (upside > 0.02) return `bg-emerald-50 ${ring}`;
  if (upside < -0.02) return `bg-red-50 ${ring}`;
  return ring;
}

export function SensitivityTable({ grid, currentPrice, formatRowValue, formatColumnValue }: SensitivityTableProps) {
  return (
    <div className="border-ink/10 overflow-x-auto rounded-xl border">
      <table className="w-full min-w-max border-collapse text-sm">
        <thead>
          <tr className="border-ink/10 bg-paper border-b">
            <th className="bg-paper text-ink/40 sticky left-0 px-3 py-2 text-left text-xs font-medium uppercase tracking-wide">
              {grid.rowLabel} \ {grid.columnLabel}
            </th>
            {grid.columnValues.map((columnValue) => (
              <th key={columnValue} className="text-ink/60 px-3 py-2 text-right font-mono text-xs font-medium">
                {formatColumnValue(columnValue)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.cells.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-ink/5 border-b last:border-0">
              <td className="bg-paper text-ink/70 sticky left-0 px-3 py-2 font-mono text-xs font-medium">
                {formatRowValue(grid.rowValues[rowIndex] as number)}
              </td>
              {row.map((cell, columnIndex) => (
                <td
                  key={columnIndex}
                  className={`text-ink px-3 py-2 text-right font-mono text-xs tabular-nums ${cellStyle(cell.impliedSharePrice, currentPrice, cell.isBaseCase)}`}
                >
                  {formatPrice(cell.impliedSharePrice)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
