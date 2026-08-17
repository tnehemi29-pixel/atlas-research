import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { getWorkspaceDetail, listWorkspaceMembers, WorkspaceNotFoundError } from '@/lib/services/workspaceService';
import { canManageMembers } from '@/lib/workspace/permissions';
import { WorkspaceNav } from '@/components/workspace/WorkspaceNav';
import { MembersWorkspace } from '@/components/workspace/MembersWorkspace';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Workspace Members · Atlas Research' };

/** Spec section 2 — user roles and member management. */
export default async function MembersPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  let workspace;
  try {
    workspace = await getWorkspaceDetail(user.id, params.id);
  } catch (error) {
    if (error instanceof WorkspaceNotFoundError) redirect('/workspace');
    throw error;
  }

  const members = await listWorkspaceMembers(user.id, params.id);
  const serialized = members.map((m) => ({ userId: m.userId, role: m.role, joinedAt: m.joinedAt.toISOString(), user: m.user }));

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <WorkspaceNav workspaceId={params.id} active="members" />
      <header className="border-ink/10 border-b pb-6">
        <h1 className="text-ink font-serif text-2xl font-semibold">Members</h1>
      </header>
      <MembersWorkspace workspaceId={params.id} initialMembers={serialized} currentUserId={user.id} canManage={canManageMembers(workspace.myRole)} />
    </main>
  );
}
