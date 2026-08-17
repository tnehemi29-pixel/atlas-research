import type { ResearchReview } from '@prisma/client';
import { db } from '@/lib/db';
import { requireWorkspaceMember, requireWorkspaceRole } from '@/lib/services/workspaceService';
import { writeAuditLogEntry } from '@/lib/services/auditLogService';
import { canApproveReport, canReviewReport } from '@/lib/workspace/permissions';
import { isChecklistComplete, REVIEW_CHECKLIST_TEMPLATE } from '@/lib/workspace/reviewChecklist';

/**
 * Milestone 15 spec sections 9-11 — the formal research-review workflow:
 * Analyst creates report -> Submit for review -> Reviewer examines -> leaves
 * comments -> Analyst revises -> Reviewer approves -> Report becomes
 * APPROVED. `ResearchReport.reviewStatus` is the report's own current stage;
 * a `ResearchReview` row is one review CYCLE's audit trail (never
 * overwritten — a report can accumulate several over its lifetime).
 */

export class ResearchReviewNotFoundError extends Error {
  constructor(message = 'Research review not found.') {
    super(message);
    this.name = 'ResearchReviewNotFoundError';
  }
}

export class InvalidReviewActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidReviewActionError';
  }
}

export async function getOwnedWorkspaceReview(workspaceId: string, reviewId: string): Promise<ResearchReview> {
  const review = await db.researchReview.findUnique({ where: { id: reviewId } });
  if (!review || review.workspaceId !== workspaceId) throw new ResearchReviewNotFoundError();
  return review;
}

/** Only a DRAFT report can be submitted — a report that failed generation
 * (status: FAILED) or is already IN_REVIEW/APPROVED cannot be resubmitted
 * through this path. Seeds the ten-item checklist verbatim (spec section
 * 10), every item starting unchecked. */
export async function submitReportForReview(userId: string, workspaceId: string, reportId: string): Promise<ResearchReview> {
  await requireWorkspaceRole(userId, workspaceId, canReviewReport, 'You do not have permission to submit research for review in this workspace.');

  const report = await db.researchReport.findUnique({ where: { id: reportId } });
  if (!report) throw new InvalidReviewActionError('That research report does not exist.');
  if (report.status !== 'SUCCESS') throw new InvalidReviewActionError('Only a successfully generated report can be submitted for review.');
  if (report.reviewStatus !== 'DRAFT') throw new InvalidReviewActionError(`This report is already ${report.reviewStatus.toLowerCase().replace('_', ' ')} and cannot be resubmitted.`);

  const review = await db.researchReview.create({
    data: {
      workspaceId,
      researchReportId: report.id,
      requestedByUserId: userId,
      checklistItems: { create: REVIEW_CHECKLIST_TEMPLATE.map((label) => ({ label })) },
    },
  });
  await db.researchReport.update({ where: { id: report.id }, data: { reviewStatus: 'IN_REVIEW' } });

  await writeAuditLogEntry({ workspaceId, companyId: report.companyId, entityType: 'ResearchReview', entityId: review.id, action: 'REPORT_SUBMITTED_FOR_REVIEW', actorUserId: userId, detail: { reportId: report.id, reportVersion: report.version } });
  return review;
}

/** First reviewer to act claims the review — a lightweight substitute for a
 * separate assignment step; a review with no reviewer yet is simply
 * unclaimed, not blocked. */
export async function claimReview(userId: string, workspaceId: string, reviewId: string): Promise<ResearchReview> {
  await requireWorkspaceRole(userId, workspaceId, canReviewReport, 'You do not have permission to review research in this workspace.');
  const review = await getOwnedWorkspaceReview(workspaceId, reviewId);
  if (review.reviewerUserId && review.reviewerUserId !== userId) throw new InvalidReviewActionError('This review has already been claimed by another reviewer.');
  if (review.reviewerUserId === userId) return review;
  return db.researchReview.update({ where: { id: review.id }, data: { reviewerUserId: userId } });
}

export async function getReviewDetail(userId: string, workspaceId: string, reviewId: string) {
  await requireWorkspaceMember(userId, workspaceId);
  const review = await getOwnedWorkspaceReview(workspaceId, reviewId);
  return db.researchReview.findUniqueOrThrow({
    where: { id: review.id },
    include: {
      researchReport: { select: { id: true, companyId: true, version: true, reviewStatus: true, dataSnapshotAt: true, company: { select: { ticker: true, name: true } } } },
      requestedBy: { select: { id: true, name: true, email: true } },
      reviewer: { select: { id: true, name: true, email: true } },
      approvedBy: { select: { id: true, name: true, email: true } },
      checklistItems: { orderBy: { createdAt: 'asc' } },
      sectionComments: { include: { author: { select: { id: true, name: true, email: true } }, resolvedBy: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: 'asc' } },
    },
  });
}

export async function listReviewsForReport(userId: string, workspaceId: string, reportId: string) {
  await requireWorkspaceMember(userId, workspaceId);
  return db.researchReview.findMany({ where: { workspaceId, researchReportId: reportId }, orderBy: { submittedAt: 'desc' } });
}

export interface ListWorkspaceReviewsFilters {
  pendingOnly?: boolean;
}

