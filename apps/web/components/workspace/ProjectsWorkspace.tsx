'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createResearchProject, type ResearchProjectStatusValue } from '@/lib/api/workspace';
import { ApiError } from '@/lib/api/companies';
import { PROJECT_STATUS_LABELS, PROJECT_STATUS_STYLE } from '@/lib/utils/workspaceDisplay';

export interface ProjectListRow {
  id: string;
  name: string;
  description: string | null;
  status: ResearchProjectStatusValue;
  ownerUserId: string;
  owner: { id: string; name: string | null; email: string };
  createdAt: string;
  updatedAt: string;
  _count: { companies: number; reports: number; investmentCases: number; tasks: number; members: number };
}

/** Spec section 3 — Research Projects list + create form. */
export function ProjectsWorkspace({ workspaceId, initialProjects, canCreate }: { workspaceId: string; initialProjects: ProjectListRow[]; canCreate: boolean }) {
  const [projects, setProjects] = useState(initialProjects);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const created = await createResearchProject(workspaceId, { name: name.trim(), description: description.trim() || undefined });
      setProjects((prev) => [
        { id: created.id, name: created.name, description: created.description, status: created.status, ownerUserId: created.ownerUserId, owner: created.owner, createdAt: created.createdAt, updatedAt: created.updatedAt, _count: { companies: 0, reports: 0, investmentCases: 0, tasks: 0, members: 0 } },
        ...prev,
      ]);
      setName('');
      setDescription('');
      setShowForm(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create the project.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mt-6">
      {canCreate && (
        <div className="mb-4 flex justify-end">
          <button type="button" onClick={() => setShowForm((s) => !s)} className="bg-accent rounded-lg px-4 py-2 text-sm font-medium text-white">
            {showForm ? 'Cancel' : 'New Project'}
          </button>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="border-ink/10 bg-paper mb-6 space-y-3 rounded-xl border p-4">
          <div>
            <label className="text-ink/60 text-xs font-medium">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Cloud Software Sector Review" className="border-ink/15 bg-paper text-ink mt-1 w-full rounded-lg border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-ink/60 text-xs font-medium">Description (optional)</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="border-ink/15 bg-paper text-ink mt-1 w-full rounded-lg border px-3 py-2 text-sm" />
          </div>
          {error && <p className="text-sm text-red-700">{error}</p>}
          <button type="submit" disabled={creating || !name.trim()} className="bg-accent rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {creating ? 'Creating…' : 'Create Project'}
          </button>
        </form>
      )}

      {projects.length === 0 ? (
        <p className="text-ink/40 mt-8 text-sm">No research projects in this workspace yet.</p>
      ) : (
        <ul className="border-ink/10 divide-y divide-black/5 rounded-xl border">
          {projects.map((project) => (
            <li key={project.id}>
              <Link href={`/workspace/${workspaceId}/projects/${project.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-black/[0.02]">
                <div>
                  <p className="text-ink text-sm font-medium">{project.name}</p>
                  <p className="text-ink/40 mt-0.5 text-xs">
                    {project._count.companies} companies · {project._count.reports} reports · {project._count.investmentCases} cases · {project._count.tasks} tasks
                  </p>
                </div>
                <span className={`rounded border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${PROJECT_STATUS_STYLE[project.status]}`}>{PROJECT_STATUS_LABELS[project.status]}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
