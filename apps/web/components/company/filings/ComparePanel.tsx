'use client';

import { useState } from 'react';
import type { FilingComparisonResponse } from '@/lib/api/filings';
import { generateFilingComparison } from '@/lib/api/filings';
import { formatDate, formatPercent } from '@/lib/utils/format';

interface PreviousFilingRef {
  id: string;
  formType: string;
  filingDate: string;
}

interface ComparePanelProps {
  filingId: string;
  currentFormType: string;
  currentFilingDate: string;
  previousFiling: PreviousFilingRef | null;
  initialComparison: FilingComparisonResponse | null;
  aiConfigured: boolean;
}

function formatChange(change: number | null, kind: 'growth' | 'points'): string {
  if (change === null) return '—';
  return kind === 'points' ? `${change >= 0 ? '+' : ''}${(change * 100).toFixed(1)}pp` : formatPercent(change * 100);
}

export function ComparePanel({
  filingId,
  currentFormType,
  currentFilingDate,
  previousFiling,
  initialComparison,
  aiConfigured,
}: ComparePanelProps) {
  const [comparison, setComparison] = useState(initialComparison);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A FAILED row cached from before AI was disabled is treated as if
  // nothing had been generated — a visitor never sees an API-key failure
  // message. A SUCCESS row is always shown regardless of current configuration.
  const displayComparison = comparison && (aiConfigured || comparison.status === 'SUCCESS') ? comparison : null;

  async function handleGenerate(regenerate: boolean) {
    if (!previousFiling) return;
    setIsGenerating(true);
    setError(null);
    try {
      const result = await generateFilingComparison(filingId, previousFiling.id, regenerate);
      setComparison(result);
    } catch {
      setError('Failed to generate the comparison. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <section className="mt-8">
      <h2 className="text-ink font-serif text-lg font-semibold">Compare with Previous Filing</h2>

      {!previousFiling ? (
        <p className="text-ink/50 mt-2 text-sm">No prior {currentFormType} was found for this company to compare against.</p>
      ) : (
        <>
          <p className="text-ink/50 mt-1 text-sm">
            {currentFormType} filed {formatDate(currentFilingDate)} vs. {previousFiling.formType} filed{' '}
            {formatDate(previousFiling.filingDate)}
          </p>

          {aiConfigured && !displayComparison && (
            <button
              type="button"
              onClick={() => handleGenerate(false)}
              disabled={isGenerating}
              className="bg-accent mt-3 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {isGenerating ? 'Comparing…' : 'Generate Comparison'}
            </button>
          )}
          {!aiConfigured && !displayComparison && (
            <p className="text-ink/50 mt-2 text-sm">AI-generated comparison isn&apos;t enabled in this environment.</p>
          )}

          {error && <p className="mt-2 text-xs text-red-700">{error}</p>}

          {displayComparison && (
            <div className="mt-4 space-y-4">
              {displayComparison.status === 'FAILED' && (
                <div className="border-ink/10 bg-paper rounded-xl border p-4">
                  <p className="text-sm font-medium text-red-700">Comparison generation failed.</p>
                  <p className="text-ink/60 mt-1 text-xs">{displayComparison.error}</p>
                </div>
              )}

              <div className="border-ink/10 bg-paper overflow-x-auto rounded-xl border">
                <table className="w-full min-w-max border-collapse text-sm">
                  <thead>
                    <tr className="border-ink/10 border-b">
                      <th className="text-ink/40 px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide">Metric</th>
                      <th className="text-ink/40 px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide">Current</th>
                      <th className="text-ink/40 px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide">Prior</th>
                      <th className="text-ink/40 px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayComparison.financialChanges.map((metric) => (
                      <tr key={metric.label} className="border-ink/5 border-b last:border-0">
                        <td className="text-ink px-4 py-2 font-medium">{metric.label}</td>
                        <td className="text-ink px-4 py-2 text-right font-mono tabular-nums">
                          {metric.current !== null ? metric.current.toLocaleString() : '—'}
                        </td>
                        <td className="text-ink px-4 py-2 text-right font-mono tabular-nums">
                          {metric.prior !== null ? metric.prior.toLocaleString() : '—'}
                        </td>
                        <td className="text-ink px-4 py-2 text-right font-mono tabular-nums">
                          {formatChange(metric.change, metric.changeKind)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-ink/40 border-ink/10 border-t px-4 py-2 text-xs">
                  Computed directly from Atlas&apos;s stored financial statements — not AI-generated.
                </p>
              </div>

              {displayComparison.status === 'SUCCESS' && (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div className="border-ink/10 bg-paper rounded-xl border p-4">
                    <h3 className="text-ink text-sm font-semibold">New Risks</h3>
                    {displayComparison.newRisks.length === 0 ? (
                      <p className="text-ink/40 mt-2 text-xs">None identified.</p>
                    ) : (
                      <ul className="mt-2 space-y-2 text-sm">
                        {displayComparison.newRisks.map((item, i) => (
                          <li key={i} className="text-ink">
                            {item.description}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="border-ink/10 bg-paper rounded-xl border p-4">
                    <h3 className="text-ink text-sm font-semibold">Removed Risks</h3>
                    {displayComparison.removedRisks.length === 0 ? (
                      <p className="text-ink/40 mt-2 text-xs">None identified.</p>
                    ) : (
                      <ul className="mt-2 space-y-2 text-sm">
                        {displayComparison.removedRisks.map((item, i) => (
                          <li key={i} className="text-ink">
                            {item.description}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="border-ink/10 bg-paper rounded-xl border p-4 lg:col-span-2">
                    <h3 className="text-ink text-sm font-semibold">Notable Language Changes</h3>
                    {displayComparison.changedLanguage.length === 0 ? (
                      <p className="text-ink/40 mt-2 text-xs">None identified.</p>
                    ) : (
                      <ul className="mt-2 space-y-3 text-sm">
                        {displayComparison.changedLanguage.map((item, i) => (
                          <li key={i}>
                            <span className="mb-1 inline-block rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                              {item.note}
                            </span>
                            <p className="text-ink">{item.description}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="border-ink/10 bg-paper rounded-xl border p-4">
                    <h3 className="text-ink text-sm font-semibold">Guidance Changes</h3>
                    {displayComparison.guidanceChanges.length === 0 ? (
                      <p className="text-ink/40 mt-2 text-xs">None identified.</p>
                    ) : (
                      <ul className="mt-2 space-y-2 text-sm">
                        {displayComparison.guidanceChanges.map((item, i) => (
                          <li key={i} className="text-ink">
                            {item.description}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="border-ink/10 bg-paper rounded-xl border p-4">
                    <h3 className="text-ink text-sm font-semibold">Management Commentary Changes</h3>
                    {displayComparison.managementCommentaryChanges.length === 0 ? (
                      <p className="text-ink/40 mt-2 text-xs">None identified.</p>
                    ) : (
                      <ul className="mt-2 space-y-2 text-sm">
                        {displayComparison.managementCommentaryChanges.map((item, i) => (
                          <li key={i} className="text-ink">
                            {item.description}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}

              {aiConfigured && (
                <button
                  type="button"
                  onClick={() => handleGenerate(true)}
                  disabled={isGenerating}
                  className="border-ink/15 text-ink/70 hover:bg-accent-soft rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                >
                  {isGenerating ? 'Regenerating…' : 'Regenerate Comparison'}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
