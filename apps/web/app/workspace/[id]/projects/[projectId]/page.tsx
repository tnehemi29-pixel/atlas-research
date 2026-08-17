import type { Metadata } from 'next';
import { redirect, notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { getWorkspaceDetail, listWorkspaceMembers, WorkspaceNotFoundError } from '@/lib/services/workspaceService';
import { getResearchProjectDetail, ResearchProjectNotFoundError } from '@/lib/services/researchProjectService';
import { canManageProject } from '@/lib/workspace/permissions';
import { WorkspaceNav } from '@/components/workspace/WorkspaceNav';
import { ProjectDetailWorkspace } from '@/components/workspace/ProjectDetailWorkspace';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Research Project · Atlas Research' };

export default async function ProjectDetailPage({ params }: { params: { id: string; projectId: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  let workspace;
  try {
    workspace = await getWorkspaceDetail(user.id, params.id);
  } catch (error) {
    if (error instanceof WorkspaceNotFoundError) redirect('/workspace');
    throw error;
  }

  let project;
  try {
    project = await getResearchProjectDetail(user.id, params.id, params.projectId);
  } catch (error) {
    if (error instanceof ResearchProjectNotFoundError) notFound();
    throw error;
  }

  const members = await listWorkspaceMembers(user.id, params.id);

  const serialized = {
    ...project,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    reports: project.reports.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    investmentCases: project.investmentCases.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })),
    tasks: project.tasks.map((t) => ({ ...t, dueDate: t.dueDate?.toISOString() ?? null })),
  };

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <WorkspaceNav workspaceId={params.id} active="projects" />
      <ProjectDetailWorkspace
        workspaceId={params.id}
        initialProject={serialized}
        workspaceMembers={members.map((m) => ({ id: m.user.id, name: m.user.name, email: m.user.email }))}
        canManage={canManageProject(workspace.myRole)}
      />
    </main>
  );
}
