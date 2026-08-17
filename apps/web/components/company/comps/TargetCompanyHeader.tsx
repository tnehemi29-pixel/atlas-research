import type { CompanyMultiples, CompanyValuationMetrics } from '@/lib/comps/types';
import { formatCompactCurrency, formatPrice } from '@/lib/utils/format';

interface StatCardProps {
  label: string;
  value: string;
}

function StatCard({ label, value }: StatCardProps) {
  return (
    <div className="border-ink/10 bg-paper rounded-xl border p-4">
      <div className="text-ink/40 text-xs uppercase tracking-wide">{label}</div>
      <div className="text-ink mt-1 font-mono text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

interface TargetCompanyHeaderProps {
  target: CompanyValuationMetrics;
  targetMultiples: CompanyMultiples;
}

export function TargetCompanyHeader({ target, targetMultiples }: TargetCompanyHeaderProps) {
  return (
    <header className="border-ink/10 border-b pb-6">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-ink font-serif text-2xl font-semibold">{target.name} — Comparable Company Analysis</h1>
        <span className="text-ink/50 font-mono text-sm">{target.ticker}</span>
      </div>
      <div className="text-ink/50 mt-1 flex flex-wrap gap-2 text-xs">
        {target.sector && (
          <span className="border-ink/10 rounded border px-1.5 py-0.5 uppercase tracking-wide">{target.sector}</span>
        )}
        {target.industry && (
          <span className="border-ink/10 rounded border px-1.5 py-0.5 uppercase tracking-wide">{target.industry}</span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-4">
        <StatCard label="Market Capitalization" value={formatCompactCurrency(target.marketCap)} />
        <StatCard label="Enterprise Value" value={formatCompactCurrency(targetMultiples.enterpriseValue)} />
        <StatCard label="Revenue" value={formatCompactCurrency(target.revenue)} />
        <StatCard label="EBITDA" value={formatCompactCurrency(target.ebitda)} />
        <StatCard label="EBIT" value={formatCompactCurrency(target.ebit)} />
        <StatCard label="Net Income" value={formatCompactCurrency(target.netIncome)} />
        <StatCard label="Current Price" value={formatPrice(target.price)} />
        <StatCard label="Diluted Shares" value={target.dilutedSharesOutstanding !== null ? target.dilutedSharesOutstanding.toLocaleString() : '—'} />
      </div>
    </header>
  );
}
