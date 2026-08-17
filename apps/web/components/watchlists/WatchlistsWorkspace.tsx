'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createWatchlist, deleteWatchlist, type WatchlistListItem } from '@/lib/api/watchlists';
import { ApiError } from '@/lib/api/companies';

export function WatchlistsWorkspace({ initialWatchlists }: { initialWatchlists: WatchlistListItem[] }) {
  const [watchlists, setWatchlists] = useState(initialWatchlists);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const created = await createWatchlist(name.trim());
      setWatchlists((prev) => [...prev, { ...created, _count: { companies: 0 } }]);
      setName('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create watchlist.');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    setWatchlists((prev) => prev.filter((w) => w.id !== id));
    try {
      await deleteWatchlist(id);
    } catch {
      // best-effort — a page refresh will reconcile if this somehow failed
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-ink font-serif text-2xl">Watchlists</h1>
      <p className="text-ink/50 mt-1 text-sm">
        Track companies you&apos;re researching — split by theme (Long-Term Ideas, M&amp;A Candidates, Technology, Research
        Queue, or anything else useful to you).
      </p>

      <form onSubmit={handleCreate} className="mt-6 flex gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New watchlist name…"
          className="border-ink/15 bg-paper text-ink flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
        <button type="submit" disabled={creating || !name.trim()} className="bg-accent shrink-0 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {creating ? 'Creating…' : 'Create'}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}

      {watchlists.length === 0 ? (
        <p className="text-ink/50 mt-8 text-sm">No watchlists yet — create your first one above.</p>
      ) : (
        <ul className="mt-8 divide-y divide-black/5">
          {watchlists.map((w) => (
            <li key={w.id} className="flex items-center justify-between py-3">
              <Link href={`/watchlists/${w.id}`} className="text-ink hover:text-accent font-medium">
                {w.name}
                <span className="text-ink/40 ml-2 text-sm font-normal">
                  {w._count.companies} {w._count.companies === 1 ? 'company' : 'companies'}
                </span>
              </Link>
              <button type="button" onClick={() => handleDelete(w.id)} className="text-ink/40 text-sm hover:text-red-700">
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
