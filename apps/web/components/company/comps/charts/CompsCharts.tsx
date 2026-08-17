'use client';

import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { CompanyMultiples, ImpliedValuationRow, MultipleKey, MultipleStatistics } from '@/lib/comps/types';
import { formatMultiple, formatPrice } from '@/lib/utils/format';
import { ChartCard, ChartTooltip } from '@/components/company/financials/charts/ChartCard';

/** Two charts, matching the milestone's minimum requirement: target-vs-peer
 * multiple comparison, and implied share price across methodologies vs. the
 * current price. Colors reuse the app's established teal/orange pair rather
 * than inventing a new one — see M4/M5's FinancialCharts/ValuationCharts. */

const COLOR_TARGET = '#0d8a63';
const COLOR_PEER_MEDIAN = '#c2660c';
const COLOR_CURRENT = '#7c848c';
const COLOR_IMPLIED = '#1f6f5c';
const GRID_COLOR = '#e5e3dc';
const AXIS_TICK = { fontSize: 11, fill: '#7c848c' };

interface MultipleComparisonDatum {
  label: string;
  target: number | null;
  peerMedian: number | null;
}

function buildMultipleComparisonData(
  targetMultiples: CompanyMultiples,
  statistics: Record<MultipleKey, MultipleStatistics>,
): MultipleComparisonDatum[] {
  const rows: Array<{ label: string; key: MultipleKey }> = [
    { label: 'EV/Revenue', key: 'evToRevenue' },
    { label: 'EV/EBITDA', key: 'evToEbitda' },
    { label: 'P/E', key: 'peRatio' },
  ];

  return rows.map(({ label, key }) => ({
    label,
    target: targetMultiples[key].status === 'ok' ? targetMultiples[key].value : null,
    peerMedian: statistics[key].adjusted.median,
  }));
}

interface CompsChartsProps {
  targetMultiples: CompanyMultiples;
  statistics: Record<MultipleKey, MultipleStatistics>;
  impliedValuation: ImpliedValuationRow[];
  currentSharePrice: number | null;
}

export function CompsCharts({ targetMultiples, statistics, impliedValuation, currentSharePrice }: CompsChartsProps) {
  const multipleData = buildMultipleComparisonData(targetMultiples, statistics);
  const impliedPriceData = [
    { label: 'Current', price: currentSharePrice, isCurrent: true },
    ...impliedValuation.map((row) => ({
      label: row.label,
      price: row.isMeaningful ? row.impliedSharePrice : null,
      isCurrent: false,
    })),
  ];

  return (
    <section className="mt-8">
      <h2 className="text-ink font-serif text-lg font-semibold">Charts</h2>
      <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
        <ChartCard title="Target vs. Peer Median Multiples">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={multipleData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <CartesianGrid stroke={GRID_COLOR} vertical={false} />
              <XAxis dataKey="label" tick={AXIS_TICK} axisLine={{ stroke: GRID_COLOR }} tickLine={false} />
              <YAxis tickFormatter={(v: number) => formatMultiple(v)} tick={AXIS_TICK} axisLine={false} tickLine={false} width={48} />
              <Tooltip
                content={
                  <ChartTooltip
                    formatters={{ target: formatMultiple, peerMedian: formatMultiple }}
                    labels={{ target: 'Target', peerMedian: 'Peer Median' }}
                  />
                }
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="target" name="Target" fill={COLOR_TARGET} radius={[2, 2, 0, 0]} maxBarSize={32} />
              <Bar dataKey="peerMedian" name="Peer Median" fill={COLOR_PEER_MEDIAN} radius={[2, 2, 0, 0]} maxBarSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Implied Share Price by Methodology">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={impliedPriceData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <CartesianGrid stroke={GRID_COLOR} vertical={false} />
              <XAxis dataKey="label" tick={AXIS_TICK} axisLine={{ stroke: GRID_COLOR }} tickLine={false} />
              <YAxis tickFormatter={(v: number) => formatPrice(v)} tick={AXIS_TICK} axisLine={false} tickLine={false} width={56} />
              <Tooltip content={<ChartTooltip formatters={{ price: formatPrice }} labels={{ price: 'Implied share price' }} />} />
              <Bar dataKey="price" name="Price" radius={[2, 2, 0, 0]} maxBarSize={40}>
                {impliedPriceData.map((entry) => (
                  <Cell key={entry.label} fill={entry.isCurrent ? COLOR_CURRENT : COLOR_IMPLIED} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </section>
  );
}
