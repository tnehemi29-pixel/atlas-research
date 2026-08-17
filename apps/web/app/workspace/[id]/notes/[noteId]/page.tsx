import type { Metadata } from 'next';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth/session';
import { WorkspaceNotFoundError } from '@/lib/services/workspaceService';
import { getResearchNoteDetail, ResearchNoteNotFoundError } from '@/lib/services/researchNoteService';
import { WorkspaceNav } from '@/components/workspace/WorkspaceNav';
import { CommentsPanel } from '@/components/workspace/CommentsPanel';
import { formatUpdatedAt } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Research Note · Atlas Research' };

export default async function NoteDetailPage({ params }: { params: { id: string; noteId: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  let note;
  try {
    note = await getResearchNoteDetail(user.id, params.id, params.noteId);
  } catch (error) {
    if (error instanceof WorkspaceNotFoundError || error instanceof ResearchNoteNotFoundError) notFound();
    throw error;
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <WorkspaceNav workspaceId={params.id} active="notes" />
      <header className="border-ink/10 border-b pb-6">
        <div className="flex flex-wrap items-center gap-2">
          {note.company && (
            <Link href={`/company/${note.company.ticker}`} className="text-accent text-sm font-medium hover:underline">
              {note.company.ticker}
            </Link>
          )}
          {note.tags.map((tag) => (
            <span key={tag} className="text-ink/40 bg-black/5 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
              {tag}
            </span>
          ))}
        </div>
        <h1 className="text-ink font-serif text-2xl font-semibold">{note.title}</h1>
        <p className="text-ink/40 mt-1 text-xs">
          {note.author.name ?? note.author.email} · {formatUpdatedAt(note.createdAt.toISOString())}
        </p>
      </header>

      <p className="text-ink mt-6 whitespace-pre-wrap text-sm">{note.content}</p>

      {note.sources.length > 0 && (
        <section className="mt-6">
          <h2 className="text-ink font-serif text-lg">Sources</h2>
          <ul className="mt-2 space-y-1">
            {note.sources.map((source) => (
              <li key={source.id} className="text-ink/70 text-sm">
                · {source.sourceLabel} <span className="text-ink/30 text-xs">({source.sourceType})</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <CommentsPanel workspaceId={params.id} parentType="RESEARCH_NOTE" parentId={note.id} />
    </main>
  );
}
