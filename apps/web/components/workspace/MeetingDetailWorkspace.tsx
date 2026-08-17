'use client';

import { useState } from 'react';
import Link from 'next/link';
import { addMeetingActionItem, addMeetingDecision, type TaskPriorityValue } from '@/lib/api/workspace';
import { ApiError } from '@/lib/api/companies';
import { formatDate } from '@/lib/utils/format';

interface UserSummary {
  id: string;
  name: string | null;
  email: string;
}

export interface MeetingDetail {
  id: string;
  title: string;
  date: string;
  notes: string | null;
  decisions: string[];
  participants: { userId: string; user: UserSummary }[];
  companies: { companyId: string; company: { id: string; ticker: string; name: string } }[];
  actionItems: { id: string; description: string; assignedUserId: string | null; taskId: string | null; assignedUser: UserSummary | null; task: { id: string; status: string } | null }[];
  createdBy: UserSummary;
}

export function MeetingDetailWorkspace({ workspaceId, initialMeeting, members, canManage }: { workspaceId: string; initialMeeting: MeetingDetail; members: UserSummary[]; canManage: boolean }) {
  const [meeting, setMeeting] = useState(initialMeeting);
  const [decision, setDecision] = useState('');
  const [actionDescription, setActionDescription] = useState('');
  const [actionAssignee, setActionAssignee] = useState('');
  const [createTask, setCreateTask] = useState(true);
  const [priority, setPriority] = useState<TaskPriorityValue>('MEDIUM');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAddDecision(event: React.FormEvent) {
    event.preventDefault();
    if (!decision.trim()) return;
    setError(null);
    try {
      const updated = await addMeetingDecision(workspaceId, meeting.id, decision.trim());
      setMeeting((prev) => ({ ...prev, decisions: updated.decisions }));
      setDecision('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add the decision.');
    }
  }

  async function handleAddActionItem(event: React.FormEvent) {
    event.preventDefault();
    if (!actionDescription.trim()) return;
    setPosting(true);
    setError(null);
    try {
      const item = await addMeetingActionItem(workspaceId, meeting.id, { description: actionDescription.trim(), assignedUserId: actionAssignee || undefined, createTask, priority });
      const assignee = members.find((m) => m.id === actionAssignee) ?? null;
      setMeeting((prev) => ({ ...prev, actionItems: [...prev.actionItems, { id: item.id, description: item.description, assignedUserId: item.assignedUserId, taskId: item.taskId, assignedUser: assignee, task: item.taskId ? { id: item.taskId, status: 'TODO' } : null }] }));
      setActionDescription('');
      setActionAssignee('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add the action item.');
    } finally {
      setPosting(false);
    }
  }

  return (
    <div>
      <header className="border-ink/10 border-b pb-6">
        <h1 className="text-ink font-serif text-2xl font-semibold">{meeting.title}</h1>
        <p className="text-ink/40 mt-1 text-xs">
          {formatDate(meeting.date)} · Organized by {meeting.createdBy.name ?? meeting.createdBy.email}
          {meeting.companies.length > 0 && (
            <>
              {' · '}
              {meeting.companies.map((c, i) => (
                <span key={c.companyId}>
                  {i > 0 && ', '}
                  <Link href={`/company/${c.company.ticker}`} className="text-accent hover:underline">
                    {c.company.ticker}
                  </Link>
                </span>
              ))}
            </>
          )}
        </p>
      </header>

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      <section className="mt-6">
        <h2 className="text-ink font-serif text-lg">Decisions</h2>
        {meeting.decisions.length === 0 ? (
          <p className="text-ink/40 mt-2 text-sm">No decisions recorded yet.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {meeting.decisions.map((d, i) => (
              <li key={i} className="text-ink/70 text-sm">
                · {d}
              </li>
            ))}
          </ul>
        )}
        {canManage && (
          <form onSubmit={handleAddDecision} className="mt-2 flex gap-2">
            <input value={decision} onChange={(e) => setDecision(e.target.value)} placeholder="Record a decision…" className="border-ink/15 bg-paper text-ink flex-1 rounded-lg border px-3 py-1.5 text-sm" />
            <button type="submit" disabled={!decision.trim()} className="border-ink/15 rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50">
              Add
            </button>
          </form>
        )}
      </section>

      <section className="mt-6">
        <h2 className="text-ink font-serif text-lg">Action Items</h2>
        {meeting.actionItems.length === 0 ? (
          <p className="text-ink/40 mt-2 text-sm">No action items yet.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {meeting.actionItems.map((item) => (
              <li key={item.id} className="border-ink/10 flex items-center justify-between rounded-lg border p-2.5 text-sm">
                <div>
                  <p className="text-ink">{item.description}</p>
                  <p className="text-ink/40 mt-0.5 text-xs">{item.assignedUser ? (item.assignedUser.name ?? item.assignedUser.email) : 'Unassigned'}</p>
                </div>
                {item.taskId && (
                  <Link href={`/workspace/${workspaceId}/tasks`} className="text-accent text-xs hover:underline">
                    View task →
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}

        {canManage && (
          <form onSubmit={handleAddActionItem} className="border-ink/10 mt-3 space-y-2 rounded-lg border p-3">
            <input value={actionDescription} onChange={(e) => setActionDescription(e.target.value)} placeholder="Update DCF assumptions" className="border-ink/15 bg-paper text-ink w-full rounded-lg border px-2 py-1.5 text-sm" />
            <div className="flex flex-wrap items-center gap-2">
              <select value={actionAssignee} onChange={(e) => setActionAssignee(e.target.value)} className="border-ink/15 bg-paper text-ink rounded-lg border px-2 py-1.5 text-sm">
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name ?? m.email}
                  </option>
                ))}
              </select>
              <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriorityValue)} className="border-ink/15 bg-paper text-ink rounded-lg border px-2 py-1.5 text-sm">
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
              <label className="text-ink/60 flex items-center gap-1.5 text-xs">
                <input type="checkbox" checked={createTask} onChange={(e) => setCreateTask(e.target.checked)} />
                Auto-create research task
              </label>
              <button type="submit" disabled={posting || !actionDescription.trim()} className="border-ink/15 rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50">
                {posting ? 'Adding…' : 'Add Action Item'}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
