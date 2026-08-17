'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createResearchMeeting } from '@/lib/api/workspace';
import { ApiError } from '@/lib/api/companies';
import { formatDate } from '@/lib/utils/format';

interface UserSummary {
  id: string;
  name: string | null;
  email: string;
}

export interface MeetingRow {
  id: string;
  title: string;
  date: string;
  decisions: string[];
  participants: { userId: string; user: UserSummary }[];
  companies: { companyId: string; company: { id: string; ticker: string; name: string } }[];
  _count: { actionItems: number };
}

export function MeetingsWorkspace({ workspaceId, initialMeetings, members, canCreate }: { workspaceId: string; initialMeetings: MeetingRow[]; members: UserSummary[]; canCreate: boolean }) {
  const [meetings, setMeetings] = useState(initialMeetings);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [tickers, setTickers] = useState('');
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim() || !date) return;
    setCreating(true);
    setError(null);
    try {
      const created = await createResearchMeeting(workspaceId, {
        title: title.trim(),
        date: new Date(date).toISOString(),
        tickers: tickers.trim() ? tickers.split(',').map((t) => t.trim().toUpperCase()).filter(Boolean) : undefined,
      });
      setMeetings((prev) => [
        {
          id: created.id,
          title: created.title,
          date: created.date,
          decisions: created.decisions,
          participants: [],
          companies: (tickers.trim() ? tickers.split(',').map((t) => t.trim().toUpperCase()) : []).map((t) => ({ companyId: t, company: { id: t, ticker: t, name: t } })),
          _count: { actionItems: 0 },
        },
        ...prev,
      ]);
      setTitle('');
      setDate('');
      setTickers('');
      setShowForm(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create the meeting.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mt-6">
      {canCreate && (
        <div className="mb-4 flex justify-end">
          <button type="button" onClick={() => setShowForm((s) => !s)} className="bg-accent rounded-lg px-4 py-2 text-sm font-medium text-white">
            {showForm ? 'Cancel' : 'New Meeting'}
          </button>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="border-ink/10 bg-paper mb-6 grid grid-cols-1 gap-3 rounded-xl border p-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="text-ink/60 text-xs font-medium">Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="NVDA Earnings Review" className="border-ink/15 bg-paper text-ink mt-1 w-full rounded-lg border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-ink/60 text-xs font-medium">Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border-ink/15 bg-paper text-ink mt-1 w-full rounded-lg border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-ink/60 text-xs font-medium">Companies discussed (comma-separated tickers, optional)</label>
            <input value={tickers} onChange={(e) => setTickers(e.target.value)} placeholder="NVDA, AMD" className="border-ink/15 bg-paper text-ink mt-1 w-full rounded-lg border px-3 py-2 text-sm" />
          </div>
          {error && <p className="text-sm text-red-700 sm:col-span-2">{error}</p>}
          <button type="submit" disabled={creating || !title.trim() || !date} className="bg-accent w-fit rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 sm:col-span-2">
            {creating ? 'Creating…' : 'Create Meeting'}
          </button>
        </form>
      )}

      {meetings.length === 0 ? (
        <p className="text-ink/40 mt-8 text-sm">No research meetings recorded in this workspace yet.</p>
      ) : (
        <ul className="border-ink/10 divide-y divide-black/5 rounded-xl border">
          {meetings.map((meeting) => (
            <li key={meeting.id}>
              <Link href={`/workspace/${workspaceId}/meetings/${meeting.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-black/[0.02]">
                <div>
                  <p className="text-ink text-sm font-medium">{meeting.title}</p>
                  <p className="text-ink/40 mt-0.5 text-xs">
                    {formatDate(meeting.date)}
                    {meeting.companies.length > 0 && ` · ${meeting.companies.map((c) => c.company.ticker).join(', ')}`}
                  </p>
                </div>
                <span className="text-ink/30 text-xs">{meeting._count.actionItems} action item(s)</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
