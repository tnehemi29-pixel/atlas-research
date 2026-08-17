import type { Metadata } from 'next';
import { redirect, notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { getWorkspaceDetail, listWorkspaceMembers, WorkspaceNotFoundError } from '@/lib/services/workspaceService';
import { getResearchMeetingDetail, ResearchMeetingNotFoundError } from '@/lib/services/researchMeetingService';
import { canManageMeeting } from '@/lib/workspace/permissions';
import { WorkspaceNav } from '@/components/workspace/WorkspaceNav';
import { MeetingDetailWorkspace } from '@/components/workspace/MeetingDetailWorkspace';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Research Meeting · Atlas Research' };

export default async function MeetingDetailPage({ params }: { params: { id: string; meetingId: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  let workspace;
  try {
    workspace = await getWorkspaceDetail(user.id, params.id);
  } catch (error) {
    if (error instanceof WorkspaceNotFoundError) redirect('/workspace');
    throw error;
  }

  let meeting;
  try {
    meeting = await getResearchMeetingDetail(user.id, params.id, params.meetingId);
  } catch (error) {
    if (error instanceof ResearchMeetingNotFoundError) notFound();
    throw error;
  }

  const members = await listWorkspaceMembers(user.id, params.id);

  const serialized = {
    ...meeting,
    date: meeting.date.toISOString(),
    createdAt: meeting.createdAt.toISOString(),
    updatedAt: meeting.updatedAt.toISOString(),
    actionItems: meeting.actionItems.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
  };

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <WorkspaceNav workspaceId={params.id} active="meetings" />
      <MeetingDetailWorkspace
        workspaceId={params.id}
        initialMeeting={serialized}
        members={members.map((m) => ({ id: m.user.id, name: m.user.name, email: m.user.email }))}
        canManage={canManageMeeting(workspace.myRole)}
      />
    </main>
  );
}
