'use client';

import { useState } from 'react';
import Link from 'next/link';
import { unsaveReport, type SavedReportResponse } from '@/lib/api/savedReports';
import { formatUpdatedAt } from '@/lib/utils/format';

export function SavedReportsWorkspace({ initial }: { initial: SavedReportResponse[] }) {
  const [saved, setSaved] = useState(initial);

  async function handleUnsave(reportId: string) {
    setSaved((prev) => prev.filter((s) => s.researchReport.id !== reportId));
    await unsaveReport(reportId).catch(() => {});
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-ink font-serif text-2xl">Saved Research Reports</h1>
      <p className="text-ink/50 mt-1 text-sm">
        Bookmarks onto Atlas&apos;s shared research reports (Milestone 9) — the report itself stays the same for
        every user; only your bookmark is private.
      </p>

      {saved.length === 0 ? (
        <p className="text-ink/50 mt-8 text-sm">
          No saved reports yet. Open a company&apos;s Research Report tab and save a version to see it here.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-black/5">
          {saved.map((item) => (
            <li key={item.id} className="flex items-center justify-between py-3">
              <div>
                <Link href={`/company/${item.researchReport.company.ticker}/report`} className="text-ink hover:text-accent font-medium">
                  {item.researchReport.company.ticker}
                </Link>
                <span className="text-ink/60 ml-2 text-sm">v{item.researchReport.version}</span>
                <span className="text-ink/40 ml-2 text-xs">saved {formatUpdatedAt(item.savedAt)}</span>
              </div>
              <button type="button" onClick={() => handleUnsave(item.researchReport.id)} className="text-ink/40 text-sm hover:text-red-700">
                Unsave
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
