'use client';

import type { MultipleKey, MultipleStatistics, SelectedPeer } from '@/lib/comps/types';
import { formatMultiple } from '@/lib/utils/format';

const LABELS: Record<MultipleKey, string> = {
  evToRevenue: 'EV / Revenue',
  evToEbitda: 'EV / EBITDA',
  evToEbit: 'EV / EBIT',
  peRatio: 'P / E',
};

const MULTIPLE_KEYS: MultipleKey[] = ['evToRevenue', 'evToEbitda', 'evToEbit', 'peRatio'];

interface OutlierPanelProps {
  statistics: Record<MultipleKey, MultipleStatistics>;
  peers: SelectedPeer[];
  onToggleExclude: (ticker: string) => void;
}

export function OutlierPanel({ statistics, peers, onToggleExclude }: OutlierPanelProps) {
  const excludedTickers = new Set(peers.filter((p) => p.excluded).map((p) => p.metrics.ticker));

  return (
    <section className="mt-8">
      <h2 className="text-ink font-serif text-lg font-semibold">Outlier Handling</h2>
      <p className="text-ink/50 mt-1 text-xs">
        Potential outliers are identified using Tukey&apos;s IQR method (values more than 1.5x the
        interquartile range beyond Q1/Q3) — a standard statistical convention, computed per
        multiple. Nothing is excluded automatically; flagged companies stay in the comp set and the
        raw statistics until you choose to exclude them below.
      </p>

      <div className="border-ink/10 mt-3 overflow-x-auto rounded-xl border">
        <table className="w-full min-w-max border-collapse text-sm">
          <thead>
            <tr className="border-ink/10 bg-paper border-b">
              <th className="text-ink/40 px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide">Multiple</th>
              <th className="text-ink/40 px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wide">Raw Median</th>
              <th className="text-ink/40 px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wide">Adjusted Median</th>
              <th className="text-ink/40 px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide">Flagged Potential Outliers</th>
            </tr>
          </thead>
          <tbody>
            {MULTIPLE_KEYS.map((key) => {
              const stat = statistics[key];
              return (
                <tr key={key} className="border-ink/5 border-b last:border-0">
                  <td className="text-ink px-3 py-2.5 font-medium">{LABELS[key]}</td>
                  <td className="text-ink px-3 py-2.5 text-right font-mono tabular-nums">
                    {formatMultiple(stat.raw.median)}
                  </td>
                  <td className="text-ink px-3 py-2.5 text-right font-mono tabular-nums">
                    {formatMultiple(stat.adjusted.median)}
                  </td>
                  <td className="px-3 py-2.5">
                    {stat.outliers.outlierTickers.length === 0 ? (
                      <span className="text-ink/40 text-xs">None flagged</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {stat.outliers.outlierTickers.map((ticker) => {
                          const isExcluded = excludedTickers.has(ticker);
                          return (
                            <button
                              key={ticker}
                              type="button"
                              onClick={() => onToggleExclude(ticker)}
                              className={`rounded border px-1.5 py-0.5 text-xs font-medium ${
                                isExcluded
                                  ? 'border-ink/15 bg-ink/5 text-ink/50'
                                  : 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
                              }`}
                            >
                              {ticker} {isExcluded ? '(excluded)' : '— exclude?'}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
