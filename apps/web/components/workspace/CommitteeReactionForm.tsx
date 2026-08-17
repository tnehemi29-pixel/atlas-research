'use client';

import { useState } from 'react';
import { addCommitteeReaction, type CommitteeReactionResponse, type CommitteeReactionTypeValue } from '@/lib/api/workspace';
import { ApiError } from '@/lib/api/companies';
import { formatUpdatedAt } from '@/lib/utils/format';

const REACTIONS: CommitteeReactionTypeValue[] = ['SUPPORT', 'CONCERN', 'QUESTION'];
const REACTION_STYLE: Record<CommitteeReactionTypeValue, string> = {
  SUPPORT: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  CONCERN: 'border-orange-300 bg-orange-50 text-orange-800',
  QUESTION: 'border-accent bg-accent-soft text-accent',
};

export function CommitteeReactionForm({ caseId, initialReactions }: { caseId: string; initialReactions: (CommitteeReactionResponse & { createdAt: string })[] }) {
  const [reactions, setReactions] = useState(initialReactions);
  const [reactionType, setReactionType] = useState<CommitteeReactionTypeValue>('QUESTION');
  const [content, setContent] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPosting(true);
    setError(null);
    try {
      const reaction = await addCommitteeReaction(caseId, reactionType, content.trim() || undefined);
      setReactions((prev) => [...prev, reaction]);
      setContent('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add the reaction.');
    } finally {
      setPosting(false);
    }
  }

  return (
    <section className="border-ink/10 mt-8 border-t pt-6">
      <h2 className="text-ink font-serif text-lg">Committee Reactions</h2>
      <p className="text-ink/40 mt-1 text-xs">Internal review signals only — never translated into an automatic investment decision.</p>

      {reactions.length === 0 ? (
        <p className="text-ink/40 mt-3 text-sm">No reactions yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {reactions.map((reaction) => (
            <li key={reaction.id} className="border-ink/10 rounded-lg border p-3 text-sm">
              <div className="flex items-center gap-2">
                <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${REACTION_STYLE[reaction.reactionType]}`}>{reaction.reactionType}</span>
                <span className="text-ink/40 text-xs">
                  {reaction.user.name ?? reaction.user.email} · {formatUpdatedAt(reaction.createdAt)}
                </span>
              </div>
              {reaction.content && <p className="text-ink mt-1">{reaction.content}</p>}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleSubmit} className="border-ink/10 mt-4 space-y-2 rounded-lg border p-3">
        <div className="flex gap-2">
          {REACTIONS.map((r) => (
            <button key={r} type="button" onClick={() => setReactionType(r)} className={`rounded-lg border px-3 py-1 text-xs font-medium ${reactionType === r ? REACTION_STYLE[r] : 'border-ink/15 text-ink/50'}`}>
              {r}
            </button>
          ))}
        </div>
        <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={2} placeholder="Optional comment…" className="border-ink/15 bg-paper text-ink w-full rounded-lg border px-2 py-1.5 text-sm" />
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={posting} className="bg-accent rounded-lg px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">
          {posting ? 'Posting…' : 'Add Reaction'}
        </button>
      </form>
    </section>
  );
}
