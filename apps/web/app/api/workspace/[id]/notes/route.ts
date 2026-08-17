import { NextResponse } from 'next/server';
import { requireUser, unauthorizedResponse, UnauthorizedError } from '@/lib/auth/requireUser';
import { createResearchNote, listResearchNotes, type NoteSourceInput } from '@/lib/services/researchNoteService';
import { NOTE_SOURCE_TYPES, type NoteSourceType } from '@/lib/workspace/noteSourceValidation';
import { mapWorkspaceServiceError } from '@/lib/workspace/errorMapping';

export const dynamic = 'force-dynamic';

function parseSources(raw: unknown): NoteSourceInput[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const parsed: NoteSourceInput[] = [];
  for (const entry of raw) {
    if (typeof entry?.sourceType !== 'string' || !NOTE_SOURCE_TYPES.includes(entry.sourceType as NoteSourceType)) continue;
    if (typeof entry?.sourceLabel !== 'string') continue;
    parsed.push({ sourceType: entry.sourceType as NoteSourceType, sourceId: typeof entry.sourceId === 'string' ? entry.sourceId : undefined, sourceLabel: entry.sourceLabel });
  }
  return parsed;
}

/** GET /api/workspace/[id]/notes?companyId=&projectId=&authorId=&tag= */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const url = new URL(request.url);
  try {
    const notes = await listResearchNotes(user.id, params.id, {
      companyId: url.searchParams.get('companyId') ?? undefined,
      projectId: url.searchParams.get('projectId') ?? undefined,
      authorId: url.searchParams.get('authorId') ?? undefined,
      tag: url.searchParams.get('tag') ?? undefined,
    });
    return NextResponse.json(notes);
  } catch (error) {
    const mapped = mapWorkspaceServiceError(error);
    if (mapped) return mapped;
    throw error;
  }
}

/** POST /api/workspace/[id]/notes — { title, content, ticker?, projectId?, tags?, sources? } */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const body = await request.json().catch(() => null);
  const title = typeof body?.title === 'string' ? body.title : '';
  const content = typeof body?.content === 'string' ? body.content : '';
  const tags = Array.isArray(body?.tags) ? body.tags.filter((t: unknown): t is string => typeof t === 'string') : undefined;

  try {
    const note = await createResearchNote(user.id, params.id, {
      title,
      content,
      ticker: typeof body?.ticker === 'string' ? body.ticker : undefined,
      projectId: typeof body?.projectId === 'string' ? body.projectId : undefined,
      tags,
      sources: parseSources(body?.sources),
    });
    return NextResponse.json(note, { status: 201 });
  } catch (error) {
    const mapped = mapWorkspaceServiceError(error);
    if (mapped) return mapped;
    throw error;
  }
}
