'use client';

import { useState } from 'react';
import Link from 'next/link';
import { fetchReportList, type ResearchReportResponse } from '@/lib/api/reports';
import { submitReportForReview, type ReportReviewStatusValue } from '@/lib/api/workspace';
import { ApiError } from '@/lib/api/companies';
import { REVIEW_STATUS_LABELS, REVIEW_STATUS_STYLE } from '@/lib/utils/workspaceDisplay';
import { formatUpdatedAt } from '@/lib/utils/format';

interface UserSummary {
  id: string;
  name: string | null;
  email: string;
}

export interface ReviewRow {
  id: string;
  researchReportId: string;
  reviewerUserId: string | null;
  approvedAt: string | null;
  submittedAt: string;
  researchReport: { id: string; version: number; reviewStatus: ReportReviewStatusValue; company: { ticker: string; name: string } };
  requestedBy: UserSummary;
  reviewer: UserSummary | null;
}

export function ReviewsWorkspace({ workspaceId, initialReviews, canSubmit }: { workspaceId: string; initialReviews: ReviewRow[]; canSubmit: boolean }) {
  const [reviews, setReviews] = useState(initialReviews);
  const [ticker, setTicker] = useState('');
  const [candidates, setCandidates] = useState<ResearchReportResponse[] | null>(null);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleLoadReports(event: React.FormEvent) {
    event.preventDefault();
    if (!ticker.trim()) return;
    setLoadingCandidates(true);
    setError(null);
    try {
      const reports = await fetchReportList(ticker.trim().toUpperCase());
      setCandidates(reports);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load reports for that ticker.');
    } finally {
      setLoadingCandidates(false);
    }
  }

  async function handleSubmit(reportId: string) {
    setSubmittingId(reportId);
    setError(null);
    try {
      const review = await submitReportForReview(workspaceId, reportId);
      const candidate = candidates?.find((r) => r.id === reportId);
      if (candidate) {
        setReviews((prev) => [
          { id: review.id, researchReportId: reportId, reviewerUserId: null, approvedAt: null, submittedAt: review.submittedAt, researchReport: { id: reportId, version: candidate.version, reviewStatus: 'IN_REVIEW', company: { ticker: ticker.toUpperCase(), name: ticker.toUpperCase() } }, requestedBy: { id: '', name: 'You', email: '' }, reviewer: null },
          ...prev,
        ]);
      }
      setCandidates((prev) => prev?.filter((r) => r.id !== reportId) ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to submit the report for review.');
    } finally {
      setSubmittingId(null);
    }
  }

  return (
    <div className="mt-6 space-y-8">
      {canSubmit && (
        <section className="border-ink/10 bg-paper rounded-xl border p-4">
          <h2 className="text-ink font-serif text-lg">Submit a Report for Review</h2>
          <form onSubmit={handleLoadReports} className="mt-2 flex gap-2">
            <input value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} placeholder="Ticker (e.g. NVDA)" className="border-ink/15 bg-paper text-ink w-40 rounded-lg border px-3 py-2 text-sm" />
            <button type="submit" disabled={loadingCandidates || !ticker.trim()} className="border-ink/15 rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50">
              {loadingCandidates ? 'Loading…' : 'Load Reports'}
            </button>
          </form>
          {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
          {candidates && (
            <ul className="mt-3 space-y-2">
              {candidates.filter((r) => r.status === 'SUCCESS').length === 0 && <p className="text-ink/40 text-sm">No successfully generated reports for that ticker.</p>}
              {candidates
                .filter((r) => r.status === 'SUCCESS')
                .map((r) => (
                  <li key={r.id} className="flex items-center justify-between text-sm">
                    <span className="text-ink/70">Version {r.version}</span>
                    <button type="button" onClick={() => handleSubmit(r.id)} disabled={submittingId === r.id} className="bg-accent rounded-lg px-3 py-1 text-xs font-medium text-white disabled:opacity-50">
                      {submittingId === r.id ? 'Submitting…' : 'Submit for Review'}
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </section>
      )}

      <section>
        <h2 className="text-ink font-serif text-lg">Reviews</h2>
        {reviews.length === 0 ? (
          <p className="text-ink/40 mt-2 text-sm">No reports have been submitted for review in this workspace yet.</p>
        ) : (
          <ul className="border-ink/10 mt-2 divide-y divide-black/5 rounded-xl border">
            {reviews.map((review) => (
              <li key={review.id}>
                <Link href={`/workspace/${workspaceId}/reviews/${review.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-black/[0.02]">
                  <div>
                    <span className="text-accent text-sm font-medium">{review.researchReport.company.ticker}</span>
                    <span className="text-ink/70 ml-2 text-sm">v{review.researchReport.version}</span>
                    <p className="text-ink/40 mt-0.5 text-xs">
                      Requested by {review.requestedBy.name ?? (review.requestedBy.email || 'you')} · {formatUpdatedAt(review.submittedAt)}
                    </p>
                  </div>
                  <span className={`rounded border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${REVIEW_STATUS_STYLE[review.researchReport.reviewStatus]}`}>{REVIEW_STATUS_LABELS[review.researchReport.reviewStatus]}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
