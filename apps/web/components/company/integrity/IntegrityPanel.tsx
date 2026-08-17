'use client';

import { useEffect, useState } from 'react';
import { fetchCompanyIntegritySnapshot, type CompanyIntegritySnapshotResponse } from '@/lib/api/integrity';
import { ApiError } from '@/lib/api/companies';
import { DIMENSION_DATASET_TYPE, DIMENSION_LABELS, RESEARCH_INTEGRITY_STATUS_LABELS, RESEARCH_INTEGRITY_STATUS_STYLE } from '@/lib/utils/integrityDisplay';
import { formatUpdatedAt } from '@/lib/utils/format';
import { IntegrityDimensionCard } from './IntegrityDimensionCard';
import { IntegrityDetailPanels } from './IntegrityDetailPanels';

/**
 * Spec section 19 — the company integrity dashboard: Status + reasons +
 * per-dataset checkmarks/warnings, each expandable. Loads client-side
 * (rather than blocking the page's own SSR on a DCF+comps model audit run)
 * the same way ThesisMonitorPanel does — an independent, optional
 * cross-check layered on top of the page, not a gate on it. Computing a
 * fresh snapshot is expensive (it runs the real DCF and comps engines), so
 * this always reads the TTL-cached snapshot first; "Refresh" is the only
 * thing that forces a recompute.
 */
export function IntegrityPanel({ ticker }: { ticker: string }) {
  const [snapshot, setSnapshot] = useState<CompanyIntegritySnapshotResponse | null | undefined>(undefined);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(refresh: boolean) {
    if (refresh) setRefreshing(true);
    try {
      const result = await fetchCompanyIntegritySnapshot(ticker, { refresh });
      setSnapshot(result);
      setError(null);
    } catch (err) {
      if (refresh) setError(err instanceof ApiError ? err.message : 'Failed to refresh the integrity snapshot.');
      setSnapshot((prev) => prev ?? null);
    } finally {
      if (refresh) setRefreshing(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetchCompanyIntegritySnapshot(ticker)
      .then((result) => {
        if (!cancelled) setSnapshot(result);
      })
      .catch(() => {
        if (!cancelled) setSnapshot(null);
      });
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  if (snapshot === undefined) {
    return (
      <section className="border-ink/10 bg-paper mt-8 rounded-xl border p-4 print:hidden">
        <h2 className="text-ink font-serif text-lg font-medium">Research Integrity</h2>
        <p className="text-ink/40 mt-2 text-sm">Loading…</p>
      </section>
    );
  }

  if (!snapshot) return null;

  return (
    <section className="border-ink/10 bg-paper mt-8 rounded-xl border p-4 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-ink font-serif text-lg font-medium">Research Integrity</h2>
          <span className={`rounded border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${RESEARCH_INTEGRITY_STATUS_STYLE[snapshot.status]}`}>
            {RESEARCH_INTEGRITY_STATUS_LABELS[snapshot.status]}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-ink/30 text-xs">Checked {formatUpdatedAt(snapshot.computedAt)}</span>
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={refreshing}
            className="border-ink/15 rounded-lg border px-2.5 py-1 text-xs font-medium disabled:opacity-50"
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}

      <p className="text-ink/50 mt-2 text-sm">
        Atlas continuously checks whether the data, models, and research behind {ticker} are complete, internally consistent, current, and traceable. This never changes a model or a report on its
        own — it only flags what needs review.
      </p>

      {snapshot.reasons.length > 0 && (
        <ul className="mt-3 space-y-1">
          {snapshot.reasons.map((reason, i) => (
            <li key={i} className="text-ink/70 text-sm">
              · {reason}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {(Object.keys(DIMENSION_LABELS) as Array<keyof typeof DIMENSION_LABELS>).map((key) => (
          <IntegrityDimensionCard key={key} ticker={ticker} label={DIMENSION_LABELS[key]} datasetType={DIMENSION_DATASET_TYPE[key]} summary={snapshot.dimensions[key]} />
        ))}
      </div>

      {(snapshot.openIssueCount > 0 || snapshot.criticalIssueCount > 0) && (
        <p className="text-ink/40 mt-3 text-xs">
          {snapshot.openIssueCount} open issue{snapshot.openIssueCount === 1 ? '' : 's'}
          {snapshot.criticalIssueCount > 0 ? ` (${snapshot.criticalIssueCount} critical)` : ''} — expand a dimension above to review and act on them.
        </p>
      )}

      <IntegrityDetailPanels ticker={ticker} />
    </section>
  );
}
