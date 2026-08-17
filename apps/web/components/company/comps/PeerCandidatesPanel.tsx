'use client';

import { safeDivide } from '@/lib/analytics/ratios';
import type { PeerCandidate } from '@/lib/comps/types';
import { formatCompactCurrency, formatRatioAsPercent } from '@/lib/utils/format';
import { PeerSearchInput } from './PeerSearchInput';

interface PeerCandidatesPanelProps {
  candidates: PeerCandidate[];
  selectedTickers: Set<string>;
  onAccept: (candidate: PeerCandidate) => void;
  onAddManual: (ticker: string) => void;
  isAddingManual: boolean;
  onReset: () => void;
  isLoading: boolean;
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 70 ? 'bg-emerald-500' : score >= 40 ? 'bg-amber-500' : 'bg-ink/30';
  return (
    <div className="flex items-center gap-2">
      <div className="bg-ink/10 h-1.5 w-16 overflow-hidden rounded-full">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, score)}%` }} />
      </div>
      <span className="text-ink font-mono text-xs tabular-nums">{score.toFixed(1)}</span>
    </div>
  );
}

export function PeerCandidatesPanel({
  candidates,
  selectedTickers,
  onAccept,
  onAddManual,
  isAddingManual,
  onReset,
  isLoading,
}: PeerCandidatesPanelProps) {
  const visibleCandidates = candidates.filter((c) => !selectedTickers.has(c.metrics.ticker));

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-ink font-serif text-lg font-semibold">Comparable Companies</h2>
          <p className="text-ink/50 mt-1 text-xs">
            Ranked by similarity score — see the methodology page for exactly how each score is
            calculated. Accept a suggestion, search for another company, or reset to start over.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <PeerSearchInput excludeTickers={selectedTickers} onAdd={onAddManual} isAdding={isAddingManual} />
          <button
            type="button"
            onClick={onReset}
            className="border-ink/15 text-ink/70 hover:bg-accent-soft rounded-lg border px-3 py-2 text-xs font-medium"
          >
            Reset to Suggested
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="border-ink/10 bg-paper text-ink/50 mt-3 rounded-xl border p-6 text-center text-sm">
          Screening for comparable companies…
        </div>
      ) : visibleCandidates.length === 0 ? (
        <div className="border-ink/10 bg-paper text-ink/50 mt-3 rounded-xl border p-6 text-center text-sm">
          No further suggestions — Atlas found no other companies sharing this company&apos;s sector
          or industry yet. Search above to add a peer manually.
        </div>
      ) : (
        <div className="border-ink/10 mt-3 overflow-x-auto rounded-xl border">
          <table className="w-full min-w-max border-collapse text-sm">
            <thead>
              <tr className="border-ink/10 bg-paper border-b">
                <th className="text-ink/40 px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide">Company</th>
                <th className="text-ink/40 px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide">Similarity Score</th>
                <th className="text-ink/40 px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide">Industry</th>
                <th className="text-ink/40 px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide">Revenue</th>
                <th className="text-ink/40 px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide">Growth</th>
                <th className="text-ink/40 px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide">EBITDA Margin</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {visibleCandidates.map((candidate) => (
                <tr key={candidate.metrics.ticker} className="border-ink/5 border-b last:border-0">
                  <td className="px-4 py-2.5">
                    <div className="text-ink font-medium">{candidate.metrics.name}</div>
                    <div className="text-ink/40 font-mono text-xs">{candidate.metrics.ticker}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <ScoreBar score={candidate.score.totalScore} />
                  </td>
                  <td className="text-ink/70 px-4 py-2.5">{candidate.metrics.industry ?? '—'}</td>
                  <td className="text-ink px-4 py-2.5 text-right font-mono tabular-nums">
                    {formatCompactCurrency(candidate.metrics.revenue)}
                  </td>
                  <td className="text-ink px-4 py-2.5 text-right font-mono tabular-nums">
                    {formatRatioAsPercent(candidate.metrics.revenueGrowth)}
                  </td>
                  <td className="text-ink px-4 py-2.5 text-right font-mono tabular-nums">
                    {formatRatioAsPercent(safeDivide(candidate.metrics.ebitda, candidate.metrics.revenue))}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => onAccept(candidate)}
                      className="border-accent text-accent hover:bg-accent-soft rounded-lg border px-2.5 py-1 text-xs font-medium"
                    >
                      Accept
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
