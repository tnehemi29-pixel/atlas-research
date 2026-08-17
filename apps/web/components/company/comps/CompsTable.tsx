'use client';

import { safeDivide } from '@/lib/analytics/ratios';
import type { CompanyMultiples, CompanyValuationMetrics, MultipleKey, MultipleStatistics, SelectedPeer } from '@/lib/comps/types';
import { formatCompactCurrency, formatMultipleOrNM, formatRatioAsPercent } from '@/lib/utils/format';
import { ProvenanceBadge } from '@/components/company/valuation/ProvenanceBadge';

interface CompsTableProps {
  target: CompanyValuationMetrics;
  targetMultiples: CompanyMultiples;
  peers: SelectedPeer[];
  statistics: Record<MultipleKey, MultipleStatistics>;
  onToggleExclude: (ticker: string) => void;
  onRemove: (ticker: string) => void;
}

interface Row {
  metrics: CompanyValuationMetrics;
  multiples: CompanyMultiples;
}

function ebitdaMargin(metrics: CompanyValuationMetrics): number | null {
  return safeDivide(metrics.ebitda, metrics.revenue);
}

function DataCell({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <td className={`px-3 py-2.5 text-right font-mono text-sm tabular-nums ${muted ? 'text-ink/40' : 'text-ink'}`}>
      {children}
    </td>
  );
}

function CompanyRow({
  row,
  isTarget,
  source,
  excluded,
  onToggleExclude,
  onRemove,
}: {
  row: Row;
  isTarget: boolean;
  source?: 'calculated' | 'user' | 'actual' | 'estimate';
  excluded?: boolean;
  onToggleExclude?: () => void;
  onRemove?: () => void;
}) {
  const { metrics, multiples } = row;
  return (
    <tr
      className={`border-ink/5 border-b last:border-0 ${isTarget ? 'bg-accent-soft/40' : ''} ${excluded ? 'opacity-40' : ''}`}
    >
      <td className="sticky left-0 z-10 min-w-[180px] bg-inherit px-3 py-2.5">
        <div className={`${isTarget ? 'text-ink font-semibold' : 'text-ink font-medium'}`}>
          {metrics.name}
          {isTarget && <span className="text-accent ml-1.5 text-[10px] font-semibold uppercase tracking-wide">Target</span>}
          {excluded && <span className="text-ink/50 ml-1.5 text-[10px] font-semibold uppercase tracking-wide">Excluded</span>}
        </div>
        <div className="text-ink/40 flex items-center gap-1.5 font-mono text-xs">
          {metrics.ticker}
          {!isTarget && source && <ProvenanceBadge source={source} />}
        </div>
      </td>
      <DataCell>{formatCompactCurrency(metrics.marketCap)}</DataCell>
      <DataCell>{formatCompactCurrency(multiples.enterpriseValue)}</DataCell>
      <DataCell>{formatCompactCurrency(metrics.revenue)}</DataCell>
      <DataCell>{formatRatioAsPercent(metrics.revenueGrowth)}</DataCell>
      <DataCell>{formatCompactCurrency(metrics.ebitda)}</DataCell>
      <DataCell>{formatRatioAsPercent(ebitdaMargin(metrics))}</DataCell>
      <DataCell>{formatMultipleOrNM(multiples.evToRevenue)}</DataCell>
      <DataCell>{formatMultipleOrNM(multiples.evToEbitda)}</DataCell>
      <DataCell>{formatMultipleOrNM(multiples.evToEbit)}</DataCell>
      <DataCell>{formatMultipleOrNM(multiples.peRatio)}</DataCell>
      {!isTarget && (
        <td className="px-3 py-2.5 text-right">
          <div className="flex items-center justify-end gap-2">
            <label className="text-ink/50 flex items-center gap-1 text-xs">
              <input type="checkbox" checked={!excluded} onChange={onToggleExclude} />
              Include
            </label>
            <button type="button" onClick={onRemove} className="text-ink/40 hover:text-red-700 text-xs">
              Remove
            </button>
          </div>
        </td>
      )}
      {isTarget && <td />}
    </tr>
  );
}

const COLUMN_HEADERS = [
  'Company',
  'Market Cap',
  'Enterprise Value',
  'Revenue',
  'Rev. Growth',
  'EBITDA',
  'EBITDA Margin',
  'EV/Revenue',
  'EV/EBITDA',
  'EV/EBIT',
  'P/E',
  '',
];

