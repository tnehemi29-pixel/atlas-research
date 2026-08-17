'use client';

import { useState } from 'react';
import Link from 'next/link';
import { addReviewSectionComment, approveReview, resolveReviewSectionComment, setChecklistItemChecked, type ReportReviewStatusValue, type ReviewChecklistItemResponse, type ReviewSectionCommentResponse } from '@/lib/api/workspace';
import { ApiError } from '@/lib/api/companies';
import { REVIEW_STATUS_LABELS, REVIEW_STATUS_STYLE } from '@/lib/utils/workspaceDisplay';
import { formatUpdatedAt } from '@/lib/utils/format';

interface UserSummary {
  id: string;
  name: string | null;
  email: string;
}

export interface ReviewDetail {
  id: string;
  approvedAt: string | null;
  submittedAt: string;
  researchReport: { id: string; companyId: string; version: number; reviewStatus: ReportReviewStatusValue; dataSnapshotAt: string; company: { ticker: string; name: string } };
  requestedBy: UserSummary;
  reviewer: UserSummary | null;
  approvedBy: UserSummary | null;
  checklistItems: ReviewChecklistItemResponse[];
  sectionComments: ReviewSectionCommentResponse[];
}

export function ReviewDetailWorkspace({ workspaceId, initialReview, canReview, canApprove }: { workspaceId: string; initialReview: ReviewDetail; canReview: boolean; canApprove: boolean }) {
  const [review, setReview] = useState(initialReview);
  const [section, setSection] = useState('');
  const [content, setContent] = useState('');
  const [posting, setPosting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allChecked = review.checklistItems.every((item) => item.checked);
  const openComments = review.sectionComments.filter((c) => c.status === 'OPEN');
  const canApproveNow = canApprove && !review.approvedAt && allChecked && openComments.length === 0;

  async function handleToggle(itemId: string, checked: boolean) {
    setError(null);
    try {
      const updated = await setChecklistItemChecked(workspaceId, review.id, itemId, checked);
      setReview((prev) => ({ ...prev, checklistItems: prev.checklistItems.map((item) => (item.id === itemId ? { ...item, checked: updated.checked, checkedAt: updated.checkedAt } : item)) }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update the checklist item.');
    }
  }

  async function handleAddComment(event: React.FormEvent) {
    event.preventDefault();
    if (!section.trim() || !content.trim()) return;
    setPosting(true);
    setError(null);
    try {
      const comment = await addReviewSectionComment(workspaceId, review.id, section.trim(), content.trim());
      setReview((prev) => ({ ...prev, sectionComments: [...prev.sectionComments, comment] }));
      setSection('');
      setContent('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add the comment.');
    } finally {
      setPosting(false);
    }
  }

  async function handleResolve(commentId: string) {
    setError(null);
    try {
      const updated = await resolveReviewSectionComment(workspaceId, review.id, commentId);
      setReview((prev) => ({ ...prev, sectionComments: prev.sectionComments.map((c) => (c.id === commentId ? updated : c)) }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to resolve the comment.');
    }
  }

  async function handleApprove() {
    setApproving(true);
    setError(null);
    try {
      const updated = await approveReview(workspaceId, review.id);
      setReview((prev) => ({ ...prev, approvedAt: updated.approvedAt, researchReport: { ...prev.researchReport, reviewStatus: 'APPROVED' } }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to approve the review.');
    } finally {
      setApproving(false);
    }
  }

  return (
    <div>
      <header className="border-ink/10 flex items-start justify-between gap-4 border-b pb-6">
        <div>
          <Link href={`/company/${review.researchReport.company.ticker}/report`} className="text-accent text-sm font-medium hover:underline">
            {review.researchReport.company.ticker} report v{review.researchReport.version} →
          </Link>
          <h1 className="text-ink font-serif text-2xl font-semibold">Review</h1>
          <p className="text-ink/40 mt-1 text-xs">
            Requested by {review.requestedBy.name ?? review.requestedBy.email} · {formatUpdatedAt(review.submittedAt)}
            {review.reviewer && ` · Reviewer: ${review.reviewer.name ?? review.reviewer.email}`}
          </p>
        </div>
        <span className={`rounded border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${REVIEW_STATUS_STYLE[review.researchReport.reviewStatus]}`}>{REVIEW_STATUS_LABELS[review.researchReport.reviewStatus]}</span>
      </header>

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      <section className="mt-6">
        <h2 className="text-ink font-serif text-lg">Review Checklist</h2>
        <p className="text-ink/40 mt-1 text-xs">Every item must be checked, and every comment resolved, before this report can be approved.</p>
        <ul className="mt-2 space-y-1.5">
          {review.checklistItems.map((item) => (
            <li key={item.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={item.checked} disabled={!canReview || !!review.approvedAt} onChange={(e) => handleToggle(item.id, e.target.checked)} className="h-4 w-4" />
              <span className={item.checked ? 'text-ink/50 line-through' : 'text-ink'}>{item.label}</span>
              {item.label === 'Research integrity status reviewed' && (
                <Link href={`/company/${review.researchReport.company.ticker}`} className="text-accent text-xs hover:underline">
                  (view panel)
                </Link>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6">
        <h2 className="text-ink font-serif text-lg">Section Comments</h2>
        {review.sectionComments.length === 0 ? (
          <p className="text-ink/40 mt-2 text-sm">No section comments yet.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {review.sectionComments.map((comment) => (
              <li key={comment.id} className="border-ink/10 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-ink/40 bg-black/5 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">{comment.section}</span>
                    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${comment.status === 'OPEN' ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-emerald-300 bg-emerald-50 text-emerald-800'}`}>{comment.status}</span>
                  </div>
                  {comment.status === 'OPEN' && canReview && !review.approvedAt && (
                    <button type="button" onClick={() => handleResolve(comment.id)} className="border-ink/15 rounded-lg border px-2 py-0.5 text-xs font-medium">
                      Resolve
                    </button>
                  )}
                </div>
                <p className="text-ink mt-1.5 text-sm">{comment.content}</p>
                <p className="text-ink/30 mt-1 text-xs">
                  {comment.author.name ?? comment.author.email} · {formatUpdatedAt(comment.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}

        {canReview && !review.approvedAt && (
          <form onSubmit={handleAddComment} className="border-ink/10 mt-3 space-y-2 rounded-lg border p-3">
            <div className="flex gap-2">
              <input value={section} onChange={(e) => setSection(e.target.value)} placeholder="Section (e.g. DCF)" className="border-ink/15 bg-paper text-ink w-40 rounded-lg border px-2 py-1.5 text-sm" />
            </div>
            <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={2} placeholder="Please explain why terminal growth is 3.0%." className="border-ink/15 bg-paper text-ink w-full rounded-lg border px-2 py-1.5 text-sm" />
            <button type="submit" disabled={posting || !section.trim() || !content.trim()} className="border-ink/15 rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50">
              {posting ? 'Posting…' : 'Add Comment'}
            </button>
          </form>
        )}
      </section>

      {canApprove && !review.approvedAt && (
        <div className="border-ink/10 mt-6 border-t pt-4">
          <button type="button" onClick={handleApprove} disabled={!canApproveNow || approving} className="bg-accent rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {approving ? 'Approving…' : 'Approve Report'}
          </button>
          {!canApproveNow && <p className="text-ink/40 mt-2 text-xs">Every checklist item must be checked and every comment resolved before approving.</p>}
        </div>
      )}

      {review.approvedAt && review.approvedBy && (
        <p className="border-ink/10 mt-6 border-t pt-4 text-sm text-emerald-800">
          Approved by {review.approvedBy.name ?? review.approvedBy.email} on {formatUpdatedAt(review.approvedAt)}.
        </p>
      )}
    </div>
  );
}
