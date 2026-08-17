'use client';

import { useEffect, useState } from 'react';
import { fetchCommitteeReviewDetail, submitCaseToCommitteeReview, type CommitteeReviewDetailResponse } from '@/lib/api/workspace';
import { ApiError } from '@/lib/api/companies';
import { formatUpdatedAt } from '@/lib/utils/format';

/** Milestone 15 spec section 20 — Investment Committee Review, embedded on
 * the case's own detail page for its owner. Loads client-side, independent
 * of the page's own server render, the same way ThesisMonitorPanel does —
 * committee status is optional metadata layered on top of the case, never a
 * gate on viewing the case itself. */
export function CommitteeReviewPanel({ caseId }: { caseId: string }) {
  const [detail, setDetail] = useState<CommitteeReviewDetailResponse | null | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchCommitteeReviewDetail(caseId)
      .then((result) => {
        if (!cancelled) setDetail(result);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      });
    return () => {
      cancelled = true;
    };
  }, [caseId]);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await submitCaseToCommitteeReview(caseId);
      const refreshed = await fetchCommitteeReviewDetail(caseId);
      setDetail(refreshed);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to submit for committee review. Link this case to a workspace research project first.');
    } finally {
      setSubmitting(false);
    }
  }

  if (detail === undefined) {
    return (
      <section className="border-ink/10 bg-paper mt-8 rounded-xl border p-4 print:hidden">
        <h2 className="text-ink font-serif text-lg font-medium">Investment Committee Review</h2>
        <p className="text-ink/40 mt-2 text-sm">Loading…</p>
      </section>
    );
  }
  if (!detail) return null;

  return (
    <section className="border-ink/10 bg-paper mt-8 rounded-xl border p-4 print:hidden">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-ink font-serif text-lg font-medium">Investment Committee Review</h2>
        {detail.committeeReviewStatus === 'SUBMITTED' ? (
          <span className="rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-emerald-800">Submitted</span>
        ) : (
          <button type="button" onClick={handleSubmit} disabled={submitting} className="bg-accent rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
            {submitting ? 'Submitting…' : 'Submit for Committee Review'}
          </button>
        )}
      </div>
      <p className="text-ink/50 mt-2 text-sm">
        {detail.committeeReviewStatus === 'SUBMITTED'
          ? 'Workspace peers can now view this case (read-only) and leave Support/Concern/Question reactions — these are internal review signals only, never an automatic recommendation.'
          : 'Submitting makes this one case visible (read-only) to your workspace peers, who can leave reactions. The case must be linked to a research project first.'}
      </p>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}

      {detail.committeeReactions.length > 0 && (
        <ul className="mt-3 space-y-2">
          {detail.committeeReactions.map((reaction) => (
            <li key={reaction.id} className="border-ink/10 rounded-lg border p-2.5 text-sm">
              <div className="flex items-center gap-2">
                <span
                  className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    reaction.reactionType === 'SUPPORT' ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : reaction.reactionType === 'CONCERN' ? 'border-orange-300 bg-orange-50 text-orange-800' : 'border-accent bg-accent-soft text-accent'
                  }`}
                >
                  {reaction.reactionType}
                </span>
                <span className="text-ink/60 text-xs">
                  {reaction.user.name ?? reaction.user.email} · {formatUpdatedAt(reaction.createdAt)}
                </span>
              </div>
              {reaction.content && <p className="text-ink mt-1">{reaction.content}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
