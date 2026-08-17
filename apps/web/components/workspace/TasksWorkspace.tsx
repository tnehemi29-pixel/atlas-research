'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { createResearchTask, updateResearchTask, type TaskPriorityValue, type TaskStatusValue } from '@/lib/api/workspace';
import { ApiError } from '@/lib/api/companies';
import { TASK_PRIORITY_LABELS, TASK_PRIORITY_STYLE, TASK_STATUS_LABELS, TASK_STATUS_STYLE } from '@/lib/utils/workspaceDisplay';
import { formatDate } from '@/lib/utils/format';

const PRIORITIES: TaskPriorityValue[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const STATUSES: TaskStatusValue[] = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED'];

interface UserSummary {
  id: string;
  name: string | null;
  email: string;
}

export interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  companyId: string | null;
  projectId: string | null;
  assignedUserId: string | null;
  priority: TaskPriorityValue;
  status: TaskStatusValue;
  dueDate: string | null;
  completedAt: string | null;
  company: { id: string; ticker: string; name: string } | null;
  project: { id: string; name: string } | null;
  assignedUser: UserSummary | null;
}

export function TasksWorkspace({ workspaceId, initialTasks, members, currentUserId, canCreate }: { workspaceId: string; initialTasks: TaskRow[]; members: UserSummary[]; currentUserId: string; canCreate: boolean }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [title, setTitle] = useState('');
  const [ticker, setTicker] = useState('');
  const [priority, setPriority] = useState<TaskPriorityValue>('MEDIUM');
  const [assignedUserId, setAssignedUserId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<TaskStatusValue | 'ALL'>('ALL');

  const filtered = useMemo(() => (statusFilter === 'ALL' ? tasks : tasks.filter((t) => t.status === statusFilter)), [tasks, statusFilter]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const created = await createResearchTask(workspaceId, {
        title: title.trim(),
        ticker: ticker.trim() || undefined,
        priority,
        assignedUserId: assignedUserId || undefined,
        dueDate: dueDate || undefined,
      });
      const assignee = members.find((m) => m.id === assignedUserId) ?? null;
      setTasks((prev) => [
        { id: created.id, title: created.title, description: created.description, companyId: created.companyId, projectId: created.projectId, assignedUserId: created.assignedUserId, priority: created.priority, status: created.status, dueDate: created.dueDate, completedAt: created.completedAt, company: ticker ? { id: ticker, ticker: ticker.toUpperCase(), name: ticker.toUpperCase() } : null, project: null, assignedUser: assignee },
        ...prev,
      ]);
      setTitle('');
      setTicker('');
      setAssignedUserId('');
      setDueDate('');
      setShowForm(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create the task.');
    } finally {
      setCreating(false);
    }
  }

  async function handleStatusChange(taskId: string, status: TaskStatusValue) {
    try {
      await updateResearchTask(workspaceId, taskId, { status });
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status, completedAt: status === 'COMPLETED' ? new Date().toISOString() : null } : t)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update the task.');
    }
  }

  return (
    <div className="mt-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1">
          <button type="button" onClick={() => setStatusFilter('ALL')} className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${statusFilter === 'ALL' ? 'border-accent bg-accent-soft text-accent' : 'border-ink/15 text-ink/60'}`}>
            All
          </button>
          {STATUSES.map((s) => (
            <button key={s} type="button" onClick={() => setStatusFilter(s)} className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${statusFilter === s ? 'border-accent bg-accent-soft text-accent' : 'border-ink/15 text-ink/60'}`}>
              {TASK_STATUS_LABELS[s]}
            </button>
          ))}
        </div>
        {canCreate && (
          <button type="button" onClick={() => setShowForm((s) => !s)} className="bg-accent rounded-lg px-4 py-2 text-sm font-medium text-white">
            {showForm ? 'Cancel' : 'New Task'}
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="border-ink/10 bg-paper mb-6 grid grid-cols-1 gap-3 rounded-xl border p-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="text-ink/60 text-xs font-medium">Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Review latest 10-Q" className="border-ink/15 bg-paper text-ink mt-1 w-full rounded-lg border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-ink/60 text-xs font-medium">Ticker (optional)</label>
            <input value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} placeholder="NVDA" className="border-ink/15 bg-paper text-ink mt-1 w-full rounded-lg border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-ink/60 text-xs font-medium">Priority</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriorityValue)} className="border-ink/15 bg-paper text-ink mt-1 w-full rounded-lg border px-3 py-2 text-sm">
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {TASK_PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-ink/60 text-xs font-medium">Assignee (optional)</label>
            <select value={assignedUserId} onChange={(e) => setAssignedUserId(e.target.value)} className="border-ink/15 bg-paper text-ink mt-1 w-full rounded-lg border px-3 py-2 text-sm">
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name ?? m.email}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-ink/60 text-xs font-medium">Due date (optional)</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="border-ink/15 bg-paper text-ink mt-1 w-full rounded-lg border px-3 py-2 text-sm" />
          </div>
          {error && <p className="text-sm text-red-700 sm:col-span-2">{error}</p>}
          <button type="submit" disabled={creating || !title.trim()} className="bg-accent w-fit rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 sm:col-span-2">
            {creating ? 'Creating…' : 'Create Task'}
          </button>
        </form>
      )}

      {filtered.length === 0 ? (
        <p className="text-ink/40 mt-8 text-sm">No tasks match this filter.</p>
      ) : (
        <ul className="border-ink/10 divide-y divide-black/5 rounded-xl border">
          {filtered.map((task) => {
            const canChangeStatus = canCreate || task.assignedUserId === currentUserId;
            return (
              <li key={task.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${TASK_PRIORITY_STYLE[task.priority]}`}>{task.priority}</span>
                    {task.company && (
                      <Link href={`/company/${task.company.ticker}`} className="text-accent text-xs hover:underline">
                        {task.company.ticker}
                      </Link>
                    )}
                    <span className="text-ink text-sm font-medium">{task.title}</span>
                  </div>
                  <p className="text-ink/40 mt-0.5 text-xs">
                    {task.assignedUser ? (task.assignedUser.name ?? task.assignedUser.email) : 'Unassigned'}
                    {task.dueDate ? ` · Due ${formatDate(task.dueDate)}` : ''}
                  </p>
                </div>
                {canChangeStatus ? (
                  <select value={task.status} onChange={(e) => handleStatusChange(task.id, e.target.value as TaskStatusValue)} className="border-ink/15 bg-paper text-ink rounded-lg border px-2 py-1 text-xs">
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {TASK_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className={`rounded border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${TASK_STATUS_STYLE[task.status]}`}>{TASK_STATUS_LABELS[task.status]}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
