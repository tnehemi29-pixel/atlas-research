'use client';

import { useState } from 'react';
import { confirmInvestmentCaseReview, startInvestmentCaseReview, type InvestmentCaseReviewResponse, type ReviewOutcomeValue, type ReviewTypeValue } from '@/lib/api/investmentCases';
import { ApiError } from '@/lib/api/companies';
import { REVIEW_OUTCOME_LABELS } from '@/lib/utils/investmentCaseDisplay';
import { formatDate, formatPrice } from '@/lib/utils/format';

const OUTCOMES: ReviewOutcomeValue[] = ['THESIS_VALID', 'NEEDS_MODIFICATION', 'CONTINUE_MONITORING', 'INVALIDATED'];

/** Spec sections 14-16 — the Review Workflow. `startInvestmentCaseReview`
 * assembles a read-only summary (new research events since the last
 * review, live thesis challenges, valuation, historical validation,
 * evidence-matrix counts); `confirmInvestmentCaseReview` is the ONLY call
 * that ever sets an outcome, and it never itself changes the case's
 * decision status — that stays a separate, explicit control in the header. */
export function ReviewWorkflowPanel({ caseId, reviews, onChanged }: { caseId: string; reviews: InvestmentCaseReviewResponse[]; onChanged: () => Promise<void> }) {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ReviewOutcomeValue>('CONTINUE_MONITORING');
  const [notes, setNotes] = useState('');
  const [confirming, setConfirming] = useState(false);

  const latest = reviews[0] ?? null;
  const pending = latest && latest.outcome === null;

  async function handleStart(type: ReviewTypeValue) {
    setStarting(true);
    setError(null);
    try {
      await startInvestmentCaseReview(caseId, type);
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to start the review.');
    } finally {
      setStarting(false);
    }
  }

  async function handleConfirm() {
    if (!latest) return;
    setConfirming(true);
    setError(null);
    try {
      await confirmInvestmentCaseReview(caseId, latest.id, outcome, notes.trim() || null);
      await onChanged();
      setNotes('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to confirm the review.');
    } finally {
      setConfirming(false);
    }
  }

  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="text-ink font-serif text-lg">Review Workflow</h2>
        <div className="flex gap-2">
          <button type="button" disabled={starting} onClick={() => handleStart('QUARTERLY')} className="border-ink/15 rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50">
            Start Quarterly Review
          </button>
          <button type="button" disabled={starting} onClick={() => handleStart('AD_HOC')} className="border-ink/15 rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50">
            Start Ad-Hoc Review
          </button>
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}

      {!latest ? (
        <p className="text-ink/40 mt-4 text-sm">No reviews yet — start one above.</p>
      ) : (
        <div className="border-ink/10 mt-4 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <span className="text-ink text-sm font-medium">{latest.type === 'QUARTERLY' ? 'Quarterly' : 'Ad-Hoc'} Review</span>
            <span className="text-ink/40 text-xs">{formatDate(latest.reviewedAt)}</span>
          </div>

          <div className="text-ink/70 mt-3 space-y-1 text-sm">
            <p>
              {latest.summary.newResearchEvents.length} new research event(s) since last review · {latest.summary.assumptionChallenges.length} assumption challenge(s) · valuation
              (DCF Base): {formatPrice(latest.summary.valuation.dcfBase)}
            </p>
            <p>
              Evidence matrix: {latest.summary.evidenceMatrix.supportsCount} supporting · {latest.summary.evidenceMatrix.contradictsCount} contradicting ·{' '}
              {latest.summary.evidenceMatrix.neutralCount} neutral
            </p>
            <p className="text-ink/40 text-xs">{latest.summary.historicalValidation.summary}</p>
          </div>

          {latest.summary.newResearchEvents.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm">
              {latest.summary.newResearchEvents.map((e) => (
                <li key={e.id} className="text-ink/60">
                  · {e.title} ({e.materiality})
                </li>
              ))}
            </ul>
          )}

          {pending ? (
            <div className="border-ink/10 mt-4 space-y-2 border-t pt-4">
              <p className="text-ink text-sm font-medium">Confirm this review — required to complete it:</p>
              <select value={outcome} onChange={(e) => setOutcome(e.target.value as ReviewOutcomeValue)} className="border-ink/15 bg-paper text-ink w-full rounded-lg border px-2 py-2 text-sm">
                {OUTCOMES.map((o) => (
                  <option key={o} value={o}>
                    {REVIEW_OUTCOME_LABELS[o]}
                  </option>
                ))}
              </select>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Notes (optional)" className="border-ink/15 bg-paper text-ink w-full rounded-lg border px-2 py-2 text-sm" />
              <button type="button" onClick={handleConfirm} disabled={confirming} className="bg-accent rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                {confirming ? 'Confirming…' : 'Confirm Review'}
              </button>
              <p className="text-ink/30 text-xs">Confirming does not itself change the case&apos;s decision status — update that separately above if needed.</p>
            </div>
          ) : (
            <div className="border-ink/10 mt-4 border-t pt-3 text-sm">
              <span className="text-ink font-medium">Outcome: {latest.outcome ? REVIEW_OUTCOME_LABELS[latest.outcome] : '—'}</span>
              {latest.notes && <p className="text-ink/60 mt-1">{latest.notes}</p>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
