'use client';

import type { ResearchReportResponse } from '@/lib/api/reports';
import { formatCompactCurrency, formatPrice, formatUpdatedAt } from '@/lib/utils/format';

/** Data older than this is flagged as potentially stale in the freshness
 * banner — "Do not imply the report represents real-time information unless
 * it actually does." A generous window (financial statements/filings/calls
 * don't change hourly) that still catches a genuinely old snapshot. */
const FRESHNESS_WARNING_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

export function ReportHeader({ report }: { report: ResearchReportResponse }) {
  const overview = report.content.context.companyOverview;
  const snapshotAge = Date.now() - new Date(report.dataSnapshotAt).getTime();
  const isStale = snapshotAge > FRESHNESS_WARNING_MS;
  const hasDataWarnings = report.content.context.warnings.length > 0;

  return (
    <header className="border-ink/10 mb-6 border-b pb-5 print:border-black">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-ink font-serif text-3xl font-medium">
            {overview.name} <span className="text-ink/40 text-xl">({overview.ticker})</span>
          </h1>
          <p className="text-ink/50 mt-1 text-xs font-medium uppercase tracking-widest">
            Research Report · Version {report.version} · Generated {formatUpdatedAt(report.createdAt)}
          </p>
        </div>
        <dl className="flex gap-6 text-right">
          <div>
            <dt className="text-ink/40 text-[10px] font-medium uppercase tracking-wide">Price</dt>
            <dd className="text-ink text-lg font-medium">{formatPrice(overview.price)}</dd>
          </div>
          <div>
            <dt className="text-ink/40 text-[10px] font-medium uppercase tracking-wide">Market Cap</dt>
            <dd className="text-ink text-lg font-medium">{formatCompactCurrency(overview.marketCap)}</dd>
          </div>
        </dl>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-ink/50">Research data through: {formatUpdatedAt(report.dataSnapshotAt)}</span>
        {(isStale || hasDataWarnings) && (
          <span className="rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-700 print:bg-transparent">
            Some research inputs may be outdated — see Methodology.
          </span>
        )}
      </div>
    </header>
  );
}