export function CompsTable({ target, targetMultiples, peers, statistics, onToggleExclude, onRemove }: CompsTableProps) {
  const numberFormat = (accessor: (stat: MultipleStatistics) => number | null) => (key: MultipleKey) => {
    const value = accessor(statistics[key]);
    return value === null ? '—' : `${value.toFixed(1)}x`;
  };
  const minFmt = numberFormat((s) => s.adjusted.min);
  const maxFmt = numberFormat((s) => s.adjusted.max);
  const meanFmt = numberFormat((s) => s.adjusted.mean);
  const medianFmt = numberFormat((s) => s.adjusted.median);

  return (
    <section className="mt-8">
      <h2 className="text-ink font-serif text-lg font-semibold">Selected Comps</h2>
      <p className="text-ink/50 mt-1 text-xs">
        Min/Max/Mean/Median below reflect only the peers currently included (unchecked peers are
        counted as excluded, not deleted). The target company is shown separately and is never part
        of the peer statistics.
      </p>

      <div className="border-ink/10 mt-3 overflow-x-auto rounded-xl border">
        <table className="w-full min-w-max border-collapse text-sm">
          <thead>
            <tr className="border-ink/10 bg-paper border-b">
              {COLUMN_HEADERS.map((header, i) => (
                <th
                  key={i}
                  className={`text-ink/40 px-3 py-2.5 text-xs font-medium uppercase tracking-wide ${
                    i === 0 ? 'sticky left-0 z-20 min-w-[180px] bg-paper text-left' : i === COLUMN_HEADERS.length - 1 ? '' : 'text-right'
                  }`}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <CompanyRow row={{ metrics: target, multiples: targetMultiples }} isTarget />

            {peers.length === 0 && (
              <tr>
                <td colSpan={COLUMN_HEADERS.length} className="text-ink/50 px-3 py-6 text-center text-sm">
                  No comparable companies selected yet — accept a suggestion or search for one above.
                </td>
              </tr>
            )}

            {peers.map((peer) => (
              <CompanyRow
                key={peer.metrics.ticker}
                row={{ metrics: peer.metrics, multiples: peer.multiples }}
                isTarget={false}
                source={peer.source}
                excluded={peer.excluded}
                onToggleExclude={() => onToggleExclude(peer.metrics.ticker)}
                onRemove={() => onRemove(peer.metrics.ticker)}
              />
            ))}

            {peers.length > 0 && (
              <>
                <tr className="border-ink/10 border-t-2">
                  <td colSpan={7} className="text-ink/60 px-3 py-1.5 text-xs font-semibold">
                    Minimum
                  </td>
                  <DataCell muted>{minFmt('evToRevenue')}</DataCell>
                  <DataCell muted>{minFmt('evToEbitda')}</DataCell>
                  <DataCell muted>{minFmt('evToEbit')}</DataCell>
                  <DataCell muted>{minFmt('peRatio')}</DataCell>
                  <td />
                </tr>
                <tr>
                  <td colSpan={7} className="text-ink/60 px-3 py-1.5 text-xs font-semibold">
                    Maximum
                  </td>
                  <DataCell muted>{maxFmt('evToRevenue')}</DataCell>
                  <DataCell muted>{maxFmt('evToEbitda')}</DataCell>
                  <DataCell muted>{maxFmt('evToEbit')}</DataCell>
                  <DataCell muted>{maxFmt('peRatio')}</DataCell>
                  <td />
                </tr>
                <tr>
                  <td colSpan={7} className="text-ink/60 px-3 py-1.5 text-xs font-semibold">
                    Mean
                  </td>
                  <DataCell muted>{meanFmt('evToRevenue')}</DataCell>
                  <DataCell muted>{meanFmt('evToEbitda')}</DataCell>
                  <DataCell muted>{meanFmt('evToEbit')}</DataCell>
                  <DataCell muted>{meanFmt('peRatio')}</DataCell>
                  <td />
                </tr>
                <tr>
                  <td colSpan={7} className="text-ink px-3 py-1.5 text-xs font-semibold">
                    Median
                  </td>
                  <DataCell>{medianFmt('evToRevenue')}</DataCell>
                  <DataCell>{medianFmt('evToEbitda')}</DataCell>
                  <DataCell>{medianFmt('evToEbit')}</DataCell>
                  <DataCell>{medianFmt('peRatio')}</DataCell>
                  <td />
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
