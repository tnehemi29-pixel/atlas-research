import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { getWorkspaceDetail, WorkspaceNotFoundError } from '@/lib/services/workspaceService';
import { listResearchNotes } from '@/lib/services/researchNoteService';
import { canCreateOrEditResearch } from '@/lib/workspace/permissions';
import { WorkspaceNav } from '@/components/workspace/WorkspaceNav';
import { NotesWorkspace } from '@/components/workspace/NotesWorkspace';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Research Notes · Atlas Research' };

/** Spec sections 6-7 — Research Notes. */
export default async function NotesPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  let workspace;
  try {
    workspace = await getWorkspaceDetail(user.id, params.id);
  } catch (error) {
    if (error instanceof WorkspaceNotFoundError) redirect('/workspace');
    throw error;
  }

  const notes = await listResearchNotes(user.id, params.id);
  const serialized = notes.map((n) => ({ ...n, createdAt: n.createdAt.toISOString(), updatedAt: n.updatedAt.toISOString() }));

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <WorkspaceNav workspaceId={params.id} active="notes" />
      <header className="border-ink/10 border-b pb-6">
        <h1 className="text-ink font-serif text-2xl font-semibold">Research Notes</h1>
      </header>
      <NotesWorkspace workspaceId={params.id} initialNotes={serialized} canCreate={canCreateOrEditResearch(workspace.myRole)} />
    </main>
  );
}
