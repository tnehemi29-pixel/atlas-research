import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { getWorkspaceDetail, WorkspaceNotFoundError } from '@/lib/services/workspaceService';
import { listResearchProjects } from '@/lib/services/researchProjectService';
import { canManageProject } from '@/lib/workspace/permissions';
import { WorkspaceNav } from '@/components/workspace/WorkspaceNav';
import { ProjectsWorkspace } from '@/components/workspace/ProjectsWorkspace';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Research Projects · Atlas Research' };

/** Spec section 3 — Research Projects. */
export default async function ProjectsPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  let workspace;
  try {
    workspace = await getWorkspaceDetail(user.id, params.id);
  } catch (error) {
    if (error instanceof WorkspaceNotFoundError) redirect('/workspace');
    throw error;
  }

  const projects = await listResearchProjects(user.id, params.id);
  const serialized = projects.map((p) => ({ ...p, createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString() }));

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <WorkspaceNav workspaceId={params.id} active="projects" />
      <header className="border-ink/10 border-b pb-6">
        <h1 className="text-ink font-serif text-2xl font-semibold">Research Projects</h1>
      </header>
      <ProjectsWorkspace workspaceId={params.id} initialProjects={serialized} canCreate={canManageProject(workspace.myRole)} />
    </main>
  );
}