export async function listWorkspaceReviews(userId: string, workspaceId: string, filters: ListWorkspaceReviewsFilters = {}) {
  await requireWorkspaceMember(userId, workspaceId);
  return db.researchReview.findMany({
    where: { workspaceId, approvedAt: filters.pendingOnly ? null : undefined },
    include: {
      researchReport: { select: { id: true, version: true, reviewStatus: true, company: { select: { ticker: true, name: true } } } },
      requestedBy: { select: { id: true, name: true, email: true } },
      reviewer: { select: { id: true, name: true, email: true } },
    },
    orderBy: { submittedAt: 'desc' },
  });
}

export async function setChecklistItemChecked(userId: string, workspaceId: string, reviewId: string, itemId: string, checked: boolean) {
  await requireWorkspaceRole(userId, workspaceId, canReviewReport, 'You do not have permission to review research in this workspace.');
  const review = await getOwnedWorkspaceReview(workspaceId, reviewId);

  const item = await db.reviewChecklistItem.findUnique({ where: { id: itemId } });
  if (!item || item.reviewId !== review.id) throw new InvalidReviewActionError('That checklist item does not belong to this review.');

  return db.reviewChecklistItem.update({
    where: { id: item.id },
    data: { checked, checkedByUserId: checked ? userId : null, checkedAt: checked ? new Date() : null },
  });
}

export interface AddSectionCommentInput {
  section: string;
  content: string;
}

export async function addSectionComment(userId: string, workspaceId: string, reviewId: string, input: AddSectionCommentInput) {
  await requireWorkspaceRole(userId, workspaceId, canReviewReport, 'You do not have permission to review research in this workspace.');
  const review = await getOwnedWorkspaceReview(workspaceId, reviewId);

  const section = input.section.trim();
  const content = input.content.trim();
  if (section.length === 0) throw new InvalidReviewActionError('A section comment must name the section it applies to.');
  if (content.length === 0) throw new InvalidReviewActionError('A section comment cannot be empty.');

  const comment = await db.reviewSectionComment.create({ data: { reviewId: review.id, section, authorId: userId, content } });
  await writeAuditLogEntry({ workspaceId, entityType: 'ReviewSectionComment', entityId: comment.id, action: 'REVIEW_COMMENT_ADDED', actorUserId: userId, detail: { reviewId: review.id, section } });
  return comment;
}

/** Never deletes a comment — only flips OPEN -> RESOLVED, keeping the
 * review's audit trail complete (spec section 11). */
export async function resolveSectionComment(userId: string, workspaceId: string, reviewId: string, commentId: string) {
  await requireWorkspaceRole(userId, workspaceId, canReviewReport, 'You do not have permission to review research in this workspace.');
  const review = await getOwnedWorkspaceReview(workspaceId, reviewId);

  const comment = await db.reviewSectionComment.findUnique({ where: { id: commentId } });
  if (!comment || comment.reviewId !== review.id) throw new InvalidReviewActionError('That comment does not belong to this review.');
  if (comment.status === 'RESOLVED') return comment;

  return db.reviewSectionComment.update({ where: { id: comment.id }, data: { status: 'RESOLVED', resolvedByUserId: userId, resolvedAt: new Date() } });
}

/** OWNER/ADMIN only (spec section 9: "only authorized users can approve
 * research"). Requires every checklist item checked (spec section 10:
 * "before approval, verify..."). */
export async function approveReview(userId: string, workspaceId: string, reviewId: string): Promise<ResearchReview> {
  await requireWorkspaceRole(userId, workspaceId, canApproveReport, 'You do not have permission to approve research in this workspace.');
  const review = await getOwnedWorkspaceReview(workspaceId, reviewId);
  if (review.approvedAt) throw new InvalidReviewActionError('This review has already been approved.');

  const items = await db.reviewChecklistItem.findMany({ where: { reviewId: review.id } });
  if (!isChecklistComplete(items)) throw new InvalidReviewActionError('Every checklist item must be checked before this report can be approved.');

  const openComments = await db.reviewSectionComment.count({ where: { reviewId: review.id, status: 'OPEN' } });
  if (openComments > 0) throw new InvalidReviewActionError('Every section comment must be resolved before this report can be approved.');

  const updated = await db.researchReview.update({ where: { id: review.id }, data: { approvedByUserId: userId, approvedAt: new Date() } });
  const report = await db.researchReport.update({ where: { id: review.researchReportId }, data: { reviewStatus: 'APPROVED' } });

  await writeAuditLogEntry({ workspaceId, companyId: report.companyId, entityType: 'ResearchReview', entityId: review.id, action: 'REPORT_APPROVED', actorUserId: userId, detail: { reportId: report.id, reportVersion: report.version } });
  return updated;
}

/** OWNER/ADMIN only — moves an already-approved report to ARCHIVED. */
export async function archiveReport(userId: string, workspaceId: string, reportId: string): Promise<void> {
  await requireWorkspaceRole(userId, workspaceId, canApproveReport, 'You do not have permission to archive research in this workspace.');
  const report = await db.researchReport.findUnique({ where: { id: reportId } });
  if (!report) throw new InvalidReviewActionError('That research report does not exist.');
  if (report.reviewStatus !== 'APPROVED') throw new InvalidReviewActionError('Only an approved report can be archived.');
  await db.researchReport.update({ where: { id: report.id }, data: { reviewStatus: 'ARCHIVED' } });
}
