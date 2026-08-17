'use client';

import { useState } from 'react';
import type { EarningsComparisonResponse } from '@/lib/api/earnings';
import { generateEarningsComparison } from '@/lib/api/earnings';
import { formatPercent } from '@/lib/utils/format';

interface PreviousCallRef {
  id: string;
  fiscalYear: number;
  fiscalQuarter: number;
}

interface EarningsComparePanelProps {
  earningsCallId: string;
  currentFiscalYear: number;
  currentFiscalQuarter: number;
  previousCall: PreviousCallRef | null;
  initialComparison: EarningsComparisonResponse | null;
  aiConfigured: boolean;
}

function formatChange(value: number | null, kind: 'growth' | 'points'): string {
  if (value === null) return '—';
  return kind === 'points' ? `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}pp` : formatPercent(value * 100);
}

const CHANGE_TYPE_STYLE: Record<string, string> = {
  'New topic': 'border-accent/30 bg-accent-soft text-accent',
  'Changed emphasis': 'border-amber-300 bg-amber-50 text-amber-800',
  'Similar commentary': 'border-ink/15 bg-ink/5 text-ink/60',
};

export function EarningsComparePanel({
  earningsCallId,
  currentFiscalYear,
  currentFiscalQuarter,
  previousCall,
  initialComparison,
  aiConfigured,
}: EarningsComparePanelProps) {
  const [comparison, setComparison] = useState(initialComparison);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A FAILED row cached from before AI was disabled (or before a key was
  // ever configured) is treated as if nothing had been generated — a
  // visitor never sees an API-key failure message. A SUCCESS row is always
  // shown regardless of current configuration.
  const displayComparison = comparison && (aiConfigured || comparison.status === 'SUCCESS') ? comparison : null;

  async function handleGenerate(regenerate: boolean) {
    if (!previousCall) return;
    setIsGenerating(true);
    setError(null);
    try {
      const result = await generateEarningsComparison(earningsCallId, previousCall.id, regenerate);
      setComparison(result);
    } catch {
      setError('Failed to generate the comparison. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <section className="mt-8">
      <h2 className="text-ink font-serif text-lg font-semibold">Compare with Previous Quarter</h2>

      {!previousCall ? (
        <p className="text-ink/50 mt-2 text-sm">No prior quarter&apos;s call was found for this company to compare against.</p>
      ) : (
        <>
          <p className="text-ink/50 mt-1 text-sm">
            Q{currentFiscalQuarter} {currentFiscalYear} vs. Q{previousCall.fiscalQuarter} {previousCall.fiscalYear}
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
            <p className="text-ink/50 mt-2 text-sm">
              AI-generated comparison isn&apos;t enabled in this environment — see the Financial Results section
              above for this quarter&apos;s QoQ figures.
            </p>
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
                      <th className="text-ink/40 px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide">Actual</th>
                      <th className="text-ink/40 px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide">QoQ Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayComparison.financialChanges.map((metric) => (
                      <tr key={metric.label} className="border-ink/5 border-b last:border-0">
                        <td className="text-ink px-4 py-2 font-medium">{metric.label}</td>
                        <td className="text-ink px-4 py-2 text-right font-mono tabular-nums">
                          {metric.actual !== null ? metric.actual.toLocaleString() : '—'}
                        </td>
                        <td className="text-ink px-4 py-2 text-right font-mono tabular-nums">
                          {formatChange(metric.qoqChange, metric.changeKind)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-ink/40 border-ink/10 border-t px-4 py-2 text-xs">
                  Computed directly from Atlas&apos;s stored financial statements — not AI-generated.
                </p>
              </div>

              {displayComparison.guidanceSummary.length > 0 && (
                <div className="border-ink/10 bg-paper rounded-xl border p-4">
                  <h3 className="text-ink text-sm font-semibold">Guidance Changes</h3>
                  <ul className="mt-2 space-y-1.5 text-sm">
                    {displayComparison.guidanceSummary.map((g, i) => (
                      <li key={i} className="text-ink/80 flex items-center justify-between gap-2">
                        <span>
                          {g.metricLabel} ({g.period})
                        </span>
                        <span className="text-ink/50 text-xs">{g.change}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {displayComparison.status === 'SUCCESS' && (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div className="border-ink/10 bg-paper rounded-xl border p-4 lg:col-span-2">
                    <h3 className="text-ink text-sm font-semibold">Language Changes</h3>
                    {displayComparison.languageChanges.length === 0 ? (
                      <p className="text-ink/40 mt-2 text-xs">None identified.</p>
                    ) : (
                      <ul className="mt-2 space-y-3 text-sm">
                        {displayComparison.languageChanges.map((item, i) => (
                          <li key={i}>
                            <div className="flex items-center gap-2">
                              <span className="text-ink/40 text-xs font-medium uppercase tracking-wide">{item.topic}</span>
                              <span
                                className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${CHANGE_TYPE_STYLE[item.change_type] ?? ''}`}
                              >
                                {item.change_type}
                              </span>
                            </div>
                            <p className="text-ink mt-1">{item.description}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="border-ink/10 bg-paper rounded-xl border p-4 lg:col-span-2">
                    <h3 className="text-ink text-sm font-semibold">Tone Comparison</h3>
                    <p className="text-ink/40 mt-1 text-xs">AI-based language analysis — an interpretation, not a measurement.</p>
                    {displayComparison.toneComparison.length === 0 ? (
                      <p className="text-ink/40 mt-2 text-xs">None identified.</p>
                    ) : (
                      <ul className="mt-2 space-y-2 text-sm">
                        {displayComparison.toneComparison.map((item, i) => (
                          <li key={i}>
                            <span className="text-ink/40 text-xs font-medium uppercase tracking-wide">{item.dimension}</span>
                            <p className="text-ink">{item.note}</p>
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
