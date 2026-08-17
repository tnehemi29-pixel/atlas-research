import type { ImpliedValuationRow } from '@/lib/comps/types';
import { formatPercent, formatPrice } from '@/lib/utils/format';

interface ValuationSummaryTableProps {
  impliedValuation: ImpliedValuationRow[];
  medianImpliedSharePrice: number | null;
  currentSharePrice: number | null;
}

export function ValuationSummaryTable({
  impliedValuation,
  medianImpliedSharePrice,
  currentSharePrice,
}: ValuationSummaryTableProps) {
  const medianUpside =
    medianImpliedSharePrice !== null && currentSharePrice !== null && currentSharePrice !== 0
      ? (medianImpliedSharePrice / currentSharePrice - 1) * 100
      : null;

  return (
    <section className="mt-8">
      <h2 className="text-ink font-serif text-lg font-semibold">Valuation Summary</h2>
      <p className="text-ink/50 mt-1 text-xs">
        Each methodology is independent — they are never blended or averaged into a single number
        beyond the plain median shown at the bottom. A methodology marked Not Meaningful (N/M) is
        excluded from that median, not silently treated as zero.
      </p>

      <div className="border-ink/10 mt-3 overflow-x-auto rounded-xl border">
        <table className="w-full min-w-max border-collapse text-sm">
          <thead>
            <tr className="border-ink/10 bg-paper border-b">
              <th className="text-ink/40 px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide">Methodology</th>
              <th className="text-ink/40 px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide">Peer Median Multiple</th>
              <th className="text-ink/40 px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide">Implied Share Price</th>
              <th className="text-ink/40 px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide">Upside / Downside</th>
            </tr>
          </thead>
          <tbody>
            {impliedValuation.map((row) => (
              <tr key={row.methodology} className="border-ink/5 border-b last:border-0">
                <td className="text-ink px-4 py-2.5 font-medium">{row.label}</td>
                <td className="text-ink px-4 py-2.5 text-right font-mono tabular-nums">
                  {row.medianMultiple !== null ? `${row.medianMultiple.toFixed(1)}x` : '—'}
                </td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                  {row.isMeaningful ? (
                    <span className="text-ink font-semibold">{formatPrice(row.impliedSharePrice)}</span>
                  ) : (
                    <span className="text-ink/40">N/M</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                  {row.isMeaningful && row.upsideDownside !== null
                    ? formatPercent(row.upsideDownside * 100)
                    : <span className="text-ink/40">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="border-ink/10 bg-paper rounded-xl border p-4">
          <div className="text-ink/40 text-xs uppercase tracking-wide">Current Share Price</div>
          <div className="text-ink mt-1 font-mono text-xl font-semibold tabular-nums">{formatPrice(currentSharePrice)}</div>
        </div>
        <div className="border-ink/10 bg-paper rounded-xl border p-4">
          <div className="text-ink/40 text-xs uppercase tracking-wide">Median Implied Price</div>
          <div className="text-ink mt-1 font-mono text-xl font-semibold tabular-nums">{formatPrice(medianImpliedSharePrice)}</div>
        </div>
        <div
          className={`rounded-xl border p-4 ${
            medianUpside === null ? 'border-ink/10 bg-paper' : medianUpside >= 0 ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'
          }`}
        >
          <div className="text-ink/40 text-xs uppercase tracking-wide">Upside / Downside</div>
          <div
            className={`mt-1 font-mono text-xl font-semibold tabular-nums ${
              medianUpside === null ? 'text-ink' : medianUpside >= 0 ? 'text-emerald-700' : 'text-red-700'
            }`}
          >
            {formatPercent(medianUpside)}
          </div>
        </div>
      </div>
      <p className="text-ink/40 mt-3 text-xs">
        A comps-implied price is a model output built from the current peer set&apos;s multiples —
        it is not a guaranteed return, a price target, or investment advice.
      </p>
    </section>
  );
}
