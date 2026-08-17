import type { CommentParentType, ResearchComment } from '@prisma/client';
import { db } from '@/lib/db';
import { requireWorkspaceMember } from '@/lib/services/workspaceService';
import { writeAuditLogEntry } from '@/lib/services/auditLogService';

/**
 * Milestone 15 spec section 8 — deliberately simple comments on a report,
 * investment case, note, or task. No threads, no reactions, no chat. Every
 * workspace member (including VIEWER) may comment — spec section 2 never
 * excludes VIEWER from commenting, only from editing/approving/managing.
 *
 * parentType/parentId are a loose, service-validated pointer (mirrors
 * NoteSource and Milestone 14's ResearchClaim.claimSourceType/Id) — existence
 * AND visibility are checked here before a comment can ever be created.
 * ResearchReport is global (any existing report is a valid parent).
 * ResearchNote/ResearchTask must belong to THIS workspace. InvestmentCase is
 * private (Milestone 13) — a comment on one is only allowed if the
 * commenter owns it or it has been submitted to committee review (spec
 * section 20), the one deliberate, narrow visibility exception.
 */

export class InvalidResearchCommentInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidResearchCommentInputError';
  }
}

export class ResearchCommentNotFoundError extends Error {
  constructor(message = 'Research comment not found.') {
    super(message);
    this.name = 'ResearchCommentNotFoundError';
  }
}

async function assertParentVisible(workspaceId: string, actorUserId: string, parentType: CommentParentType, parentId: string): Promise<void> {
  switch (parentType) {
    case 'RESEARCH_REPORT': {
      const report = await db.researchReport.findUnique({ where: { id: parentId } });
      if (!report) throw new InvalidResearchCommentInputError('That research report does not exist.');
      return;
    }
    case 'RESEARCH_NOTE': {
      const note = await db.researchNote.findUnique({ where: { id: parentId } });
      if (!note || note.workspaceId !== workspaceId) throw new InvalidResearchCommentInputError('That research note does not exist in this workspace.');
      return;
    }
    case 'RESEARCH_TASK': {
      const task = await db.researchTask.findUnique({ where: { id: parentId } });
      if (!task || task.workspaceId !== workspaceId) throw new InvalidResearchCommentInputError('That research task does not exist in this workspace.');
      return;
    }
    case 'INVESTMENT_CASE': {
      const investmentCase = await db.investmentCase.findUnique({ where: { id: parentId } });
      if (!investmentCase) throw new InvalidResearchCommentInputError('That investment case does not exist.');
      const visible = investmentCase.userId === actorUserId || investmentCase.committeeReviewStatus === 'SUBMITTED';
      if (!visible) throw new InvalidResearchCommentInputError('That investment case has not been submitted for committee review.');
      return;
    }
  }
}

export interface CreateResearchCommentInput {
  parentType: CommentParentType;
  parentId: string;
  content: string;
}

export async function createResearchComment(userId: string, workspaceId: string, input: CreateResearchCommentInput): Promise<ResearchComment> {
  await requireWorkspaceMember(userId, workspaceId);

  const content = input.content.trim();
  if (content.length === 0) throw new InvalidResearchCommentInputError('Comment content cannot be empty.');

  await assertParentVisible(workspaceId, userId, input.parentType, input.parentId);

  const comment = await db.researchComment.create({
    data: { workspaceId, authorId: userId, parentType: input.parentType, parentId: input.parentId, content },
  });

  await writeAuditLogEntry({ workspaceId, entityType: 'ResearchComment', entityId: comment.id, action: 'COMMENT_ADDED', actorUserId: userId, detail: { parentType: input.parentType, parentId: input.parentId } });
  return comment;
}

export async function listResearchComments(userId: string, workspaceId: string, parentType: CommentParentType, parentId: string) {
  await requireWorkspaceMember(userId, workspaceId);
  return db.researchComment.findMany({
    where: { workspaceId, parentType, parentId },
    include: { author: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: 'asc' },
  });
}
