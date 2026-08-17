'use client';

import { useState } from 'react';
import Link from 'next/link';
import { compareInvestmentCaseVersions, generateInvestmentMemo, type InvestmentMemoResponse, type InvestmentCaseVersionResponse, type VersionDiffResponse } from '@/lib/api/investmentCases';
import { ApiError } from '@/lib/api/companies';
import { formatDate, formatPrice } from '@/lib/utils/format';

/** Spec sections 21-22 — the Investment Memo generator and version diffing.
 * Every memo creates a fresh, frozen version snapshot first (never reuses a
 * stale one); the version-to-version diff shown here is a plain,
 * deterministic structural comparison — never AI-generated. */
export function MemoPanel({
  caseId,
  versions,
  memos,
  onChanged,
}: {
  caseId: string;
  versions: InvestmentCaseVersionResponse[];
  memos: InvestmentMemoResponse[];
  onChanged: () => Promise<void>;
}) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromVersion, setFromVersion] = useState<number | null>(null);
  const [toVersion, setToVersion] = useState<number | null>(null);
  const [diff, setDiff] = useState<VersionDiffResponse | null>(null);
  const [diffing, setDiffing] = useState(false);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      await generateInvestmentMemo(caseId);
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to generate the memo.');
    } finally {
      setGenerating(false);
    }
  }

  async function handleCompare() {
    if (fromVersion === null || toVersion === null) return;
    setDiffing(true);
    setError(null);
    try {
      const result = await compareInvestmentCaseVersions(caseId, fromVersion, toVersion);
      setDiff(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to compare versions.');
    } finally {
      setDiffing(false);
    }
  }

  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="text-ink font-serif text-lg">Investment Memo</h2>
        <button type="button" onClick={handleGenerate} disabled={generating} className="bg-accent rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {generating ? 'Generating…' : 'Generate Memo'}
        </button>
      </div>
      <p className="text-ink/50 mt-1 text-sm">A 16-section memo built from this case&apos;s real, frozen state — every figure is read from Atlas&apos;s own engines, never invented.</p>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}

      {memos.length === 0 ? (
        <p className="text-ink/40 mt-4 text-sm">No memos generated yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-black/5">
          {memos.map((m) => (
            <li key={m.id} className="flex items-center justify-between py-2">
              <div>
                <Link href={`/investment-cases/${caseId}/memo/${m.id}`} className="text-ink hover:text-accent text-sm font-medium">
                  Memo — {formatDate(m.createdAt)}
                </Link>
                <span className={`ml-2 text-xs ${m.status === 'SUCCESS' ? 'text-emerald-700' : 'text-amber-700'}`}>{m.status === 'SUCCESS' ? 'Complete' : 'Narrative unavailable'}</span>
              </div>
              <span className="text-ink/40 text-xs">v{versions.find((v) => v.id === m.versionId)?.version ?? '—'}</span>
            </li>
          ))}
        </ul>
      )}

      {versions.length >= 2 && (
        <div className="border-ink/10 mt-6 rounded-lg border p-4">
          <h3 className="text-ink text-sm font-medium">Compare Versions</h3>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select value={fromVersion ?? ''} onChange={(e) => setFromVersion(e.target.value ? Number(e.target.value) : null)} className="border-ink/15 bg-paper text-ink rounded-lg border px-2 py-1.5 text-sm">
              <option value="">From version…</option>
              {versions.map((v) => (
                <option key={v.id} value={v.version}>
                  v{v.version} ({formatDate(v.createdAt)})
                </option>
              ))}
            </select>
            <span className="text-ink/30 text-sm">→</span>
            <select value={toVersion ?? ''} onChange={(e) => setToVersion(e.target.value ? Number(e.target.value) : null)} className="border-ink/15 bg-paper text-ink rounded-lg border px-2 py-1.5 text-sm">
              <option value="">To version…</option>
              {versions.map((v) => (
                <option key={v.id} value={v.version}>
                  v{v.version} ({formatDate(v.createdAt)})
                </option>
              ))}
            </select>
            <button type="button" onClick={handleCompare} disabled={diffing || fromVersion === null || toVersion === null} className="border-ink/15 rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-50">
              {diffing ? 'Comparing…' : 'Compare'}
            </button>
          </div>

          {diff && (
            <div className="mt-4 space-y-3 text-sm">
              {diff.thesisChanges.length === 0 && diff.assumptionChanges.length === 0 && diff.addedEvidence.length === 0 && diff.removedEvidence.length === 0 && diff.valuationChanges.length === 0 ? (
                <p className="text-ink/40">No differences between these two versions.</p>
              ) : (
                <>
                  {diff.thesisChanges.length > 0 && (
                    <div>
                      <p className="text-ink/50 text-xs font-medium uppercase tracking-wide">Thesis Changes</p>
                      <ul className="mt-1 space-y-0.5">
                        {diff.thesisChanges.map((c, i) => (
                          <li key={i} className="text-ink/70">
                            · {c}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {diff.assumptionChanges.length > 0 && (
                    <div>
                      <p className="text-ink/50 text-xs font-medium uppercase tracking-wide">Assumption Changes</p>
                      <ul className="mt-1 space-y-0.5">
                        {diff.assumptionChanges.map((c, i) => (
                          <li key={i} className="text-ink/70">
                            · {c.label} ({c.scenario}): {c.previousValue ?? '—'} → {c.newValue ?? '—'}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {diff.valuationChanges.length > 0 && (
                    <div>
                      <p className="text-ink/50 text-xs font-medium uppercase tracking-wide">Valuation Changes</p>
                      <ul className="mt-1 space-y-0.5">
                        {diff.valuationChanges.map((c, i) => (
                          <li key={i} className="text-ink/70">
                            · {c.label}: {formatPrice(c.previousValue)} → {formatPrice(c.newValue)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {(diff.addedEvidence.length > 0 || diff.removedEvidence.length > 0) && (
                    <div>
                      <p className="text-ink/50 text-xs font-medium uppercase tracking-wide">Evidence Changes</p>
                      <p className="text-ink/70 mt-1">
                        +{diff.addedEvidence.length} added, -{diff.removedEvidence.length} removed
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
