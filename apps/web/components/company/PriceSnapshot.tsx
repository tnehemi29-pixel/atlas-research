import type { CompanyOverview } from '@erp/types';
import { formatMarketCap, formatPercent, formatPrice, formatUpdatedAt } from '@/lib/utils/format';

function rangePositionPercent(
  price: number | null,
  low: number | null,
  high: number | null,
): number | null {
  if (price === null || low === null || high === null || high <= low) return null;
  const clamped = Math.min(Math.max(price, low), high);
  return ((clamped - low) / (high - low)) * 100;
}

export function PriceSnapshot({ overview }: { overview: CompanyOverview }) {
  const hasChange = overview.changePercent !== null;
  const isUp = (overview.changePercent ?? 0) >= 0;
  const rangePosition = rangePositionPercent(overview.price, overview.yearLow, overview.yearHigh);

  return (
    <section className="border-ink/10 bg-paper mt-6 rounded-xl border p-6 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-ink font-mono text-4xl font-semibold tabular-nums">
            {formatPrice(overview.price)}
          </div>
          {hasChange && (
            <div
              className={`mt-1 flex items-center gap-1.5 text-sm font-medium ${
                isUp ? 'text-emerald-600' : 'text-red-600'
              }`}
            >
              <span aria-hidden>{isUp ? '▲' : '▼'}</span>
              <span className="tabular-nums">{formatPercent(overview.changePercent)}</span>
              <span className="text-ink/40 font-normal">today</span>
            </div>
          )}
        </div>
        <div className="text-ink/40 text-right text-xs uppercase tracking-wide">
          Market cap
          <div className="text-ink mt-0.5 font-mono text-base font-medium normal-case tracking-normal">
            {formatMarketCap(overview.marketCap)}
          </div>
        </div>
      </div>

      <div className="border-ink/10 mt-6 border-t pt-4">
        <div className="text-ink/40 flex items-center justify-between text-xs uppercase tracking-wide">
          <span>52-week low: {formatPrice(overview.yearLow)}</span>
          <span>52-week high: {formatPrice(overview.yearHigh)}</span>
        </div>
        <div className="bg-ink/10 relative mt-2 h-1.5 rounded-full">
          {rangePosition !== null && (
            <span
              aria-hidden
              className="border-paper bg-accent absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow"
              style={{ left: `${rangePosition}%` }}
            />
          )}
        </div>
      </div>

      <p className="text-ink/40 mt-4 text-xs">
        Updated {formatUpdatedAt(overview.quoteUpdatedAt)}
        {overview.stale && ' · live refresh failed, showing cached data'}
      </p>
    </section>
  );
}
