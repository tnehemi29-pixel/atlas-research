import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { createWorkspace, addWorkspaceMember, WorkspaceForbiddenError } from './workspaceService';
import {
  addSectionComment,
  approveReview,
  claimReview,
  getReviewDetail,
  InvalidReviewActionError,
  resolveSectionComment,
  ResearchReviewNotFoundError,
  setChecklistItemChecked,
  submitReportForReview,
} from './researchReviewService';

const TEST_EMAIL = 'zz-review-service-test@example.com';
const TICKER = 'ZZREV1';

async function makeUser(suffix: string) {
  const passwordHash = await hashPassword('irrelevant');
  return db.user.create({ data: { email: `${suffix}-${TEST_EMAIL}`, passwordHash } });
}

async function makeReport(reviewStatus: 'DRAFT' | 'IN_REVIEW' | 'APPROVED' = 'DRAFT', status: 'SUCCESS' | 'FAILED' = 'SUCCESS') {
  const company = await db.company.upsert({ where: { ticker: TICKER }, create: { ticker: TICKER, name: 'Review Test Co.' }, update: {} });
  return db.researchReport.create({
    data: { companyId: company.id, version: Math.floor(Math.random() * 1_000_000) + 1, status, reviewStatus, model: 'fixture', dataSnapshotAt: new Date(), content: { context: {}, report: null } },
  });
}

async function cleanup() {
  await db.workspace.deleteMany({ where: { createdBy: { email: { contains: TEST_EMAIL } } } });
  await db.user.deleteMany({ where: { email: { contains: TEST_EMAIL } } });
  const company = await db.company.findUnique({ where: { ticker: TICKER } });
  if (company) await db.researchReport.deleteMany({ where: { companyId: company.id } });
  await db.company.deleteMany({ where: { ticker: TICKER } });
}

describe('researchReviewService', () => {
  beforeAll(cleanup);
  afterAll(cleanup);
  afterEach(cleanup);

  it('submits a DRAFT report for review, seeding all ten checklist items unchecked', async () => {
    const owner = await makeUser('submit-owner');
    const workspace = await createWorkspace(owner.id, { name: 'Submit Test WS' });
    const report = await makeReport();

    const review = await submitReportForReview(owner.id, workspace.id, report.id);
    const updatedReport = await db.researchReport.findUniqueOrThrow({ where: { id: report.id } });
    expect(updatedReport.reviewStatus).toBe('IN_REVIEW');

    const detail = await getReviewDetail(owner.id, workspace.id, review.id);
    expect(detail.checklistItems).toHaveLength(10);
    expect(detail.checklistItems.every((item) => !item.checked)).toBe(true);
  });

  it('a VIEWER cannot submit a report for review', async () => {
    const owner = await makeUser('viewer-owner');
    const viewer = await makeUser('viewer-viewer');
    const workspace = await createWorkspace(owner.id, { name: 'Viewer Submit Test' });
    await addWorkspaceMember(owner.id, workspace.id, { email: viewer.email, role: 'VIEWER' });
    const report = await makeReport();
    await expect(submitReportForReview(viewer.id, workspace.id, report.id)).rejects.toThrow(WorkspaceForbiddenError);
  });

  it('rejects submitting a FAILED-generation report', async () => {
    const owner = await makeUser('failed-owner');
    const workspace = await createWorkspace(owner.id, { name: 'Failed Report Test' });
    const report = await makeReport('DRAFT', 'FAILED');
    await expect(submitReportForReview(owner.id, workspace.id, report.id)).rejects.toThrow(InvalidReviewActionError);
  });

  it('rejects re-submitting a report that is already IN_REVIEW or APPROVED', async () => {
    const owner = await makeUser('resubmit-owner');
    const workspace = await createWorkspace(owner.id, { name: 'Resubmit Test' });
    const inReview = await makeReport('IN_REVIEW');
    const approved = await makeReport('APPROVED');
    await expect(submitReportForReview(owner.id, workspace.id, inReview.id)).rejects.toThrow(InvalidReviewActionError);
    await expect(submitReportForReview(owner.id, workspace.id, approved.id)).rejects.toThrow(InvalidReviewActionError);
  });

  it('a review id from another workspace 404s', async () => {
    const ownerA = await makeUser('cross-a');
    const ownerB = await makeUser('cross-b');
    const workspaceA = await createWorkspace(ownerA.id, { name: 'Cross A' });
    const workspaceB = await createWorkspace(ownerB.id, { name: 'Cross B' });
    const report = await makeReport();
    const review = await submitReportForReview(ownerA.id, workspaceA.id, report.id);
    await expect(getReviewDetail(ownerB.id, workspaceB.id, review.id)).rejects.toThrow(ResearchReviewNotFoundError);
  });

  it('claimReview sets the reviewer once, and a second reviewer cannot steal it', async () => {
    const owner = await makeUser('claim-owner');
    const reviewerA = await makeUser('claim-a');
    const reviewerB = await makeUser('claim-b');
    const workspace = await createWorkspace(owner.id, { name: 'Claim Test' });
    await addWorkspaceMember(owner.id, workspace.id, { email: reviewerA.email, role: 'ANALYST' });
    await addWorkspaceMember(owner.id, workspace.id, { email: reviewerB.email, role: 'ANALYST' });
    const report = await makeReport();
    const review = await submitReportForReview(owner.id, workspace.id, report.id);

    const claimed = await claimReview(reviewerA.id, workspace.id, review.id);
    expect(claimed.reviewerUserId).toBe(reviewerA.id);
    await expect(claimReview(reviewerB.id, workspace.id, review.id)).rejects.toThrow(InvalidReviewActionError);
  });

  it('full workflow: check every item, resolve every comment, then approve - ANALYST cannot approve, ADMIN can', async () => {
    const owner = await makeUser('flow-owner');
    const analyst = await makeUser('flow-analyst');
    const workspace = await createWorkspace(owner.id, { name: 'Full Flow Test' });
    await addWorkspaceMember(owner.id, workspace.id, { email: analyst.email, role: 'ANALYST' });
    const report = await makeReport();
    const review = await submitReportForReview(analyst.id, workspace.id, report.id);

    const comment = await addSectionComment(owner.id, workspace.id, review.id, { section: 'DCF', content: 'Please explain why terminal growth is 3.0%.' });

    // Cannot approve yet: checklist incomplete AND an open comment exists.
    await expect(approveReview(owner.id, workspace.id, review.id)).rejects.toThrow(InvalidReviewActionError);

    const detail = await getReviewDetail(owner.id, workspace.id, review.id);
    for (const item of detail.checklistItems) {
      await setChecklistItemChecked(owner.id, workspace.id, review.id, item.id, true);
    }

    // Checklist complete but the comment is still open.
    await expect(approveReview(owner.id, workspace.id, review.id)).rejects.toThrow(InvalidReviewActionError);

    await resolveSectionComment(analyst.id, workspace.id, review.id, comment.id);
    const resolved = await db.reviewSectionComment.findUniqueOrThrow({ where: { id: comment.id } });
    expect(resolved.status).toBe('RESOLVED');
    expect(resolved.content).toBe('Please explain why terminal growth is 3.0%.'); // never edited/deleted

    // An ANALYST cannot approve.
    await expect(approveReview(analyst.id, workspace.id, review.id)).rejects.toThrow(WorkspaceForbiddenError);

    const approved = await approveReview(owner.id, workspace.id, review.id);
    expect(approved.approvedByUserId).toBe(owner.id);

    const finalReport = await db.researchReport.findUniqueOrThrow({ where: { id: report.id } });
    expect(finalReport.reviewStatus).toBe('APPROVED');
  });
});
