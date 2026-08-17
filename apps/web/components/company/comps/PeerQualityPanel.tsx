import { safeDivide } from '@/lib/analytics/ratios';
import type { CompanyValuationMetrics, PeerQualitySummary } from '@/lib/comps/types';
import { formatCompactCurrency, formatRatioAsPercent } from '@/lib/utils/format';

interface PeerQualityPanelProps {
  peerQuality: PeerQualitySummary;
  target: CompanyValuationMetrics;
}

interface ComparisonRowProps {
  label: string;
  targetValue: string;
  peerValue: string;
}

function ComparisonRow({ label, targetValue, peerValue }: ComparisonRowProps) {
  return (
    <tr className="border-ink/5 border-b last:border-0">
      <td className="text-ink/70 px-4 py-2.5 text-xs">{label}</td>
      <td className="text-ink px-4 py-2.5 text-right font-mono text-sm tabular-nums">{targetValue}</td>
      <td className="text-ink px-4 py-2.5 text-right font-mono text-sm tabular-nums">{peerValue}</td>
    </tr>
  );
}

export function PeerQualityPanel({ peerQuality, target }: PeerQualityPanelProps) {
  const targetEbitdaMargin = safeDivide(target.ebitda, target.revenue);

  return (
    <section className="mt-8">
      <h2 className="text-ink font-serif text-lg font-semibold">Peer Quality</h2>
      <p className="text-ink/50 mt-1 text-xs">
        How well the current peer set actually matches the target — use this to judge whether the
        comp set is appropriate, not just how many companies are in it.
      </p>

      <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="border-ink/10 bg-paper rounded-xl border p-4">
          <div className="text-ink/40 text-xs uppercase tracking-wide">Peers Included</div>
          <div className="text-ink mt-1 font-mono text-2xl font-semibold tabular-nums">{peerQuality.peerCount}</div>
        </div>

        <div className="border-ink/10 bg-paper overflow-hidden rounded-xl border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-ink/10 border-b">
                <th className="text-ink/40 px-4 py-2 text-left text-xs font-medium uppercase tracking-wide">Metric</th>
                <th className="text-ink/40 px-4 py-2 text-right text-xs font-medium uppercase tracking-wide">Target</th>
                <th className="text-ink/40 px-4 py-2 text-right text-xs font-medium uppercase tracking-wide">Peer Median</th>
              </tr>
            </thead>
            <tbody>
              <ComparisonRow
                label="Revenue"
                targetValue={formatCompactCurrency(target.revenue)}
                peerValue={formatCompactCurrency(peerQuality.medianRevenue)}
              />
              <ComparisonRow
                label="Market Cap"
                targetValue={formatCompactCurrency(target.marketCap)}
                peerValue={formatCompactCurrency(peerQuality.medianMarketCap)}
              />
              <ComparisonRow
                label="Revenue Growth"
                targetValue={formatRatioAsPercent(target.revenueGrowth)}
                peerValue={formatRatioAsPercent(peerQuality.medianGrowth)}
              />
              <ComparisonRow
                label="EBITDA Margin"
                targetValue={formatRatioAsPercent(targetEbitdaMargin)}
                peerValue={formatRatioAsPercent(peerQuality.medianEbitdaMargin)}
              />
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
