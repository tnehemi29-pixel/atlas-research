'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createWorkspace, type WorkspaceRoleValue } from '@/lib/api/workspace';
import { ApiError } from '@/lib/api/companies';
import { ROLE_LABELS, ROLE_STYLE } from '@/lib/utils/workspaceDisplay';

export interface WorkspacePickerRow {
  id: string;
  name: string;
  slug: string;
  role: WorkspaceRoleValue;
  createdAt: string;
}

/** Spec section 1 — a workspace represents a research environment ("Atlas
 * Investment Research"). This page lists every workspace the user belongs
 * to and lets them create a new one; it never auto-redirects into a single
 * workspace, since a user can legitimately belong to more than one. */
export function WorkspacePicker({ initialWorkspaces }: { initialWorkspaces: WorkspacePickerRow[] }) {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState(initialWorkspaces);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(workspaces.length === 0);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const workspace = await createWorkspace(name.trim());
      router.push(`/workspace/${workspace.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create the workspace.');
      setCreating(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-ink font-serif text-2xl font-semibold">Research Workspaces</h1>
          <p className="text-ink/50 mt-2 max-w-xl text-sm">
            A workspace organizes your team&apos;s companies, research reports, investment cases, tasks, notes, and reviews into a coherent research workflow.{' '}
            <Link href="/workspace/methodology" className="text-accent hover:underline">
              How this works
            </Link>
            .
          </p>
        </div>
        <button type="button" onClick={() => setShowForm((s) => !s)} className="bg-accent shrink-0 rounded-lg px-4 py-2 text-sm font-medium text-white">
          {showForm ? 'Cancel' : 'New Workspace'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="border-ink/10 bg-paper mt-6 space-y-3 rounded-xl border p-4">
          <div>
            <label className="text-ink/60 text-xs font-medium">Workspace name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Atlas Investment Research" className="border-ink/15 bg-paper text-ink mt-1 w-full rounded-lg border px-3 py-2 text-sm" />
          </div>
          {error && <p className="text-sm text-red-700">{error}</p>}
          <button type="submit" disabled={creating || !name.trim()} className="bg-accent rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {creating ? 'Creating…' : 'Create Workspace'}
          </button>
        </form>
      )}

      {workspaces.length === 0 ? (
        !showForm && <p className="text-ink/40 mt-8 text-sm">You&apos;re not a member of any workspace yet.</p>
      ) : (
        <ul className="border-ink/10 mt-6 divide-y divide-black/5 rounded-xl border">
          {workspaces.map((w) => (
            <li key={w.id}>
              <Link href={`/workspace/${w.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-black/[0.02]">
                <span className="text-ink text-sm font-medium">{w.name}</span>
                <span className={`rounded border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${ROLE_STYLE[w.role]}`}>{ROLE_LABELS[w.role]}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
