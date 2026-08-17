import type { Metadata } from 'next';
import { redirect, notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { getWorkspaceDetail, WorkspaceNotFoundError } from '@/lib/services/workspaceService';
import { getReviewDetail, ResearchReviewNotFoundError } from '@/lib/services/researchReviewService';
import { canApproveReport, canReviewReport } from '@/lib/workspace/permissions';
import { WorkspaceNav } from '@/components/workspace/WorkspaceNav';
import { ReviewDetailWorkspace } from '@/components/workspace/ReviewDetailWorkspace';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Review Detail · Atlas Research' };

export default async function ReviewDetailPage({ params }: { params: { id: string; reviewId: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  let workspace;
  try {
    workspace = await getWorkspaceDetail(user.id, params.id);
  } catch (error) {
    if (error instanceof WorkspaceNotFoundError) redirect('/workspace');
    throw error;
  }

  let review;
  try {
    review = await getReviewDetail(user.id, params.id, params.reviewId);
  } catch (error) {
    if (error instanceof ResearchReviewNotFoundError) notFound();
    throw error;
  }

  const serialized = {
    ...review,
    submittedAt: review.submittedAt.toISOString(),
    approvedAt: review.approvedAt?.toISOString() ?? null,
    researchReport: { ...review.researchReport, dataSnapshotAt: review.researchReport.dataSnapshotAt.toISOString() },
    checklistItems: review.checklistItems.map((item) => ({ ...item, checkedAt: item.checkedAt?.toISOString() ?? null, createdAt: item.createdAt.toISOString() })),
    sectionComments: review.sectionComments.map((c) => ({ ...c, resolvedAt: c.resolvedAt?.toISOString() ?? null, createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString() })),
  };

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <WorkspaceNav workspaceId={params.id} active="reviews" />
      <ReviewDetailWorkspace workspaceId={params.id} initialReview={serialized} canReview={canReviewReport(workspace.myRole)} canApprove={canApproveReport(workspace.myRole)} />
    </main>
  );
}
