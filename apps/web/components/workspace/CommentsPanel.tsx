'use client';

import { useEffect, useState } from 'react';
import { createResearchComment, fetchResearchComments, type CommentParentTypeValue, type ResearchCommentResponse } from '@/lib/api/workspace';
import { ApiError } from '@/lib/api/companies';
import { formatUpdatedAt } from '@/lib/utils/format';

/** Spec section 8 — simple comments on a report, investment case, note, or
 * task. Every workspace member (including VIEWER) can comment. Deliberately
 * flat, no threads, no reactions. */
export function CommentsPanel({ workspaceId, parentType, parentId }: { workspaceId: string; parentType: CommentParentTypeValue; parentId: string }) {
  const [comments, setComments] = useState<ResearchCommentResponse[] | null>(null);
  const [content, setContent] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchResearchComments(workspaceId, parentType, parentId)
      .then((result) => {
        if (!cancelled) setComments(result);
      })
      .catch(() => {
        if (!cancelled) setComments([]);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, parentType, parentId]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!content.trim()) return;
    setPosting(true);
    setError(null);
    try {
      const comment = await createResearchComment(workspaceId, parentType, parentId, content.trim());
      setComments((prev) => [...(prev ?? []), comment]);
      setContent('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add the comment.');
    } finally {
      setPosting(false);
    }
  }

  return (
    <section className="border-ink/10 mt-6 border-t pt-4">
      <h2 className="text-ink font-serif text-lg">Comments</h2>
      {comments === null ? (
        <p className="text-ink/40 mt-2 text-sm">Loading…</p>
      ) : comments.length === 0 ? (
        <p className="text-ink/40 mt-2 text-sm">No comments yet.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {comments.map((comment) => (
            <li key={comment.id} className="border-ink/10 rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <span className="text-ink text-sm font-medium">{comment.author.name ?? comment.author.email}</span>
                <span className="text-ink/30 text-xs">{formatUpdatedAt(comment.createdAt)}</span>
              </div>
              <p className="text-ink/70 mt-1 text-sm">{comment.content}</p>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
        <input value={content} onChange={(e) => setContent(e.target.value)} placeholder="Add a comment…" className="border-ink/15 bg-paper text-ink flex-1 rounded-lg border px-3 py-2 text-sm" />
        <button type="submit" disabled={posting || !content.trim()} className="border-ink/15 rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50">
          {posting ? 'Posting…' : 'Post'}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </section>
  );
}
