'use client';

import { useState } from 'react';
import { acknowledgeIntegrityIssue, ignoreIntegrityIssue, resolveIntegrityIssue, type IntegrityIssueResponse } from '@/lib/api/integrity';
import { ApiError } from '@/lib/api/companies';
import { ISSUE_SEVERITY_STYLE } from '@/lib/utils/integrityDisplay';
import { formatUpdatedAt } from '@/lib/utils/format';

type Action = 'resolve' | 'ignore' | null;

/** One open/acknowledged issue with its acknowledge/resolve/ignore actions.
 * Resolving and ignoring both require a non-empty explanation (spec section
 * 21 — "require a reason when an issue is ignored"), entered inline rather
 * than via window.prompt, matching this codebase's existing action-form
 * convention (see ReviewWorkflowPanel). Financial/model/contradiction/thesis
 * issues are never auto-resolved server-side (spec section 22) — these
 * buttons are always an explicit human action. */
export function IntegrityIssueRow({ issue, onChanged }: { issue: IntegrityIssueResponse; onChanged: () => Promise<void> }) {
  const [pendingAction, setPendingAction] = useState<Action>(null);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAcknowledge() {
    setSubmitting(true);
    setError(null);
    try {
      await acknowledgeIntegrityIssue(issue.id);
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to acknowledge the issue.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit() {
    if (text.trim().length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      if (pendingAction === 'resolve') await resolveIntegrityIssue(issue.id, text.trim());
      else if (pendingAction === 'ignore') await ignoreIntegrityIssue(issue.id, text.trim());
      setPendingAction(null);
      setText('');
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Failed to ${pendingAction} the issue.`);
    } finally {
      setSubmitting(false);
    }
  }

  const isOpenOrAcked = issue.status === 'OPEN' || issue.status === 'ACKNOWLEDGED';

  return (
    <li className="border-ink/10 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${ISSUE_SEVERITY_STYLE[issue.severity]}`}>{issue.severity}</span>
        <span className="text-ink/40 bg-black/5 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">{issue.status}</span>
        <span className="text-ink/40 text-xs">{formatUpdatedAt(issue.detectedAt)}</span>
      </div>
      <p className="text-ink mt-1.5 text-sm">{issue.description}</p>
      <p className="text-ink/40 mt-0.5 text-xs">Source: {issue.source}</p>

      {issue.status === 'RESOLVED' && issue.resolution && <p className="text-ink/60 mt-1.5 text-xs">Resolved: {issue.resolution}</p>}
      {issue.status === 'IGNORED' && issue.ignoreReason && <p className="text-ink/60 mt-1.5 text-xs">Ignored: {issue.ignoreReason}</p>}

      {isOpenOrAcked && (
        <div className="mt-2">
          {pendingAction ? (
            <div className="space-y-1.5">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={2}
                placeholder={pendingAction === 'resolve' ? 'Describe how this was resolved…' : 'Reason for ignoring this issue…'}
                className="border-ink/15 bg-paper text-ink w-full rounded-lg border px-2 py-1.5 text-sm"
              />
              <div className="flex gap-2">
                <button type="button" onClick={handleSubmit} disabled={submitting || text.trim().length === 0} className="bg-accent rounded-lg px-3 py-1 text-xs font-medium text-white disabled:opacity-50">
                  {submitting ? 'Submitting…' : pendingAction === 'resolve' ? 'Confirm Resolve' : 'Confirm Ignore'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPendingAction(null);
                    setText('');
                  }}
                  disabled={submitting}
                  className="border-ink/15 rounded-lg border px-3 py-1 text-xs font-medium disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {issue.status === 'OPEN' && (
                <button type="button" onClick={handleAcknowledge} disabled={submitting} className="border-ink/15 rounded-lg border px-3 py-1 text-xs font-medium disabled:opacity-50">
                  Acknowledge
                </button>
              )}
              <button type="button" onClick={() => setPendingAction('resolve')} className="border-ink/15 rounded-lg border px-3 py-1 text-xs font-medium">
                Resolve…
              </button>
              <button type="button" onClick={() => setPendingAction('ignore')} className="border-ink/15 rounded-lg border px-3 py-1 text-xs font-medium">
                Ignore…
              </button>
            </div>
          )}
        </div>
      )}
      {error && <p className="mt-1.5 text-xs text-red-700">{error}</p>}
    </li>
  );
}
