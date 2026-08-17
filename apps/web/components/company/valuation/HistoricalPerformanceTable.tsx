import type { HistoricalYear } from '@/lib/valuation/types';
import { formatCompactCurrency, formatRatioAsPercent } from '@/lib/utils/format';

interface HistoricalRow {
  key: string;
  label: string;
  get: (year: HistoricalYear) => number | null;
  format: (value: number | null) => string;
  emphasis?: boolean;
}

const ROWS: HistoricalRow[] = [
  { key: 'revenue', label: 'Revenue', get: (y) => y.revenue, format: formatCompactCurrency, emphasis: true },
  { key: 'revenueGrowth', label: 'Revenue growth', get: (y) => y.revenueGrowth, format: formatRatioAsPercent },
  { key: 'ebit', label: 'EBIT (Operating Income)', get: (y) => y.ebit, format: formatCompactCurrency },
  { key: 'ebitMargin', label: 'EBIT margin', get: (y) => y.ebitMargin, format: formatRatioAsPercent },
  { key: 'taxRate', label: 'Effective tax rate', get: (y) => y.taxRate, format: formatRatioAsPercent },
  {
    key: 'taxes',
    label: 'Taxes on EBIT (NOPAT basis)',
    get: (y) => (y.ebit !== null && y.taxRate !== null ? y.ebit * y.taxRate : null),
    format: formatCompactCurrency,
  },
  { key: 'da', label: 'D&A', get: (y) => y.da, format: formatCompactCurrency },
  { key: 'capex', label: 'CapEx', get: (y) => y.capex, format: formatCompactCurrency },
  { key: 'changeInNwc', label: 'Change in NWC', get: (y) => y.changeInNwc, format: formatCompactCurrency },
  {
    key: 'fcf',
    label: 'Unlevered FCF',
    get: (y) => y.unleveredFcf,
    format: formatCompactCurrency,
    emphasis: true,
  },
];

export function HistoricalPerformanceTable({ historicals }: { historicals: HistoricalYear[] }) {
  if (historicals.length === 0) {
    return (
      <div className="border-ink/10 bg-paper text-ink/50 rounded-xl border p-6 text-center text-sm">
        No historical annual financial data is available — the DCF baseline can&apos;t be built until
        financials are synced for this company.
      </div>
    );
  }

  return (
    <section className="mt-8">
      <h2 className="text-ink font-serif text-lg font-semibold">Historical Performance</h2>
      <p className="text-ink/50 mt-1 text-xs">
        Pulled directly from this company&apos;s normalized SEC filings — nothing here is entered by
        hand. This is the baseline every forecast assumption below is built from.
      </p>
      <div className="border-ink/10 mt-3 overflow-x-auto rounded-xl border">
        <table className="w-full min-w-max border-collapse text-sm">
          <thead>
            <tr className="border-ink/10 bg-paper border-b">
              <th className="bg-paper text-ink/40 sticky left-0 min-w-[200px] px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide">
                Line item
              </th>
              {historicals.map((year) => (
                <th
                  key={year.fiscalYear}
                  className="text-ink/60 min-w-[92px] px-4 py-2.5 text-right font-mono text-xs font-medium"
                >
                  FY{year.fiscalYear}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.key} className="border-ink/5 border-b last:border-0">
                <td
                  className={`bg-paper sticky left-0 px-4 py-2.5 ${row.emphasis ? 'text-ink font-semibold' : 'text-ink/80'}`}
                >
                  {row.label}
                </td>
                {historicals.map((year) => {
                  const value = row.get(year);
                  const isNegative = value !== null && value < 0;
                  return (
                    <td
                      key={year.fiscalYear}
                      className={`px-4 py-2.5 text-right font-mono tabular-nums ${
                        row.emphasis ? 'text-ink font-semibold' : 'text-ink'
                      } ${isNegative ? 'text-red-700' : ''}`}
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
    </section>
  );
}
