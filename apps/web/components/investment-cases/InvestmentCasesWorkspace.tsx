'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createInvestmentCase } from '@/lib/api/investmentCases';
import { ApiError } from '@/lib/api/companies';
import { formatDate, formatPrice } from '@/lib/utils/format';
import { INVESTMENT_CASE_STATUS_LABELS, INVESTMENT_CASE_STATUS_STYLE, THESIS_HEALTH_LABELS, THESIS_HEALTH_STYLE } from '@/lib/utils/investmentCaseDisplay';
import type { InvestmentCaseDashboardRow } from '@/lib/services/investmentCaseDashboardService';

function Badge({ label, className }: { label: string; className: string }) {
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${className}`}>{label}</span>;
}

export function InvestmentCasesWorkspace({ initialRows }: { initialRows: InvestmentCaseDashboardRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [ticker, setTicker] = useState('');
  const [horizon, setHorizon] = useState('3-5 years');
  const [coreThesis, setCoreThesis] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!ticker.trim() || !coreThesis.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const created = await createInvestmentCase({ ticker: ticker.trim().toUpperCase(), horizon: horizon.trim(), coreThesis: coreThesis.trim() });
      setRows((prev) => [
        {
          id: created.id,
          ticker: ticker.trim().toUpperCase(),
          companyName: ticker.trim().toUpperCase(),
          status: created.status,
          horizon: created.horizon,
          updatedAt: created.updatedAt,
          valuation: { currentSharePrice: null, dcfBase: null },
          thesisHealth: { status: 'STABLE', reasons: ['No open challenges, no potentially-met invalidation criteria, and no high-impact open risks.'] },
          mostRecentResearchEvent: null,
          lastReviewedAt: null,
          nextReviewDueAt: null,
          contextUnavailable: true,
        },
        ...prev,
      ]);
      setTicker('');
      setCoreThesis('');
      setShowForm(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create the investment case.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-ink font-serif text-2xl">Investment Cases</h1>
          <p className="text-ink/50 mt-1 max-w-2xl text-sm">
            Organize your research into structured investment cases — a decision workflow that always requires your own
            explicit confirmation. Atlas never decides, invalidates, or scores a thesis on your behalf.{' '}
            <Link href="/investment-cases/methodology" className="text-accent hover:underline">
              How this works
            </Link>
            .
          </p>
        </div>
        <button type="button" onClick={() => setShowForm((s) => !s)} className="bg-accent shrink-0 rounded-lg px-4 py-2 text-sm font-medium text-white">
          {showForm ? 'Cancel' : 'New Case'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="border-ink/10 bg-ink/[0.02] mt-6 space-y-3 rounded-lg border p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-ink/60 text-xs font-medium">Ticker</span>
              <input
                type="text"
                value={ticker}
                onChange={(e) => setTicker(e.target.value)}
                placeholder="AAPL"
                className="border-ink/15 bg-paper text-ink mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
            </label>
            <label className="block">
              <span className="text-ink/60 text-xs font-medium">Investment Horizon</span>
              <input
                type="text"
                value={horizon}
                onChange={(e) => setHorizon(e.target.value)}
                placeholder="3-5 years"
                className="border-ink/15 bg-paper text-ink mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
            </label>
          </div>
          <label className="block">
            <span className="text-ink/60 text-xs font-medium">Core Thesis</span>
            <textarea
              value={coreThesis}
              onChange={(e) => setCoreThesis(e.target.value)}
              rows={3}
              placeholder="The core investment thesis, in your own words…"
              className="border-ink/15 bg-paper text-ink mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </label>
          <button type="submit" disabled={creating || !ticker.trim() || !coreThesis.trim()} className="bg-accent rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {creating ? 'Creating…' : 'Create Case'}
          </button>
        </form>
      )}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}

      {rows.length === 0 ? (
        <p className="text-ink/50 mt-8 text-sm">No investment cases yet — create your first one above.</p>
      ) : (
        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr className="border-ink/10 text-ink/50 border-b text-left text-xs font-medium uppercase tracking-wide">
                <th className="py-2 pr-4">Company</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Valuation</th>
                <th className="py-2 pr-4">Thesis Health</th>
                <th className="py-2 pr-4">Recent Change</th>
                <th className="py-2 pr-4">Last Reviewed</th>
                <th className="py-2 pr-4">Next Review</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-ink/[0.02]">
                  <td className="py-3 pr-4">
                    <Link href={`/investment-cases/${row.id}`} className="text-ink hover:text-accent font-medium">
                      {row.ticker}
                    </Link>
                    <div className="text-ink/40 text-xs">{row.companyName}</div>
                  </td>
                  <td className="py-3 pr-4">
                    <Badge label={INVESTMENT_CASE_STATUS_LABELS[row.status] ?? row.status} className={INVESTMENT_CASE_STATUS_STYLE[row.status] ?? ''} />
                  </td>
                  <td className="py-3 pr-4">
                    {row.contextUnavailable ? (
                      <span className="text-ink/30 text-xs">Unavailable</span>
                    ) : (
                      <div>
                        <div className="text-ink">{formatPrice(row.valuation.currentSharePrice)}</div>
                        <div className="text-ink/40 text-xs">DCF Base: {formatPrice(row.valuation.dcfBase)}</div>
                      </div>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <Badge label={THESIS_HEALTH_LABELS[row.thesisHealth.status] ?? row.thesisHealth.status} className={THESIS_HEALTH_STYLE[row.thesisHealth.status] ?? ''} />
                  </td>
                  <td className="py-3 pr-4">
                    {row.mostRecentResearchEvent ? (
                      <div className="max-w-[220px] truncate text-ink/70" title={row.mostRecentResearchEvent.title}>
                        {row.mostRecentResearchEvent.title}
                      </div>
                    ) : (
                      <span className="text-ink/30 text-xs">None</span>
                    )}
                  </td>
                  <td className="text-ink/60 py-3 pr-4">{formatDate(row.lastReviewedAt)}</td>
                  <td className="text-ink/60 py-3 pr-4">{formatDate(row.nextReviewDueAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
