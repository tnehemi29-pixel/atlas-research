import type { PortfolioSummary as PortfolioSummaryData } from '@/lib/api/portfolio';
import { formatCompactCurrency, formatRatioAsPercent } from '@/lib/utils/format';

function Card({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'positive' | 'negative' | 'neutral' }) {
  const toneClass = tone === 'positive' ? 'text-emerald-700' : tone === 'negative' ? 'text-red-700' : 'text-ink';
  return (
    <div className="border-ink/10 bg-paper rounded-xl border p-4">
      <p className="text-ink/40 text-[10px] font-medium uppercase tracking-wide">{label}</p>
      <p className={`mt-1 text-xl font-medium ${toneClass}`}>{value}</p>
      {sub && <p className="text-ink/40 mt-0.5 text-xs">{sub}</p>}
    </div>
  );
}

export function PortfolioSummary({ summary }: { summary: PortfolioSummaryData }) {
  const gainLossTone = summary.totalUnrealizedGainLoss === null ? 'neutral' : summary.totalUnrealizedGainLoss >= 0 ? 'positive' : 'negative';

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card label="Total Portfolio Value" value={formatCompactCurrency(summary.totalMarketValue)} />
        <Card label="Total Cost Basis" value={formatCompactCurrency(summary.totalCostBasis)} />
        <Card label="Unrealized Gain/Loss" value={formatCompactCurrency(summary.totalUnrealizedGainLoss)} tone={gainLossTone} />
        <Card label="Portfolio Return" value={formatRatioAsPercent(summary.totalUnrealizedReturn)} tone={gainLossTone} />
      </div>
      {summary.hasMissingPrices && (
        <p className="text-ink/50 mt-2 text-xs">Some holdings are missing a current price — totals reflect only holdings with a known price.</p>
      )}
    </div>
  );
}
