'use client';

import { useMemo, useState } from 'react';
import { generateReport, type ResearchReportResponse } from '@/lib/api/reports';
import { saveReport, unsaveReport } from '@/lib/api/savedReports';
import { ApiError } from '@/lib/api/companies';
import { CompanyNav } from '@/components/company/CompanyNav';
import { ReportDetail } from './ReportDetail';
import { ThesisMonitorPanel } from './ThesisMonitorPanel';

interface ReportWorkspaceProps {
  ticker: string;
  initialReports: ResearchReportResponse[];
  aiConfigured: boolean;
  loggedIn: boolean;
  initialSavedReportIds: string[];
}

export function ReportWorkspace({ ticker, initialReports, aiConfigured, loggedIn, initialSavedReportIds }: ReportWorkspaceProps) {
  const [reports, setReports] = useState(initialReports);
  const [selectedId, setSelectedId] = useState<string | null>(initialReports[0]?.id ?? null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState(new Set(initialSavedReportIds));
  const [savingBookmark, setSavingBookmark] = useState(false);

  const selected = useMemo(() => reports.find((r) => r.id === selectedId) ?? null, [reports, selectedId]);

  // Same stale-failure discipline as the Milestone 8 fix: a FAILED version
  // cached from an earlier session (when a key may briefly have existed, or
  // from testing) never surfaces raw error text once AI is unconfigured —
  // it's treated as a neutral "not enabled" state instead.
  const showRawFailure = selected?.status === 'FAILED' && aiConfigured;

  async function handleToggleSave() {
    if (!selected) return;
    setSavingBookmark(true);
    try {
      if (savedIds.has(selected.id)) {
        await unsaveReport(selected.id);
        setSavedIds((prev) => {
          const next = new Set(prev);
          next.delete(selected.id);
          return next;
        });
      } else {
        await saveReport(selected.id);
        setSavedIds((prev) => new Set(prev).add(selected.id));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update saved reports.');
    } finally {
      setSavingBookmark(false);
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const report = await generateReport(ticker);
      setReports((prev) => [report, ...prev]);
      setSelectedId(report.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to generate the research report.');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-12 print:max-w-none print:px-0 print:py-0">
      <div className="print:hidden">
        <CompanyNav ticker={ticker} active="report" />
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-ink font-serif text-2xl">{ticker} Research Report</h1>
          <p className="text-ink/50 mt-1 max-w-xl text-sm">
            Synthesizes Atlas&apos;s existing fundamentals, DCF, comparable-company, SEC filing, and earnings-call data
            into one structured report. Every figure is computed by Atlas&apos;s own engines — the AI only organizes and
            explains them.{' '}
            <a href={`/company/${ticker}/report/methodology`} className="text-accent hover:underline">
              How this works →
            </a>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {reports.length > 1 && (
            <select
              value={selectedId ?? ''}
              onChange={(e) => setSelectedId(e.target.value)}
              className="border-ink/15 bg-paper text-ink rounded-lg border px-2 py-1.5 text-sm"
              aria-label="Select report version"
            >
              {reports.map((r) => (
                <option key={r.id} value={r.id}>
                  Version {r.version} — {r.status === 'SUCCESS' ? 'Generated' : 'Failed'} {new Date(r.createdAt).toLocaleDateString()}
                </option>
              ))}
            </select>
          )}
          {selected && selected.status === 'SUCCESS' && (
            <button
              type="button"
              onClick={() => window.print()}
              className="border-ink/15 text-ink rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-black/5"
            >
              Print / Export
            </button>
          )}
          {loggedIn && selected && selected.status === 'SUCCESS' && (
            <button
              type="button"
              onClick={handleToggleSave}
              disabled={savingBookmark}
              className="border-ink/15 text-ink rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-black/5 disabled:opacity-50"
            >
              {savedIds.has(selected.id) ? 'Saved ✓' : 'Save Report'}
            </button>
          )}
          {aiConfigured && (
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating}
              className="bg-accent rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {generating ? 'Generating…' : reports.length > 0 ? 'Regenerate Report' : 'Generate Research Report'}
            </button>
          )}
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-red-700 print:hidden">{error}</p>}

      {!selected && (
        <div className="border-ink/10 bg-paper rounded-xl border p-8 text-center">
          <p className="text-ink/70 text-sm">
            No research report has been generated for {ticker} yet.
          </p>
          {!aiConfigured && (
            <p className="text-ink/50 mt-2 text-sm">AI-generated report analysis isn&apos;t enabled in this environment.</p>
          )}
        </div>
      )}

      {selected && selected.status === 'FAILED' && (
        <div className="border-ink/10 bg-paper rounded-xl border p-8 text-center">
          <p className="text-ink/70 text-sm">
            {showRawFailure ? `Report generation failed: ${selected.error ?? 'Unknown error.'}` : "AI-generated report analysis isn't enabled in this environment."}
          </p>
        </div>
      )}

      {selected && selected.status === 'SUCCESS' && (
        <>
          <ReportDetail report={selected} />
          <ThesisMonitorPanel ticker={ticker} />
        </>
      )}
    </main>
  );
}
