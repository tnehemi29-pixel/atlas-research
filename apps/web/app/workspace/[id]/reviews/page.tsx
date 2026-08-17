import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { getWorkspaceDetail, WorkspaceNotFoundError } from '@/lib/services/workspaceService';
import { listWorkspaceReviews } from '@/lib/services/researchReviewService';
import { canReviewReport } from '@/lib/workspace/permissions';
import { WorkspaceNav } from '@/components/workspace/WorkspaceNav';
import { ReviewsWorkspace } from '@/components/workspace/ReviewsWorkspace';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Research Reviews · Atlas Research' };

/** Spec sections 9-11 — the research-review workflow. */
export default async function ReviewsPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  let workspace;
  try {
    workspace = await getWorkspaceDetail(user.id, params.id);
  } catch (error) {
    if (error instanceof WorkspaceNotFoundError) redirect('/workspace');
    throw error;
  }

  const reviews = await listWorkspaceReviews(user.id, params.id);
  const serialized = reviews.map((r) => ({
    ...r,
    submittedAt: r.submittedAt.toISOString(),
    approvedAt: r.approvedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <WorkspaceNav workspaceId={params.id} active="reviews" />
      <header className="border-ink/10 border-b pb-6">
        <h1 className="text-ink font-serif text-2xl font-semibold">Research Reviews</h1>
        <p className="text-ink/50 mt-2 text-sm">Draft -&gt; Submit for review -&gt; Reviewer examines &amp; comments -&gt; Analyst revises -&gt; Reviewer approves.</p>
      </header>
      <ReviewsWorkspace workspaceId={params.id} initialReviews={serialized} canSubmit={canReviewReport(workspace.myRole)} />
    </main>
  );
}
