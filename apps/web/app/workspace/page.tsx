import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { listUserWorkspaces } from '@/lib/services/workspaceService';
import { WorkspacePicker } from '@/components/workspace/WorkspacePicker';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Research Workspaces · Atlas Research' };

export default async function WorkspacesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const workspaces = await listUserWorkspaces(user.id);
  const serialized = workspaces.map((w) => ({ id: w.id, name: w.name, slug: w.slug, role: w.role, createdAt: w.createdAt.toISOString() }));

  return <WorkspacePicker initialWorkspaces={serialized} />;
}
