'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { GlobalIntegrityDashboardRowResponse, ResearchIntegrityStatusValue } from '@/lib/api/integrity';
import { DIMENSION_LABELS, RESEARCH_INTEGRITY_STATUS_LABELS, RESEARCH_INTEGRITY_STATUS_STYLE } from '@/lib/utils/integrityDisplay';
import { formatUpdatedAt } from '@/lib/utils/format';

const STATUS_GROUP_ORDER: ResearchIntegrityStatusValue[] = ['CRITICAL', 'SIGNIFICANT_ISSUES', 'REVIEW_REQUIRED', 'MINOR_ISSUES', 'VERIFIED'];

type DimensionKey = keyof typeof DIMENSION_LABELS;

/**
 * Spec section 20 — the global integrity dashboard: companies grouped by
 * status, filterable by category. Reads only already-computed snapshots
 * (see getGlobalIntegrityDashboard's own doc comment) — a company appears
 * here once its own page has computed a snapshot at least once, so an empty
 * dashboard on a fresh install is expected, not a bug.
 */
export function IntegrityDashboardWorkspace({ initialRows }: { initialRows: GlobalIntegrityDashboardRowResponse[] }) {
  const [dimensionFilter, setDimensionFilter] = useState<DimensionKey | 'all'>('all');

  const filtered = useMemo(() => {
    if (dimensionFilter === 'all') return initialRows;
    return initialRows.filter((row) => row.dimensions[dimensionFilter].status !== 'OK');
  }, [initialRows, dimensionFilter]);

  const grouped = useMemo(() => {
    const map = new Map<ResearchIntegrityStatusValue, GlobalIntegrityDashboardRowResponse[]>();
    for (const status of STATUS_GROUP_ORDER) map.set(status, []);
    for (const row of filtered) {
      const bucket = map.get(row.status);
      if (bucket) bucket.push(row);
      else map.set(row.status, [row]);
    }
    return map;
  }, [filtered]);

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="border-ink/10 border-b pb-6">
        <h1 className="text-ink font-serif text-2xl font-semibold">Research Integrity</h1>
        <p className="text-ink/50 mt-2 max-w-2xl text-sm">
          Every company Atlas has checked for data completeness, internal consistency, currency, and traceability — grouped by how much attention each one needs. A company only appears here after
          its own page has computed an integrity snapshot at least once.
        </p>
      </header>

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setDimensionFilter('all')}
          className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${dimensionFilter === 'all' ? 'border-accent bg-accent-soft text-accent' : 'border-ink/15 text-ink/60'}`}
        >
          All
        </button>
        {(Object.keys(DIMENSION_LABELS) as DimensionKey[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setDimensionFilter(key)}
            className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${dimensionFilter === key ? 'border-accent bg-accent-soft text-accent' : 'border-ink/15 text-ink/60'}`}
          >
            {DIMENSION_LABELS[key]}
          </button>
        ))}
      </div>

      {initialRows.length === 0 ? (
        <div className="border-ink/10 bg-paper text-ink/50 mt-6 rounded-xl border p-6 text-center text-sm">
          No companies have a computed integrity snapshot yet. Visit a company&apos;s page to compute one.
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {STATUS_GROUP_ORDER.map((status) => {
            const rows = grouped.get(status) ?? [];
            if (rows.length === 0) return null;
            return (
              <section key={status}>
                <div className="flex items-center gap-2">
                  <span className={`rounded border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${RESEARCH_INTEGRITY_STATUS_STYLE[status]}`}>
                    {RESEARCH_INTEGRITY_STATUS_LABELS[status]}
                  </span>
                  <span className="text-ink/40 text-xs">
                    {rows.length} compan{rows.length === 1 ? 'y' : 'ies'}
                  </span>
                </div>
                <ul className="border-ink/10 mt-2 divide-y divide-black/5 rounded-xl border">
                  {rows.map((row) => (
                    <li key={row.companyId}>
                      <Link href={`/company/${row.ticker}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-black/[0.02]">
                        <div>
                          <span className="text-ink text-sm font-medium">{row.name}</span>
                          <span className="text-ink/40 ml-2 text-xs">{row.ticker}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          {row.openIssueCount > 0 && (
                            <span className="text-ink/50">
                              {row.openIssueCount} open{row.criticalIssueCount > 0 ? ` (${row.criticalIssueCount} critical)` : ''}
                            </span>
                          )}
                          <span className="text-ink/30">{formatUpdatedAt(row.computedAt)}</span>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
          {filtered.length === 0 && (
            <div className="border-ink/10 bg-paper text-ink/50 rounded-xl border p-6 text-center text-sm">No companies have an open issue in this category.</div>
          )}
        </div>
      )}
    </main>
  );
}
