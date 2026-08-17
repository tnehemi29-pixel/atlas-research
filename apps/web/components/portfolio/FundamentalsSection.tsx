import type { WeightedFundamentalsResponse } from '@/lib/api/portfolio';
import { formatMultiple, formatRatioAsPercent } from '@/lib/utils/format';

const ROWS: Array<{ key: keyof WeightedFundamentalsResponse; label: string; format: (v: number) => string }> = [
  { key: 'revenueGrowth', label: 'Weighted Revenue Growth', format: formatRatioAsPercent },
  { key: 'operatingMargin', label: 'Weighted Operating Margin', format: formatRatioAsPercent },
  { key: 'fcfMargin', label: 'Weighted FCF Margin', format: formatRatioAsPercent },
  { key: 'evToEbitda', label: 'Weighted EV/EBITDA', format: formatMultiple },
  { key: 'peRatio', label: 'Weighted P/E', format: formatMultiple },
];

/** Every value is a market-value-weighted average — a holding missing the
 * underlying metric (or a not-meaningful multiple, e.g. negative earnings)
 * is excluded from that specific average rather than treated as zero, so a
 * single bad data point never silently distorts the portfolio-level figure. */
export function FundamentalsSection({ fundamentals }: { fundamentals: WeightedFundamentalsResponse }) {
  return (
    <section>
      <h2 className="text-ink font-serif text-lg font-medium">Portfolio Fundamentals</h2>
      <p className="text-ink/50 mt-1 max-w-2xl text-xs">
        Each metric is weighted by current market value across holdings. A holding missing the underlying figure (or
        with a not-meaningful multiple) is excluded from that average, not counted as zero.
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-5">
        {ROWS.map((row) => {
          const value = fundamentals[row.key];
          return (
            <div key={row.key}>
              <dt className="text-ink/40 text-[10px] font-medium uppercase tracking-wide">{row.label}</dt>
              <dd className="text-ink text-lg font-medium">{value !== null ? row.format(value) : '—'}</dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
