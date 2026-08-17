import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { getWorkspaceDetail, listWorkspaceMembers, WorkspaceNotFoundError } from '@/lib/services/workspaceService';
import { listResearchMeetings } from '@/lib/services/researchMeetingService';
import { canManageMeeting } from '@/lib/workspace/permissions';
import { WorkspaceNav } from '@/components/workspace/WorkspaceNav';
import { MeetingsWorkspace } from '@/components/workspace/MeetingsWorkspace';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Research Meetings · Atlas Research' };

/** Spec section 21 — Research Meetings. */
export default async function MeetingsPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  let workspace;
  try {
    workspace = await getWorkspaceDetail(user.id, params.id);
  } catch (error) {
    if (error instanceof WorkspaceNotFoundError) redirect('/workspace');
    throw error;
  }

  const [meetings, members] = await Promise.all([listResearchMeetings(user.id, params.id), listWorkspaceMembers(user.id, params.id)]);
  const serialized = meetings.map((m) => ({ ...m, date: m.date.toISOString(), createdAt: m.createdAt.toISOString(), updatedAt: m.updatedAt.toISOString() }));

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <WorkspaceNav workspaceId={params.id} active="meetings" />
      <header className="border-ink/10 border-b pb-6">
        <h1 className="text-ink font-serif text-2xl font-semibold">Research Meetings</h1>
      </header>
      <MeetingsWorkspace workspaceId={params.id} initialMeetings={serialized} members={members.map((m) => ({ id: m.user.id, name: m.user.name, email: m.user.email }))} canCreate={canManageMeeting(workspace.myRole)} />
    </main>
  );
}
