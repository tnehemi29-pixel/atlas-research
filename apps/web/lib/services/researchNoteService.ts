import type { ResearchNote } from '@prisma/client';
import { db } from '@/lib/db';
import { requireWorkspaceMember, requireWorkspaceRole, WorkspaceForbiddenError } from '@/lib/services/workspaceService';
import { writeAuditLogEntry } from '@/lib/services/auditLogService';
import { canCreateOrEditResearch } from '@/lib/workspace/permissions';
import { isRowBackedSourceType, validateNoteSource, type NoteSourceCandidate, type NoteSourceType } from '@/lib/workspace/noteSourceValidation';

/**
 * Milestone 15 spec sections 6-7 — structured analyst notes, with source
 * references that must point at a real Atlas record. Editing is
 * deliberately restricted to the note's own author or a workspace
 * OWNER/ADMIN — an ANALYST can create their own notes freely (spec: "create/
 * edit research") but not silently rewrite a colleague's, matching how a
 * real research team's own notes work.
 */

export class ResearchNoteNotFoundError extends Error {
  constructor(message = 'Research note not found.') {
    super(message);
    this.name = 'ResearchNoteNotFoundError';
  }
}

export class InvalidResearchNoteInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidResearchNoteInputError';
  }
}

function assertNonEmpty(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new InvalidResearchNoteInputError(`${field} cannot be empty.`);
  return trimmed;
}

export async function getOwnedWorkspaceNote(workspaceId: string, noteId: string): Promise<ResearchNote> {
  const note = await db.researchNote.findUnique({ where: { id: noteId } });
  if (!note || note.workspaceId !== workspaceId) throw new ResearchNoteNotFoundError();
  return note;
}

async function resolveCompanyId(ticker: string | undefined): Promise<string | null> {
  if (!ticker) return null;
  const company = await db.company.findUnique({ where: { ticker: ticker.trim().toUpperCase() } });
  if (!company) throw new InvalidResearchNoteInputError(`Atlas has no company on record for ticker "${ticker}".`);
  return company.id;
}

async function resolveProjectId(workspaceId: string, projectId: string | undefined): Promise<string | null> {
  if (!projectId) return null;
  const project = await db.researchProject.findUnique({ where: { id: projectId } });
  if (!project || project.workspaceId !== workspaceId) throw new InvalidResearchNoteInputError('That project does not exist in this workspace.');
  return project.id;
}

/** Row-backed source types resolve against the actual table they claim to
 * cite — company-scoped ones (filings/earnings/events/reports) additionally
 * must belong to the note's own company when the note has one set. */
async function sourceExists(sourceType: NoteSourceType, sourceId: string, companyId: string | null): Promise<boolean> {
  switch (sourceType) {
    case 'TEN_K':
    case 'TEN_Q':
    case 'EIGHT_K': {
      const filing = await db.secFiling.findUnique({ where: { id: sourceId } });
      return !!filing && (companyId === null || filing.companyId === companyId);
    }
    case 'EARNINGS_CALL': {
      const call = await db.earningsCall.findUnique({ where: { id: sourceId } });
      return !!call && (companyId === null || call.companyId === companyId);
    }
    case 'RESEARCH_EVENT': {
      const event = await db.researchEvent.findUnique({ where: { id: sourceId } });
      return !!event && (companyId === null || event.companyId === companyId);
    }
    case 'RESEARCH_REPORT': {
      const report = await db.researchReport.findUnique({ where: { id: sourceId } });
      return !!report && (companyId === null || report.companyId === companyId);
    }
    case 'INVESTMENT_CASE': {
      const investmentCase = await db.investmentCase.findUnique({ where: { id: sourceId } });
      return !!investmentCase;
    }
    default:
      return false;
  }
}

export interface NoteSourceInput {
  sourceType: NoteSourceType;
  sourceId?: string;
  sourceLabel: string;
}

