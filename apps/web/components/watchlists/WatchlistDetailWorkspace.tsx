'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CompanySearch } from '@/components/company-search/CompanySearch';
import {
  addCompanyToWatchlist,
  fetchWatchlistDetail,
  removeCompanyFromWatchlist,
  renameWatchlist,
  reorderWatchlistCompanies,
  type WatchlistDetailResponse,
} from '@/lib/api/watchlists';
import { ApiError } from '@/lib/api/companies';
import { formatCompactCurrency, formatMultiple, formatPrice, formatRatioAsPercent } from '@/lib/utils/format';

export function WatchlistDetailWorkspace({ initial }: { initial: WatchlistDetailResponse }) {
  const [detail, setDetail] = useState(initial);
  const [name, setName] = useState(initial.watchlist.name);
  const [editingName, setEditingName] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const fresh = await fetchWatchlistDetail(detail.watchlist.id);
    setDetail(fresh);
  }

  async function handleRename() {
    if (!name.trim() || name === detail.watchlist.name) {
      setEditingName(false);
      return;
    }
    try {
      const updated = await renameWatchlist(detail.watchlist.id, name.trim());
      setDetail((prev) => ({ ...prev, watchlist: { ...prev.watchlist, name: updated.name } }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to rename watchlist.');
    } finally {
      setEditingName(false);
    }
  }

  async function handleAdd(ticker: string) {
    setBusy(true);
    setError(null);
    try {
      await addCompanyToWatchlist(detail.watchlist.id, ticker);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add company.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(ticker: string) {
    setBusy(true);
    try {
      await removeCompanyFromWatchlist(detail.watchlist.id, ticker);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove company.');
    } finally {
      setBusy(false);
    }
  }

  async function handleMove(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= detail.rows.length) return;

    const reordered = [...detail.rows];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved!);
    setDetail((prev) => ({ ...prev, rows: reordered }));

    try {
      await reorderWatchlistCompanies(detail.watchlist.id, reordered.map((r) => r.ticker));
    } catch {
      await refresh(); // reconcile with the server if the reorder didn't stick
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <Link href="/watchlists" className="text-accent text-sm hover:underline">
        ← All watchlists
      </Link>

      <div className="mt-2 flex items-center gap-2">
        {editingName ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => e.key === 'Enter' && handleRename()}
            className="border-ink/15 bg-paper text-ink font-serif text-2xl rounded-lg border px-2 py-1"
          />
        ) : (
          <h1 onClick={() => setEditingName(true)} className="text-ink font-serif text-2xl cursor-pointer" title="Click to rename">
            {detail.watchlist.name}
          </h1>
        )}
      </div>

      <div className="mt-4 max-w-sm">
        <CompanySearch placeholder="Add a company…" onSelect={(result) => handleAdd(result.ticker)} />
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}

      {detail.rows.length === 0 ? (
        <p className="text-ink/50 mt-8 text-sm">No companies on this watchlist yet.</p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-ink/10 border-b text-left">
                <th className="py-2 pr-2"></th>
                <th className="text-ink/40 py-2 pr-3 text-[10px] font-medium uppercase tracking-wide">Ticker</th>
                <th className="text-ink/40 py-2 pr-3 text-[10px] font-medium uppercase tracking-wide">Company</th>
                <th className="text-ink/40 px-2 py-2 text-right text-[10px] font-medium uppercase tracking-wide">Price</th>
                <th className="text-ink/40 px-2 py-2 text-right text-[10px] font-medium uppercase tracking-wide">Market Cap</th>
                <th className="text-ink/40 px-2 py-2 text-right text-[10px] font-medium uppercase tracking-wide">Rev. Growth</th>
                <th className="text-ink/40 px-2 py-2 text-right text-[10px] font-medium uppercase tracking-wide">Op. Margin</th>
                <th className="text-ink/40 px-2 py-2 text-right text-[10px] font-medium uppercase tracking-wide">FCF</th>
                <th className="text-ink/40 px-2 py-2 text-right text-[10px] font-medium uppercase tracking-wide">EV/EBITDA</th>
                <th className="text-ink/40 px-2 py-2 text-right text-[10px] font-medium uppercase tracking-wide">P/E</th>
                <th className="text-ink/40 px-2 py-2 text-right text-[10px] font-medium uppercase tracking-wide">DCF Price</th>
                <th className="text-ink/40 px-2 py-2 text-right text-[10px] font-medium uppercase tracking-wide">DCF Up/Down</th>
                <th className="py-2 pl-2"></th>
              </tr>
            </thead>
            <tbody>
              {detail.rows.map((row, index) => (
                <tr key={row.companyId} className="border-ink/5 border-b last:border-0">
                  <td className="py-2 pr-1 text-ink/30">
                    <button type="button" disabled={busy || index === 0} onClick={() => handleMove(index, -1)} className="disabled:opacity-20" aria-label="Move up">
                      ↑
                    </button>
                    <button type="button" disabled={busy || index === detail.rows.length - 1} onClick={() => handleMove(index, 1)} className="ml-0.5 disabled:opacity-20" aria-label="Move down">
                      ↓
                    </button>
                  </td>
                  <td className="py-2 pr-3 font-medium">
                    <Link href={`/company/${row.ticker}`} className="text-accent hover:underline">
                      {row.ticker}
                    </Link>
                  </td>
                  <td className="text-ink/70 py-2 pr-3">{row.name}</td>
                  <td className="text-ink py-2 px-2 text-right">{formatPrice(row.price)}</td>
                  <td className="text-ink/80 py-2 px-2 text-right">{formatCompactCurrency(row.marketCap)}</td>
                  <td className="text-ink/80 py-2 px-2 text-right">{formatRatioAsPercent(row.revenueGrowth)}</td>
                  <td className="text-ink/80 py-2 px-2 text-right">{formatRatioAsPercent(row.operatingMargin)}</td>
                  <td className="text-ink/80 py-2 px-2 text-right">{formatCompactCurrency(row.freeCashFlow)}</td>
                  <td className="text-ink/80 py-2 px-2 text-right">{formatMultiple(row.evToEbitda)}</td>
                  <td className="text-ink/80 py-2 px-2 text-right">{formatMultiple(row.peRatio)}</td>
                  <td className="text-ink py-2 px-2 text-right font-medium">{formatPrice(row.dcfImpliedPrice)}</td>
                  <td className="text-ink py-2 px-2 text-right font-medium">{formatRatioAsPercent(row.dcfUpsideDownside)}</td>
                  <td className="py-2 pl-2 text-right">
                    <button type="button" disabled={busy} onClick={() => handleRemove(row.ticker)} className="text-ink/30 text-xs hover:text-red-700">
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
