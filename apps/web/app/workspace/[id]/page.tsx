import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { getWorkspaceDetail } from '@/lib/services/workspaceService';
import { getWorkspaceDashboard } from '@/lib/services/workspaceDashboardService';
import { WorkspaceNotFoundError } from '@/lib/services/workspaceService';
import { WorkspaceNav } from '@/components/workspace/WorkspaceNav';
import { WorkspaceDashboard } from '@/components/workspace/WorkspaceDashboard';

export const dynamic = 'force-dynamic';

interface WorkspacePageProps {
  params: { id: string };
}

export async function generateMetadata({ params: _params }: WorkspacePageProps): Promise<Metadata> {
  return { title: 'Research Workspace · Atlas Research' };
}

/** Spec section 14 — the workspace dashboard, the default landing page for
 * a single workspace. */
export default async function WorkspaceDashboardPage({ params }: WorkspacePageProps) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  let workspace;
  try {
    workspace = await getWorkspaceDetail(user.id, params.id);
  } catch (error) {
    if (error instanceof WorkspaceNotFoundError) redirect('/workspace');
    throw error;
  }

  const dashboard = await getWorkspaceDashboard(user.id, params.id);

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <WorkspaceNav workspaceId={params.id} active="dashboard" />
      <header className="border-ink/10 border-b pb-6">
        <h1 className="text-ink font-serif text-2xl font-semibold">{workspace.name}</h1>
        <p className="text-ink/40 mt-1 text-sm">Your role: {workspace.myRole}</p>
      </header>
      <WorkspaceDashboard workspaceId={params.id} initialDashboard={dashboard} />
    </main>
  );
}
