import type { FinancialPeriodData } from '@erp/types';
import type { StatementRow } from './types';

interface StatementTableProps {
  /** The columns to render — already sliced to the selected range. */
  periods: FinancialPeriodData[];
  /** The full, unsliced list — used by row.get() for lookups outside the visible range. */
  allPeriods: FinancialPeriodData[];
  rows: StatementRow[];
  labelHeader?: string;
}

function columnLabel(period: FinancialPeriodData): string {
  if (period.periodType === 'annual') return `FY${period.fiscalYear}`;
  return `${period.fiscalPeriod}'${String(period.fiscalYear).slice(-2)}`;
}

function columnTooltip(period: FinancialPeriodData): string {
  const periodLabel =
    period.periodType === 'annual'
      ? `Fiscal year ${period.fiscalYear}`
      : `${period.fiscalPeriod} fiscal ${period.fiscalYear}`;
  const range =
    period.periodStart && period.periodEnd
      ? ` (${period.periodStart.slice(0, 10)} to ${period.periodEnd.slice(0, 10)})`
      : '';
  const filing = period.filingType
    ? ` — ${period.filingType}${period.filingDate ? ` filed ${period.filingDate.slice(0, 10)}` : ''}`
    : '';
  return `${periodLabel}${range}${filing}`;
}

export function StatementTable({
  periods,
  allPeriods,
  rows,
  labelHeader = 'Line item',
}: StatementTableProps) {
  if (periods.length === 0) {
    return <p className="text-ink/50 px-1 py-6 text-sm">No data available for this view.</p>;
  }

  return (
    <div className="border-ink/10 overflow-x-auto rounded-xl border">
      <table className="w-full min-w-max border-collapse text-sm">
        <thead>
          <tr className="border-ink/10 bg-paper sticky top-0 z-20 border-b">
            <th className="bg-paper text-ink/40 sticky left-0 z-30 min-w-[200px] px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide">
              {labelHeader}
            </th>
            {periods.map((period) => (
              <th
                key={`${period.fiscalYear}-${period.fiscalPeriod}`}
                title={columnTooltip(period)}
                tabIndex={0}
                className="text-ink/60 min-w-[92px] cursor-help px-4 py-2.5 text-right font-mono text-xs font-medium"
              >
                {columnLabel(period)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-ink/5 border-b last:border-0">
              <td
                className={`bg-paper sticky left-0 z-10 px-4 py-2.5 ${row.indent ? 'text-ink/60 pl-8' : 'text-ink/80'} ${
                  row.emphasis ? 'text-ink font-semibold' : ''
                } ${row.isDerived ? 'text-ink/45 text-xs' : ''}`}
              >
                {row.label}
              </td>
              {periods.map((period) => {
                const value = row.get(period, allPeriods);
                const isNegative = value !== null && value < 0;
                return (
                  <td
                    key={`${period.fiscalYear}-${period.fiscalPeriod}`}
                    className={`px-4 py-2.5 text-right font-mono tabular-nums ${
                      row.emphasis ? 'text-ink font-semibold' : 'text-ink'
                    } ${row.isDerived ? 'text-xs' : ''} ${isNegative ? 'text-red-700' : ''}`}
                  >
                    {row.format(value)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
