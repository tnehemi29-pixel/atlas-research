'use client';

import { useState } from 'react';
import { fetchIntegrityIssues, type DimensionSummaryResponse, type IntegrityDatasetTypeValue, type IntegrityIssueResponse } from '@/lib/api/integrity';
import { DIMENSION_STATUS_ICON, DIMENSION_STATUS_STYLE } from '@/lib/utils/integrityDisplay';
import { IntegrityIssueRow } from './IntegrityIssueRow';

/** One dimension tile (spec section 19's worked example — Status + per-item
 * checkmark/warning, each expandable). Issues are fetched lazily on first
 * expand, scoped to this dimension's datasetType, rather than loading every
 * dimension's issues up front on every page view. */
export function IntegrityDimensionCard({
  ticker,
  label,
  datasetType,
  summary,
}: {
  ticker: string;
  label: string;
  datasetType: IntegrityDatasetTypeValue;
  summary: DimensionSummaryResponse;
}) {
  const [expanded, setExpanded] = useState(false);
  const [issues, setIssues] = useState<IntegrityIssueResponse[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadIssues() {
    setLoading(true);
    try {
      const result = await fetchIntegrityIssues(ticker, { datasetType, status: 'OPEN' });
      const acknowledged = await fetchIntegrityIssues(ticker, { datasetType, status: 'ACKNOWLEDGED' });
      setIssues([...result, ...acknowledged]);
    } catch {
      setIssues([]);
    } finally {
      setLoading(false);
    }
  }

  function handleToggle() {
    const next = !expanded;
    setExpanded(next);
    if (next && issues === null) void loadIssues();
  }

  async function handleIssueChanged() {
    await loadIssues();
  }

  return (
    <div className="border-ink/10 rounded-lg border">
      <button type="button" onClick={handleToggle} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left">
        <div className="flex items-center gap-2">
          <span className={`flex h-5 w-5 items-center justify-center rounded-full border text-xs font-bold ${DIMENSION_STATUS_STYLE[summary.status]}`}>{DIMENSION_STATUS_ICON[summary.status]}</span>
          <span className="text-ink text-sm font-medium">{label}</span>
        </div>
        <span className="text-ink/30 text-xs">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="border-ink/10 border-t px-3 py-2.5">
          <p className="text-ink/60 text-sm">{summary.detail}</p>

          {loading && <p className="text-ink/40 mt-2 text-xs">Loading issues…</p>}
          {!loading && issues && issues.length > 0 && (
            <ul className="mt-3 space-y-2">
              {issues.map((issue) => (
                <IntegrityIssueRow key={issue.id} issue={issue} onChanged={handleIssueChanged} />
              ))}
            </ul>
          )}
          {!loading && issues && issues.length === 0 && summary.status !== 'OK' && (
            <p className="text-ink/40 mt-2 text-xs">No open issues recorded for this dimension yet — the summary above reflects the most recent check.</p>
          )}
        </div>
      )}
    </div>
  );
}
