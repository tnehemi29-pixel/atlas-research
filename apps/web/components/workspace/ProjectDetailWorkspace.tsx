'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  addResearchProjectCompany,
  addResearchProjectMember,
  removeResearchProjectCompany,
  removeResearchProjectMember,
  updateResearchProject,
  type ReportReviewStatusValue,
  type ResearchProjectStatusValue,
  type TaskPriorityValue,
  type TaskStatusValue,
} from '@/lib/api/workspace';
import { ApiError } from '@/lib/api/companies';
import { PROJECT_STATUS_LABELS, PROJECT_STATUS_STYLE, REVIEW_STATUS_LABELS, REVIEW_STATUS_STYLE, TASK_PRIORITY_STYLE, TASK_STATUS_STYLE } from '@/lib/utils/workspaceDisplay';

const STATUSES: ResearchProjectStatusValue[] = ['PLANNED', 'ACTIVE', 'UNDER_REVIEW', 'COMPLETED', 'ARCHIVED'];

interface UserSummary {
  id: string;
  name: string | null;
  email: string;
}

export interface ProjectDetail {
  id: string;
  name: string;
  description: string | null;
  status: ResearchProjectStatusValue;
  ownerUserId: string;
  owner: UserSummary;
  createdAt: string;
  updatedAt: string;
  members: { userId: string; user: UserSummary }[];
  companies: { companyId: string; company: { id: string; ticker: string; name: string; sector: string | null } }[];
  reports: { id: string; version: number; reviewStatus: ReportReviewStatusValue; companyId: string; createdAt: string }[];
  investmentCases: { id: string; status: string; companyId: string; userId: string; createdAt: string }[];
  tasks: { id: string; title: string; status: TaskStatusValue; priority: TaskPriorityValue; dueDate: string | null }[];
  _count: { notes: number };
}

