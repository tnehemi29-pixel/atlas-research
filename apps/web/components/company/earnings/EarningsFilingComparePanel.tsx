'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { EarningsFilingComparisonResponse } from '@/lib/api/earnings';
import { generateEarningsFilingComparison } from '@/lib/api/earnings';
import type { CrossSourceItem } from '@/lib/ai/earningsSchema';

interface MatchingFilingRef {
  id: string;
  formType: string;
  ticker: string;
}

interface EarningsFilingComparePanelProps {
  earningsCallId: string;
  matchingFiling: MatchingFilingRef | null;
  initialComparison: EarningsFilingComparisonResponse | null;
  aiConfigured: boolean;
}

function CrossSourceList({ items, emptyMessage }: { items: CrossSourceItem[]; emptyMessage: string }) {
  if (items.length === 0) return <p className="text-ink/40 mt-2 text-xs">{emptyMessage}</p>;
  return (
    <ul className="mt-2 space-y-3 text-sm">
      {items.map((item, i) => (
        <li key={i}>
          <span className="text-ink/40 text-xs font-medium uppercase tracking-wide">{item.topic}</span>
          <p className="text-ink mt-0.5">{item.description}</p>
          <div className="mt-1 flex flex-wrap gap-2 text-xs">
            {item.call_source && (
              <span className="border-ink/10 bg-bg text-ink/60 rounded border px-1.5 py-0.5">
                Call — {item.call_source.speaker}: &ldquo;{item.call_source.excerpt}&rdquo;
              </span>
            )}
            {item.filing_source && (
              <span className="border-ink/10 bg-bg text-ink/60 rounded border px-1.5 py-0.5">
                Filing — {item.filing_source.section}: &ldquo;{item.filing_source.excerpt}&rdquo;
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** "Earnings Call vs. SEC Filing" — cross-source research (spec section 12).
 * Every difference is framed neutrally ("Potential difference in emphasis")
 * by the AI prompt — this component never adds its own bullish/bearish or
 * "contradiction" language on top. */
export function EarningsFilingComparePanel({
  earningsCallId,
  matchingFiling,
  initialComparison,
  aiConfigured,
}: EarningsFilingComparePanelProps) {
  const [comparison, setComparison] = useState(initialComparison);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A FAILED row cached from before AI was disabled is treated as if
  // nothing had been generated — a visitor never sees an API-key failure
  // message. A SUCCESS row is always shown regardless of current configuration.
  const displayComparison = comparison && (aiConfigured || comparison.status === 'SUCCESS') ? comparison : null;

  async function handleGenerate(regenerate: boolean) {
    if (!matchingFiling) return;
    setIsGenerating(true);
    setError(null);
    try {
      const result = await generateEarningsFilingComparison(earningsCallId, matchingFiling.id, regenerate);
      setComparison(result);
    } catch {
      setError('Failed to generate the comparison. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <section className="mt-8">
      <h2 className="text-ink font-serif text-lg font-semibold">Compare with SEC Filing</h2>

      {!matchingFiling ? (
        <p className="text-ink/50 mt-2 text-sm">
          No matching 10-Q/10-K was found for this call&apos;s period yet — this comparison becomes available once
          the corresponding SEC filing has been ingested.
        </p>
      ) : (
        <>
          <p className="text-ink/50 mt-1 text-sm">
            Earnings call vs.{' '}
            <Link href={`/company/${matchingFiling.ticker}/filings/${matchingFiling.id}`} className="text-accent hover:underline">
              {matchingFiling.formType}
            </Link>
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

              {displayComparison.status === 'SUCCESS' && (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div className="border-ink/10 bg-paper rounded-xl border p-4">
                    <h3 className="text-ink text-sm font-semibold">Aligned Topics</h3>
                    <CrossSourceList items={displayComparison.alignments} emptyMessage="None identified." />
                  </div>
                  <div className="border-ink/10 bg-paper rounded-xl border p-4">
                    <h3 className="text-ink text-sm font-semibold">New in the Call</h3>
                    <CrossSourceList items={displayComparison.newInCall} emptyMessage="None identified." />
                  </div>
                  <div className="border-ink/10 bg-paper rounded-xl border p-4">
                    <h3 className="text-ink text-sm font-semibold">Only in the Filing</h3>
                    <CrossSourceList items={displayComparison.onlyInFiling} emptyMessage="None identified." />
                  </div>
                  <div className="border-ink/10 bg-paper rounded-xl border p-4">
                    <h3 className="text-ink text-sm font-semibold">Risk Emphasis Differences</h3>
                    <CrossSourceList items={displayComparison.riskEmphasisDifferences} emptyMessage="None identified." />
                  </div>
                  <div className="border-ink/10 bg-paper rounded-xl border p-4 lg:col-span-2">
                    <h3 className="text-ink text-sm font-semibold">Guidance Differences</h3>
                    <CrossSourceList items={displayComparison.guidanceDifferences} emptyMessage="None identified." />
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
