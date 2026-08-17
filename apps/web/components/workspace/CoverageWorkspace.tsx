'use client';

import { useState } from 'react';
import Link from 'next/link';
import { assignCompanyCoverage, type AnalystCoverageRowResponse, type CoverageTableRowResponse } from '@/lib/api/workspace';
import { ApiError } from '@/lib/api/companies';
import { formatUpdatedAt } from '@/lib/utils/format';

interface MemberOption {
  id: string;
  name: string | null;
  email: string;
}

/** Spec section 4's coverage table (Company/Ticker/Sector/Analyst/Research
 * Status/Last Updated/Open Issues) and spec section 16's per-analyst
 * summary — workflow visibility only, never a performance ranking. */
export function CoverageWorkspace({
  workspaceId,
  initialCoverage,
  initialAnalystSummary,
  members,
  canAssign,
}: {
  workspaceId: string;
  initialCoverage: CoverageTableRowResponse[];
  initialAnalystSummary: AnalystCoverageRowResponse[];
  members: MemberOption[];
  canAssign: boolean;
}) {
  const [coverage, setCoverage] = useState(initialCoverage);
  const [ticker, setTicker] = useState('');
  const [analystUserId, setAnalystUserId] = useState(members[0]?.id ?? '');
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAssign(event: React.FormEvent) {
    event.preventDefault();
    if (!ticker.trim() || !analystUserId) return;
    setAssigning(true);
    setError(null);
    try {
      await assignCompanyCoverage(workspaceId, ticker.trim().toUpperCase(), analystUserId);
      const analyst = members.find((m) => m.id === analystUserId) ?? null;
      setCoverage((prev) => {
        const withoutExisting = prev.filter((row) => row.ticker !== ticker.trim().toUpperCase());
        return [
          { ticker: ticker.trim().toUpperCase(), companyName: ticker.trim().toUpperCase(), sector: null, analyst, lastResearchUpdate: null, lastReviewApprovedAt: null, openTasks: 0, openIntegrityIssues: 0, investmentCaseStatus: null },
          ...withoutExisting,
        ];
      });
      setTicker('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to assign coverage.');
    } finally {
      setAssigning(false);
    }
  }

  return (
    <div className="mt-6 space-y-8">
      {canAssign && (
        <form onSubmit={handleAssign} className="border-ink/10 bg-paper flex flex-wrap items-end gap-3 rounded-xl border p-4">
          <div>
            <label className="text-ink/60 text-xs font-medium">Ticker</label>
            <input value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} placeholder="NVDA" className="border-ink/15 bg-paper text-ink mt-1 block w-32 rounded-lg border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-ink/60 text-xs font-medium">Analyst</label>
            <select value={analystUserId} onChange={(e) => setAnalystUserId(e.target.value)} className="border-ink/15 bg-paper text-ink mt-1 block rounded-lg border px-3 py-2 text-sm">
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name ?? m.email}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" disabled={assigning || !ticker.trim()} className="bg-accent rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {assigning ? 'Assigning…' : 'Assign Coverage'}
          </button>
          {error && <p className="w-full text-sm text-red-700">{error}</p>}
        </form>
      )}

      <section>
        <h2 className="text-ink font-serif text-lg">Companies</h2>
        {coverage.length === 0 ? (
          <p className="text-ink/40 mt-2 text-sm">No companies are assigned coverage in this workspace yet.</p>
        ) : (
          <div className="border-ink/10 mt-2 overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-ink/40 border-ink/10 border-b text-left text-xs uppercase tracking-wide">
                  <th className="px-4 py-2 font-medium">Company</th>
                  <th className="px-4 py-2 font-medium">Sector</th>
                  <th className="px-4 py-2 font-medium">Analyst</th>
                  <th className="px-4 py-2 font-medium">Last Updated</th>
                  <th className="px-4 py-2 font-medium">Open Issues</th>
                  <th className="px-4 py-2 font-medium">Open Tasks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {coverage.map((row) => (
                  <tr key={row.ticker}>
                    <td className="px-4 py-2.5">
                      <Link href={`/company/${row.ticker}`} className="text-accent font-medium hover:underline">
                        {row.ticker}
                      </Link>
                      <span className="text-ink/40 ml-1">{row.companyName}</span>
                    </td>
                    <td className="text-ink/60 px-4 py-2.5">{row.sector ?? '—'}</td>
                    <td className="text-ink/70 px-4 py-2.5">{row.analyst?.name ?? row.analyst?.email ?? '—'}</td>
                    <td className="text-ink/40 px-4 py-2.5 text-xs">{row.lastResearchUpdate ? formatUpdatedAt(row.lastResearchUpdate) : '—'}</td>
                    <td className="px-4 py-2.5">{row.openIntegrityIssues > 0 ? <span className="font-medium text-red-700">{row.openIntegrityIssues}</span> : row.openIntegrityIssues}</td>
                    <td className="px-4 py-2.5">{row.openTasks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-ink font-serif text-lg">Analyst Coverage</h2>
        <p className="text-ink/40 mt-1 text-xs">Workflow visibility only — not a performance ranking.</p>
        <div className="border-ink/10 mt-2 overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-ink/40 border-ink/10 border-b text-left text-xs uppercase tracking-wide">
                <th className="px-4 py-2 font-medium">Analyst</th>
                <th className="px-4 py-2 font-medium">Companies</th>
                <th className="px-4 py-2 font-medium">Reports</th>
                <th className="px-4 py-2 font-medium">Open Tasks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {initialAnalystSummary.map((row) => (
                <tr key={row.analyst.id}>
                  <td className="text-ink px-4 py-2.5 font-medium">{row.analyst.name ?? row.analyst.email}</td>
                  <td className="px-4 py-2.5">{row.companies}</td>
                  <td className="px-4 py-2.5">{row.reports}</td>
                  <td className="px-4 py-2.5">{row.openTasks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