export function ProjectDetailWorkspace({
  workspaceId,
  initialProject,
  workspaceMembers,
  canManage,
}: {
  workspaceId: string;
  initialProject: ProjectDetail;
  workspaceMembers: UserSummary[];
  canManage: boolean;
}) {
  const [project, setProject] = useState(initialProject);
  const [ticker, setTicker] = useState('');
  const [addingCompany, setAddingCompany] = useState(false);
  const [memberToAdd, setMemberToAdd] = useState(workspaceMembers[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);

  const nonMembers = workspaceMembers.filter((m) => !project.members.some((pm) => pm.userId === m.id));

  async function handleStatusChange(status: ResearchProjectStatusValue) {
    setError(null);
    try {
      await updateResearchProject(workspaceId, project.id, { status });
      setProject((prev) => ({ ...prev, status }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update status.');
    }
  }

  async function handleAddCompany(event: React.FormEvent) {
    event.preventDefault();
    if (!ticker.trim()) return;
    setAddingCompany(true);
    setError(null);
    try {
      await addResearchProjectCompany(workspaceId, project.id, ticker.trim().toUpperCase());
      setProject((prev) => ({ ...prev, companies: [...prev.companies, { companyId: ticker.trim().toUpperCase(), company: { id: ticker.trim().toUpperCase(), ticker: ticker.trim().toUpperCase(), name: ticker.trim().toUpperCase(), sector: null } }] }));
      setTicker('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add the company.');
    } finally {
      setAddingCompany(false);
    }
  }

  async function handleRemoveCompany(companyId: string) {
    try {
      await removeResearchProjectCompany(workspaceId, project.id, companyId);
      setProject((prev) => ({ ...prev, companies: prev.companies.filter((c) => c.companyId !== companyId) }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove the company.');
    }
  }

  async function handleAddMember() {
    if (!memberToAdd) return;
    try {
      await addResearchProjectMember(workspaceId, project.id, memberToAdd);
      const user = workspaceMembers.find((m) => m.id === memberToAdd);
      if (user) setProject((prev) => ({ ...prev, members: [...prev.members, { userId: user.id, user }] }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add the member.');
    }
  }

  async function handleRemoveMember(userId: string) {
    try {
      await removeResearchProjectMember(workspaceId, project.id, userId);
      setProject((prev) => ({ ...prev, members: prev.members.filter((m) => m.userId !== userId) }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove the member.');
    }
  }

  return (
    <div>
      <header className="border-ink/10 flex items-start justify-between gap-4 border-b pb-6">
        <div>
          <h1 className="text-ink font-serif text-2xl font-semibold">{project.name}</h1>
          {project.description && <p className="text-ink/60 mt-1 text-sm">{project.description}</p>}
          <p className="text-ink/40 mt-1 text-xs">Owner: {project.owner.name ?? project.owner.email}</p>
        </div>
        {canManage ? (
          <select value={project.status} onChange={(e) => handleStatusChange(e.target.value as ResearchProjectStatusValue)} className="border-ink/15 bg-paper text-ink rounded-lg border px-2 py-1.5 text-sm">
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {PROJECT_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        ) : (
          <span className={`rounded border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${PROJECT_STATUS_STYLE[project.status]}`}>{PROJECT_STATUS_LABELS[project.status]}</span>
        )}
      </header>

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <section>
          <h2 className="text-ink font-serif text-lg">Companies</h2>
          {canManage && (
            <form onSubmit={handleAddCompany} className="mt-2 flex gap-2">
              <input value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} placeholder="Ticker" className="border-ink/15 bg-paper text-ink w-28 rounded-lg border px-2 py-1.5 text-sm" />
              <button type="submit" disabled={addingCompany || !ticker.trim()} className="border-ink/15 rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50">
                {addingCompany ? 'Adding…' : 'Add'}
              </button>
            </form>
          )}
          <ul className="mt-2 space-y-1">
            {project.companies.map((c) => (
              <li key={c.companyId} className="flex items-center justify-between text-sm">
                <Link href={`/company/${c.company.ticker}`} className="text-accent hover:underline">
                  {c.company.ticker} · {c.company.name}
                </Link>
                {canManage && (
                  <button type="button" onClick={() => handleRemoveCompany(c.companyId)} className="text-ink/30 hover:text-ink/60 text-xs">
                    Remove
                  </button>
                )}
              </li>
            ))}
            {project.companies.length === 0 && <p className="text-ink/40 text-sm">No companies linked yet.</p>}
          </ul>
        </section>

        <section>
          <h2 className="text-ink font-serif text-lg">Members</h2>
          {canManage && nonMembers.length > 0 && (
            <div className="mt-2 flex gap-2">
              <select value={memberToAdd} onChange={(e) => setMemberToAdd(e.target.value)} className="border-ink/15 bg-paper text-ink flex-1 rounded-lg border px-2 py-1.5 text-sm">
                {nonMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name ?? m.email}
                  </option>
                ))}
              </select>
              <button type="button" onClick={handleAddMember} className="border-ink/15 rounded-lg border px-3 py-1.5 text-xs font-medium">
                Add
              </button>
            </div>
          )}
          <ul className="mt-2 space-y-1">
            {project.members.map((m) => (
              <li key={m.userId} className="flex items-center justify-between text-sm">
                <span className="text-ink/70">{m.user.name ?? m.user.email}</span>
                {canManage && (
                  <button type="button" onClick={() => handleRemoveMember(m.userId)} className="text-ink/30 hover:text-ink/60 text-xs">
                    Remove
                  </button>
                )}
              </li>
            ))}
            {project.members.length === 0 && <p className="text-ink/40 text-sm">No project-specific members yet.</p>}
          </ul>
        </section>
      </div>

      <section className="mt-6">
        <h2 className="text-ink font-serif text-lg">Reports</h2>
        {project.reports.length === 0 ? (
          <p className="text-ink/40 mt-1 text-sm">No reports linked to this project.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {project.reports.map((r) => (
              <li key={r.id} className="flex items-center gap-2 text-sm">
                <span className="text-ink/70">v{r.version}</span>
                <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${REVIEW_STATUS_STYLE[r.reviewStatus]}`}>{REVIEW_STATUS_LABELS[r.reviewStatus]}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6">
        <h2 className="text-ink font-serif text-lg">Tasks</h2>
        {project.tasks.length === 0 ? (
          <p className="text-ink/40 mt-1 text-sm">No tasks linked to this project.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {project.tasks.map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-sm">
                <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${TASK_PRIORITY_STYLE[t.priority]}`}>{t.priority}</span>
                <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${TASK_STATUS_STYLE[t.status]}`}>{t.status}</span>
                <span className="text-ink/70">{t.title}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6">
        <h2 className="text-ink font-serif text-lg">Investment Cases</h2>
        <p className="text-ink/40 mt-1 text-sm">{project.investmentCases.length} case(s) linked — private to each case&apos;s own owner unless submitted for committee review.</p>
      </section>
    </div>
  );
}
