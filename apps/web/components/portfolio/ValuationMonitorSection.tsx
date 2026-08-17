import Link from 'next/link';
import type { ValuationMonitorRowResponse } from '@/lib/api/portfolio';
import { formatMultiple, formatPrice, formatRatioAsPercent } from '@/lib/utils/format';

/** Neutral research indicators only — never a buy/sell recommendation.
 * DCF and comps are re-run live via the same engines the Valuation/Comps
 * pages use (lib/valuation/quickValuation.ts); "Historical Multiple" is
 * always "Not available" in this milestone since Atlas has no stored
 * multiple time series to compare against (see README Known Limitations),
 * shown explicitly rather than the column simply being missing. */
export function ValuationMonitorSection({ rows }: { rows: ValuationMonitorRowResponse[] }) {
  return (
    <section>
      <h2 className="text-ink font-serif text-lg font-medium">Valuation Monitor</h2>
      <p className="text-ink/50 mt-1 max-w-2xl text-xs">
        Neutral research indicators, not investment recommendations — reuses the same DCF and comparable-company
        engines as the Valuation and Comparable Companies pages.
      </p>
      {rows.length === 0 ? (
        <p className="text-ink/50 mt-3 text-sm">No holdings to monitor yet.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-ink/10 border-b text-left">
                <th className="text-ink/40 py-2 pr-3 text-[10px] font-medium uppercase tracking-wide">Ticker</th>
                <th className="text-ink/40 px-2 py-2 text-right text-[10px] font-medium uppercase tracking-wide">Current Price</th>
                <th className="text-ink/40 px-2 py-2 text-right text-[10px] font-medium uppercase tracking-wide">DCF Value</th>
                <th className="text-ink/40 px-2 py-2 text-right text-[10px] font-medium uppercase tracking-wide">DCF Up/Down</th>
                <th className="text-ink/40 px-2 py-2 text-right text-[10px] font-medium uppercase tracking-wide">Comps Value</th>
                <th className="text-ink/40 px-2 py-2 text-right text-[10px] font-medium uppercase tracking-wide">Comps Up/Down</th>
                <th className="text-ink/40 px-2 py-2 text-right text-[10px] font-medium uppercase tracking-wide">EV/EBITDA</th>
                <th className="text-ink/40 py-2 pl-2 text-right text-[10px] font-medium uppercase tracking-wide">Hist. Multiple</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.ticker} className="border-ink/5 border-b last:border-0">
                  <td className="py-2 pr-3 font-medium">
                    <Link href={`/company/${row.ticker}/valuation`} className="text-accent hover:underline">
                      {row.ticker}
                    </Link>
                  </td>
                  <td className="text-ink py-2 px-2 text-right">{formatPrice(row.currentPrice)}</td>
                  <td className="text-ink py-2 px-2 text-right font-medium">{formatPrice(row.dcfImpliedPrice)}</td>
                  <td className="text-ink/80 py-2 px-2 text-right">{formatRatioAsPercent(row.dcfUpsideDownside)}</td>
                  <td className="text-ink py-2 px-2 text-right font-medium">{formatPrice(row.compsImpliedPrice)}</td>
                  <td className="text-ink/80 py-2 px-2 text-right">{formatRatioAsPercent(row.compsUpsideDownside)}</td>
                  <td className="text-ink/80 py-2 px-2 text-right">{formatMultiple(row.evToEbitda)}</td>
                  <td className="text-ink/40 py-2 pl-2 text-right text-xs">Not available</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
