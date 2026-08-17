import type { EarningsFinancialResultsResponse } from '@/lib/api/earnings';
import { formatCompactCurrency, formatPercent } from '@/lib/utils/format';

/**
 * "Financial Results" — every figure here is ACTUAL, computed deterministically
 * from Atlas's own SEC-sourced financial statements (Milestones 3/4), never
 * from the transcript or an LLM. No GUIDANCE or ESTIMATE figures appear in
 * this table (guidance has its own panel; Atlas has no analyst-estimates
 * data source, so that comparison is simply omitted rather than fabricated).
 */
function formatChange(value: number | null, kind: 'growth' | 'points'): string {
  if (value === null) return '—';
  return kind === 'points' ? `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}pp` : formatPercent(value * 100);
}

interface FinancialResultsPanelProps {
  results: EarningsFinancialResultsResponse;
}

export function FinancialResultsPanel({ results }: FinancialResultsPanelProps) {
  if (!results.periodFound) {
    return (
      <p className="text-ink/50 text-sm">
        Financial statement data for this exact quarter hasn&apos;t been ingested from SEC filings yet — results
        will appear here automatically once the corresponding 10-Q/10-K has been processed.
      </p>
    );
  }

  return (
    <div className="border-ink/10 bg-paper overflow-x-auto rounded-xl border">
      <table className="w-full min-w-max border-collapse text-sm">
        <thead>
          <tr className="border-ink/10 border-b">
            <th className="text-ink/40 px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide">Metric</th>
            <th className="text-ink/40 px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide">Actual</th>
            <th className="text-ink/40 px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide">QoQ</th>
            <th className="text-ink/40 px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide">YoY</th>
          </tr>
        </thead>
        <tbody>
          {results.metrics.map((metric) => (
            <tr key={metric.label} className="border-ink/5 border-b last:border-0">
              <td className="text-ink px-4 py-2 font-medium">{metric.label}</td>
              <td className="text-ink px-4 py-2 text-right font-mono tabular-nums">
                {metric.changeKind === 'points' ? formatPercent((metric.actual ?? 0) * 100) : formatCompactCurrency(metric.actual)}
              </td>
              <td className="text-ink px-4 py-2 text-right font-mono tabular-nums">{formatChange(metric.qoqChange, metric.changeKind)}</td>
              <td className="text-ink px-4 py-2 text-right font-mono tabular-nums">{formatChange(metric.yoyChange, metric.changeKind)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-ink/40 border-ink/10 border-t px-4 py-2 text-xs">
        ACTUAL — computed directly from Atlas&apos;s stored SEC financial statements, never from the transcript or an
        LLM. Analyst-estimate comparisons are omitted (no reliable estimates data source is configured), never
        fabricated.
      </p>
    </div>
  );
}
