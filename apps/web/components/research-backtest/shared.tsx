import type { DistributionStatsResponse } from '@/lib/api/backtest';
import { formatPercent } from '@/lib/utils/format';

/**
 * Primitives shared by every Milestone 12 backtest tab — one statistics
 * block, one card shell, one loading/error/empty triad — so "N observations,
 * insufficient-data messaging, methodology disclosure" always looks and
 * behaves identically regardless of which analysis produced it.
 */

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function yearsAgoIso(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

export function Card({ title, children, className = '' }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`border-ink/10 bg-paper rounded-xl border p-4 ${className}`}>
      {title && <h3 className="text-ink font-serif text-sm font-semibold">{title}</h3>}
      <div className={title ? 'mt-2' : ''}>{children}</div>
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
      {message}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <div className="border-ink/10 bg-paper text-ink/50 rounded-xl border p-6 text-center text-sm">{message}</div>;
}

export function LoadingState() {
  return <div className="border-ink/10 bg-paper text-ink/40 rounded-xl border p-6 text-center text-sm">Loading…</div>;
}

function pct(value: number | null): string {
  return formatPercent(value === null ? null : value * 100);
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-ink/50">{label}</dt>
      <dd className="text-ink font-medium tabular-nums">{value}</dd>
    </div>
  );
}

/** N, mean, median, stdDev, positive-outcome rate, 95% CI — always shown
 * together (spec section 15), and always withheld in favor of the
 * insufficient-data message below MIN_OBSERVATIONS_FOR_STATS (never a
 * number implying more confidence than the sample supports). */
export function StatBlock({ label, stats }: { label: string; stats: DistributionStatsResponse }) {
  return (
    <div className="border-ink/10 rounded-lg border p-3">
      <div className="text-ink/50 text-xs font-medium uppercase tracking-wide">{label}</div>
      {stats.insufficientData ? (
        <p className="text-ink/40 mt-2 text-xs leading-relaxed">Insufficient observations for meaningful statistical inference. (N={stats.count})</p>
      ) : (
        <dl className="mt-2 space-y-1 text-sm">
          <Row label="Observations" value={String(stats.count)} />
          <Row label="Average" value={pct(stats.mean)} />
          <Row label="Median" value={pct(stats.median)} />
          <Row label="Std Dev" value={pct(stats.stdDev)} />
          <Row label="Positive Rate" value={stats.positiveRate === null ? '—' : `${(stats.positiveRate * 100).toFixed(0)}%`} />
          <Row label="95% CI" value={stats.confidenceInterval95 ? `${pct(stats.confidenceInterval95[0])} to ${pct(stats.confidenceInterval95[1])}` : '—'} />
        </dl>
      )}
    </div>
  );
}

export function StatsGrid({ entries }: { entries: { label: string; stats: DistributionStatsResponse }[] }) {
  if (entries.length === 0) return <EmptyState message="No statistics available for this selection." />;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {entries.map((e) => (
        <StatBlock key={e.label} label={e.label} stats={e.stats} />
      ))}
    </div>
  );
}

export function MethodologyList({ items }: { items: string[] }) {
  return (
    <Card title="Methodology">
      <ul className="text-ink/60 list-inside list-disc space-y-1 text-xs leading-relaxed">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </Card>
  );
}

export function formatPct(value: number | null): string {
  return pct(value);
}

export const inputClass =
  'border-ink/15 bg-paper text-ink focus:border-accent focus:ring-accent/20 rounded-lg border px-2.5 py-1.5 text-sm outline-none focus:ring-2';
export const selectClass = inputClass;

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-ink/50 text-xs font-medium uppercase tracking-wide">{label}</span>
      {children}
    </label>
  );
}

/** Standard, capped-run disclosure — spec section 4's "capped, not silently
 * truncated" requirement. */
export function CappedNotice({ wasCapped, sampledDates }: { wasCapped: boolean; sampledDates: number }) {
  if (!wasCapped) return null;
  return (
    <p className="text-ink/50 text-xs">
      Showing the first {sampledDates} sampled dates in this range (capped) — narrow the date range to see later dates.
    </p>
  );
}