async function validateAndBuildSources(candidates: NoteSourceInput[], companyId: string | null) {
  const rows: { sourceType: string; sourceId: string | null; sourceLabel: string }[] = [];
  for (const candidate of candidates) {
    const normalized: NoteSourceCandidate = { sourceType: candidate.sourceType, sourceId: candidate.sourceId ?? null, sourceLabel: candidate.sourceLabel };
    const exists = isRowBackedSourceType(candidate.sourceType) && normalized.sourceId ? await sourceExists(candidate.sourceType, normalized.sourceId, companyId) : null;
    const result = validateNoteSource(normalized, exists);
    if (!result.valid) throw new InvalidResearchNoteInputError(result.reason ?? 'Invalid source.');
    rows.push({ sourceType: normalized.sourceType, sourceId: normalized.sourceId, sourceLabel: normalized.sourceLabel });
  }
  return rows;
}

export interface CreateResearchNoteInput {
  title: string;
  content: string;
  ticker?: string;
  projectId?: string;
  tags?: string[];
  sources?: NoteSourceInput[];
}

export async function createResearchNote(userId: string, workspaceId: string, input: CreateResearchNoteInput): Promise<ResearchNote> {
  await requireWorkspaceRole(userId, workspaceId, canCreateOrEditResearch, 'You do not have permission to create research notes in this workspace.');

  const title = assertNonEmpty(input.title, 'Title');
  const content = assertNonEmpty(input.content, 'Content');
  const companyId = await resolveCompanyId(input.ticker);
  const projectId = await resolveProjectId(workspaceId, input.projectId);
  const sourceRows = await validateAndBuildSources(input.sources ?? [], companyId);

  const note = await db.researchNote.create({
    data: {
      workspaceId,
      companyId,
      projectId,
      authorId: userId,
      title,
      content,
      tags: input.tags ?? [],
      sources: { create: sourceRows },
    },
    include: { sources: true },
  });

  await writeAuditLogEntry({ workspaceId, companyId: companyId ?? undefined, entityType: 'ResearchNote', entityId: note.id, action: 'NOTE_CREATED', actorUserId: userId, detail: { title } });
  return note;
}

export interface ListResearchNotesFilters {
  companyId?: string;
  projectId?: string;
  authorId?: string;
  tag?: string;
}

export async function listResearchNotes(userId: string, workspaceId: string, filters: ListResearchNotesFilters = {}) {
  await requireWorkspaceMember(userId, workspaceId);
  return db.researchNote.findMany({
    where: {
      workspaceId,
      companyId: filters.companyId,
      projectId: filters.projectId,
      authorId: filters.authorId,
      tags: filters.tag ? { has: filters.tag } : undefined,
    },
    include: {
      company: { select: { id: true, ticker: true, name: true } },
      project: { select: { id: true, name: true } },
      author: { select: { id: true, name: true, email: true } },
      _count: { select: { sources: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getResearchNoteDetail(userId: string, workspaceId: string, noteId: string) {
  await requireWorkspaceMember(userId, workspaceId);
  const note = await getOwnedWorkspaceNote(workspaceId, noteId);
  return db.researchNote.findUniqueOrThrow({
    where: { id: note.id },
    include: {
      company: { select: { id: true, ticker: true, name: true } },
      project: { select: { id: true, name: true } },
      author: { select: { id: true, name: true, email: true } },
      sources: true,
    },
  });
}

export interface UpdateResearchNoteInput {
  title?: string;
  content?: string;
  tags?: string[];
}

export async function updateResearchNote(userId: string, workspaceId: string, noteId: string, input: UpdateResearchNoteInput): Promise<ResearchNote> {
  const member = await requireWorkspaceMember(userId, workspaceId);
  const note = await getOwnedWorkspaceNote(workspaceId, noteId);

  const isAuthor = note.authorId === userId;
  const isManager = member.role === 'OWNER' || member.role === 'ADMIN';
  if (!isAuthor && !isManager) throw new WorkspaceForbiddenError('Only the note author or a workspace owner/admin can edit this note.');

  return db.researchNote.update({
    where: { id: note.id },
    data: {
      title: input.title !== undefined ? assertNonEmpty(input.title, 'Title') : undefined,
      content: input.content !== undefined ? assertNonEmpty(input.content, 'Content') : undefined,
      tags: input.tags,
    },
  });
}
