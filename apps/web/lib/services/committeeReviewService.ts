import type { CommitteeReactionType, CommitteeReviewReaction } from '@prisma/client';
import { db } from '@/lib/db';
import { getOwnedInvestmentCase, InvestmentCaseNotFoundError } from '@/lib/services/investmentCaseService';
import { requireWorkspaceMember } from '@/lib/services/workspaceService';
import { writeAuditLogEntry } from '@/lib/services/auditLogService';

/**
 * Milestone 15 spec section 20 — Investment Committee Review. InvestmentCase
 * stays PRIVATE, per-user data exactly as Milestone 13 designed it; this is
 * the one narrow, explicit, OWNER-INITIATED exception. Submitting requires
 * the case be linked to a workspace project (`projectId`), which is how
 * "which workspace's peers can see this" gets decided — a case with no
 * project has no committee to submit to. Reactions are internal review
 * signals ONLY: there is deliberately no "decision" field anywhere on this
 * model or InvestmentCase, so a reaction can never be aggregated into an
 * automatic recommendation.
 */

export class CommitteeReviewNotAvailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommitteeReviewNotAvailableError';
  }
}

async function resolveProjectWorkspace(projectId: string | null): Promise<string> {
  if (!projectId) throw new CommitteeReviewNotAvailableError('This investment case must be linked to a research project before it can be submitted for committee review.');
  const project = await db.researchProject.findUnique({ where: { id: projectId } });
  if (!project) throw new CommitteeReviewNotAvailableError('The linked research project no longer exists.');
  return project.workspaceId;
}

/** Owner-only — matches every other Milestone 13 case-mutation function's
 * ownership discipline via getOwnedInvestmentCase. */
export async function submitCaseToCommitteeReview(userId: string, caseId: string) {
  const investmentCase = await getOwnedInvestmentCase(userId, caseId);
  const workspaceId = await resolveProjectWorkspace(investmentCase.projectId);

  const updated = await db.investmentCase.update({
    where: { id: investmentCase.id },
    data: { committeeReviewStatus: 'SUBMITTED', committeeSubmittedAt: new Date() },
  });

  await writeAuditLogEntry({ workspaceId, companyId: investmentCase.companyId, entityType: 'InvestmentCase', entityId: investmentCase.id, action: 'CASE_SUBMITTED_TO_COMMITTEE', actorUserId: userId });
  return updated;
}

/** Visible to the case owner OR any member of the linked project's
 * workspace, but ONLY once submitted — a not-yet-submitted case stays as
 * invisible to workspace peers as any other InvestmentCase. */
async function assertCommitteeVisible(userId: string, caseId: string) {
  const investmentCase = await db.investmentCase.findUnique({ where: { id: caseId } });
  if (!investmentCase) throw new InvestmentCaseNotFoundError();
  if (investmentCase.userId === userId) return investmentCase;

  if (investmentCase.committeeReviewStatus !== 'SUBMITTED') throw new InvestmentCaseNotFoundError();
  const workspaceId = await resolveProjectWorkspace(investmentCase.projectId);
  await requireWorkspaceMember(userId, workspaceId);
  return investmentCase;
}

export async function getCommitteeReviewDetail(userId: string, caseId: string) {
  const investmentCase = await assertCommitteeVisible(userId, caseId);
  return db.investmentCase.findUniqueOrThrow({
    where: { id: investmentCase.id },
    include: {
      company: true,
      assumptions: true,
      evidence: true,
      risks: true,
      catalysts: true,
      invalidationCriteria: true,
      committeeReactions: { include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: 'asc' } },
    },
  });
}

export interface AddCommitteeReactionInput {
  reactionType: CommitteeReactionType;
  content?: string;
}

export async function addCommitteeReaction(userId: string, caseId: string, input: AddCommitteeReactionInput): Promise<CommitteeReviewReaction> {
  const investmentCase = await assertCommitteeVisible(userId, caseId);
  if (investmentCase.committeeReviewStatus !== 'SUBMITTED') {
    throw new CommitteeReviewNotAvailableError('This investment case is not currently submitted for committee review.');
  }

  const workspaceId = await resolveProjectWorkspace(investmentCase.projectId);
  const reaction = await db.committeeReviewReaction.create({
    data: { investmentCaseId: investmentCase.id, userId, reactionType: input.reactionType, content: input.content?.trim() || null },
  });

  await writeAuditLogEntry({ workspaceId, companyId: investmentCase.companyId, entityType: 'CommitteeReviewReaction', entityId: reaction.id, action: 'COMMITTEE_REACTION_ADDED', actorUserId: userId, detail: { reactionType: input.reactionType } });
  return reaction;
}

/** The workspace's committee-review queue — every case from any member
 * currently submitted for review under a project in this workspace. */
export async function listCommitteeSubmissions(userId: string, workspaceId: string) {
  await requireWorkspaceMember(userId, workspaceId);
  return db.investmentCase.findMany({
    where: { committeeReviewStatus: 'SUBMITTED', project: { workspaceId } },
    include: {
      company: { select: { id: true, ticker: true, name: true } },
      user: { select: { id: true, name: true, email: true } },
      _count: { select: { committeeReactions: true } },
    },
    orderBy: { committeeSubmittedAt: 'desc' },
  });
}
