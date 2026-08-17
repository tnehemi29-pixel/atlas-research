import { NextResponse } from 'next/server';
import { WorkspaceForbiddenError, WorkspaceMemberNotFoundError, WorkspaceNotFoundError, InvalidWorkspaceInputError } from '@/lib/services/workspaceService';
import { ResearchProjectNotFoundError, InvalidResearchProjectInputError } from '@/lib/services/researchProjectService';
import { InvalidCompanyCoverageInputError } from '@/lib/services/companyCoverageService';
import { ResearchTaskNotFoundError, InvalidResearchTaskInputError } from '@/lib/services/researchTaskService';
import { ResearchNoteNotFoundError, InvalidResearchNoteInputError } from '@/lib/services/researchNoteService';
import { InvalidResearchCommentInputError, ResearchCommentNotFoundError } from '@/lib/services/researchCommentService';
import { ResearchReviewNotFoundError, InvalidReviewActionError } from '@/lib/services/researchReviewService';
import { ResearchMeetingNotFoundError, InvalidResearchMeetingInputError } from '@/lib/services/researchMeetingService';
import { InvestmentCaseNotFoundError } from '@/lib/services/investmentCaseService';
import { CommitteeReviewNotAvailableError } from '@/lib/services/committeeReviewService';

/**
 * Milestone 15 introduces far more distinct domain error classes (19) than
 * any single-milestone route set before it — repeating the same 19-branch
 * `instanceof` chain in ~35 route files would make every one of them mostly
 * boilerplate. This is the one shared mapper every M15 route calls instead;
 * a route that needs a status this mapper doesn't cover still handles that
 * one case inline afterward (e.g. body-validation 400s that never reach the
 * service layer at all).
 */
export function mapWorkspaceServiceError(error: unknown): NextResponse | null {
  if (error instanceof WorkspaceForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
  if (
    error instanceof WorkspaceNotFoundError ||
    error instanceof WorkspaceMemberNotFoundError ||
    error instanceof ResearchProjectNotFoundError ||
    error instanceof ResearchTaskNotFoundError ||
    error instanceof ResearchNoteNotFoundError ||
    error instanceof ResearchCommentNotFoundError ||
    error instanceof ResearchReviewNotFoundError ||
    error instanceof ResearchMeetingNotFoundError ||
    error instanceof InvestmentCaseNotFoundError
  ) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (
    error instanceof InvalidWorkspaceInputError ||
    error instanceof InvalidResearchProjectInputError ||
    error instanceof InvalidCompanyCoverageInputError ||
    error instanceof InvalidResearchTaskInputError ||
    error instanceof InvalidResearchNoteInputError ||
    error instanceof InvalidResearchCommentInputError ||
    error instanceof InvalidReviewActionError ||
    error instanceof InvalidResearchMeetingInputError ||
    error instanceof CommitteeReviewNotAvailableError
  ) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return null;
}
