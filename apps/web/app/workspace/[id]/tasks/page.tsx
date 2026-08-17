import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { getWorkspaceDetail, listWorkspaceMembers, WorkspaceNotFoundError } from '@/lib/services/workspaceService';
import { listResearchTasks } from '@/lib/services/researchTaskService';
import { canCreateOrEditResearch } from '@/lib/workspace/permissions';
import { WorkspaceNav } from '@/components/workspace/WorkspaceNav';
import { TasksWorkspace } from '@/components/workspace/TasksWorkspace';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Research Tasks · Atlas Research' };

/** Spec section 5 — Research Tasks. */
export default async function TasksPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  let workspace;
  try {
    workspace = await getWorkspaceDetail(user.id, params.id);
  } catch (error) {
    if (error instanceof WorkspaceNotFoundError) redirect('/workspace');
    throw error;
  }

  const [tasks, members] = await Promise.all([listResearchTasks(user.id, params.id), listWorkspaceMembers(user.id, params.id)]);
  const serialized = tasks.map((t) => ({ ...t, dueDate: t.dueDate?.toISOString() ?? null, completedAt: t.completedAt?.toISOString() ?? null, createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString() }));

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <WorkspaceNav workspaceId={params.id} active="tasks" />
      <header className="border-ink/10 border-b pb-6">
        <h1 className="text-ink font-serif text-2xl font-semibold">Research Tasks</h1>
      </header>
      <TasksWorkspace
        workspaceId={params.id}
        initialTasks={serialized}
        members={members.map((m) => ({ id: m.user.id, name: m.user.name, email: m.user.email }))}
        currentUserId={user.id}
        canCreate={canCreateOrEditResearch(workspace.myRole)}
      />
    </main>
  );
}
