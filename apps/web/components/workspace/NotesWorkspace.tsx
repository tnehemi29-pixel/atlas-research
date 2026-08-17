'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createResearchNote, type NoteSourceTypeValue } from '@/lib/api/workspace';
import { ApiError } from '@/lib/api/companies';
import { formatUpdatedAt } from '@/lib/utils/format';

const SOURCE_TYPES: { value: NoteSourceTypeValue; label: string; rowBacked: boolean }[] = [
  { value: 'TEN_K', label: '10-K', rowBacked: true },
  { value: 'TEN_Q', label: '10-Q', rowBacked: true },
  { value: 'EIGHT_K', label: '8-K', rowBacked: true },
  { value: 'EARNINGS_CALL', label: 'Earnings Call', rowBacked: true },
  { value: 'RESEARCH_EVENT', label: 'Research Event', rowBacked: true },
  { value: 'RESEARCH_REPORT', label: 'Research Report', rowBacked: true },
  { value: 'INVESTMENT_CASE', label: 'Investment Case', rowBacked: true },
  { value: 'FINANCIAL_STATEMENT', label: 'Financial Statement', rowBacked: false },
  { value: 'DCF_ASSUMPTION', label: 'DCF Assumption', rowBacked: false },
  { value: 'OTHER', label: 'Other', rowBacked: false },
];

export interface NoteRow {
  id: string;
  title: string;
  content: string;
  tags: string[];
  companyId: string | null;
  createdAt: string;
  company: { id: string; ticker: string; name: string } | null;
  author: { id: string; name: string | null; email: string };
  _count?: { sources: number };
}

export function NotesWorkspace({ workspaceId, initialNotes, canCreate }: { workspaceId: string; initialNotes: NoteRow[]; canCreate: boolean }) {
  const [notes, setNotes] = useState(initialNotes);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [ticker, setTicker] = useState('');
  const [tags, setTags] = useState('');
  const [sourceType, setSourceType] = useState<NoteSourceTypeValue | ''>('');
  const [sourceId, setSourceId] = useState('');
  const [sourceLabel, setSourceLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedSourceType = SOURCE_TYPES.find((s) => s.value === sourceType);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const sources = sourceType && sourceLabel.trim() ? [{ sourceType, sourceId: sourceId.trim() || undefined, sourceLabel: sourceLabel.trim() }] : undefined;
      const created = await createResearchNote(workspaceId, {
        title: title.trim(),
        content: content.trim(),
        ticker: ticker.trim() || undefined,
        tags: tags.trim() ? tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
        sources,
      });
      setNotes((prev) => [
        { id: created.id, title: created.title, content: created.content, tags: created.tags, companyId: created.companyId, createdAt: created.createdAt, company: created.company, author: created.author, _count: { sources: sources?.length ?? 0 } },
        ...prev,
      ]);
      setTitle('');
      setContent('');
      setTicker('');
      setTags('');
      setSourceType('');
      setSourceId('');
      setSourceLabel('');
      setShowForm(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create the note.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mt-6">
      {canCreate && (
        <div className="mb-4 flex justify-end">
          <button type="button" onClick={() => setShowForm((s) => !s)} className="bg-accent rounded-lg px-4 py-2 text-sm font-medium text-white">
            {showForm ? 'Cancel' : 'New Note'}
          </button>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="border-ink/10 bg-paper mb-6 space-y-3 rounded-xl border p-4">
          <div>
            <label className="text-ink/60 text-xs font-medium">Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Management commentary on pricing" className="border-ink/15 bg-paper text-ink mt-1 w-full rounded-lg border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-ink/60 text-xs font-medium">Content</label>
            <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={3} className="border-ink/15 bg-paper text-ink mt-1 w-full rounded-lg border px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-ink/60 text-xs font-medium">Ticker (optional)</label>
              <input value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} placeholder="NVDA" className="border-ink/15 bg-paper text-ink mt-1 w-full rounded-lg border px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-ink/60 text-xs font-medium">Tags (comma-separated, optional)</label>
              <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="pricing, margins" className="border-ink/15 bg-paper text-ink mt-1 w-full rounded-lg border px-3 py-2 text-sm" />
            </div>
          </div>

          <div className="border-ink/10 rounded-lg border p-3">
            <p className="text-ink/60 text-xs font-medium">Source (optional) — must reference a real Atlas source</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <select value={sourceType} onChange={(e) => setSourceType(e.target.value as NoteSourceTypeValue | '')} className="border-ink/15 bg-paper text-ink rounded-lg border px-2 py-1.5 text-sm">
                <option value="">No source</option>
                {SOURCE_TYPES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              {selectedSourceType?.rowBacked && <input value={sourceId} onChange={(e) => setSourceId(e.target.value)} placeholder="Source record id" className="border-ink/15 bg-paper text-ink rounded-lg border px-2 py-1.5 text-sm" />}
              {sourceType && <input value={sourceLabel} onChange={(e) => setSourceLabel(e.target.value)} placeholder="Q3 2026 earnings call" className="border-ink/15 bg-paper text-ink rounded-lg border px-2 py-1.5 text-sm" />}
            </div>
          </div>

          {error && <p className="text-sm text-red-700">{error}</p>}
          <button type="submit" disabled={creating || !title.trim() || !content.trim()} className="bg-accent rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {creating ? 'Creating…' : 'Create Note'}
          </button>
        </form>
      )}

      {notes.length === 0 ? (
        <p className="text-ink/40 mt-8 text-sm">No research notes in this workspace yet.</p>
      ) : (
        <ul className="border-ink/10 divide-y divide-black/5 rounded-xl border">
          {notes.map((note) => (
            <li key={note.id}>
              <Link href={`/workspace/${workspaceId}/notes/${note.id}`} className="block px-4 py-3 hover:bg-black/[0.02]">
                <div className="flex flex-wrap items-center gap-2">
                  {note.company && <span className="text-accent text-xs font-medium">{note.company.ticker}</span>}
                  <span className="text-ink text-sm font-medium">{note.title}</span>
                  {note._count && note._count.sources > 0 && <span className="text-ink/40 text-xs">· {note._count.sources} source(s)</span>}
                </div>
                <p className="text-ink/50 mt-1 line-clamp-1 text-sm">{note.content}</p>
                <p className="text-ink/30 mt-1 text-xs">
                  {note.author.name ?? note.author.email} · {formatUpdatedAt(note.createdAt)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
