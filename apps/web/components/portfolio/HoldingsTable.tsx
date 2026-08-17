'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CompanySearch } from '@/components/company-search/CompanySearch';
import { addHolding, editHolding, removeHolding, type PortfolioHoldingRow } from '@/lib/api/portfolio';
import { ApiError } from '@/lib/api/companies';
import { formatCompactCurrency, formatPrice, formatRatioAsPercent } from '@/lib/utils/format';

function AddHoldingForm({ onAdded }: { onAdded: () => void }) {
  const [ticker, setTicker] = useState<string | null>(null);
  const [shares, setShares] = useState('');
  const [averageCost, setAverageCost] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!ticker) {
      setError('Search for and select a company first.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await addHolding({
        ticker,
        shares: Number(shares),
        averageCost: Number(averageCost),
        purchaseDate: purchaseDate || null,
        notes: notes.trim() || null,
      });
      setTicker(null);
      setShares('');
      setAverageCost('');
      setPurchaseDate('');
      setNotes('');
      onAdded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add holding.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border-ink/10 bg-paper mb-6 rounded-xl border p-4">
      <p className="text-ink/40 mb-2 text-[10px] font-medium uppercase tracking-wide">Add Holding</p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-56">
          <label className="text-ink/50 text-xs">Company</label>
          <CompanySearch placeholder="Search ticker…" onSelect={(r) => setTicker(r.ticker)} />
          {ticker && <p className="text-accent mt-1 text-xs font-medium">Selected: {ticker}</p>}
        </div>
        <div className="w-28">
          <label className="text-ink/50 text-xs">Shares</label>
          <input type="number" step="any" min="0" required value={shares} onChange={(e) => setShares(e.target.value)} className="border-ink/15 bg-paper text-ink mt-0.5 w-full rounded-lg border px-2 py-1.5 text-sm" />
        </div>
        <div className="w-32">
          <label className="text-ink/50 text-xs">Avg. Cost</label>
          <input type="number" step="any" min="0" required value={averageCost} onChange={(e) => setAverageCost(e.target.value)} className="border-ink/15 bg-paper text-ink mt-0.5 w-full rounded-lg border px-2 py-1.5 text-sm" />
        </div>
        <div className="w-36">
          <label className="text-ink/50 text-xs">Purchase Date</label>
          <input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} className="border-ink/15 bg-paper text-ink mt-0.5 w-full rounded-lg border px-2 py-1.5 text-sm" />
        </div>
        <div className="min-w-[10rem] flex-1">
          <label className="text-ink/50 text-xs">
            Notes <span className="text-ink/30">(optional)</span>
          </label>
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className="border-ink/15 bg-paper text-ink mt-0.5 w-full rounded-lg border px-2 py-1.5 text-sm" />
        </div>
        <button type="submit" disabled={submitting} className="bg-accent shrink-0 rounded-lg px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">
          {submitting ? 'Adding…' : 'Add'}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </form>
  );
}

function EditableRow({ row, onSaved, onRemoved }: { row: PortfolioHoldingRow; onSaved: () => void; onRemoved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [shares, setShares] = useState(String(row.shares));
  const [averageCost, setAverageCost] = useState(String(row.averageCost));
  const [notes, setNotes] = useState(row.notes ?? '');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await editHolding(row.id, { shares: Number(shares), averageCost: Number(averageCost), notes: notes.trim() || null });
      setEditing(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    await removeHolding(row.id);
    onRemoved();
  }

  const gainLossTone = row.unrealizedGainLoss === null ? '' : row.unrealizedGainLoss >= 0 ? 'text-emerald-700' : 'text-red-700';

  if (editing) {
    return (
      <tr className="border-ink/5 border-b bg-black/[0.02]">
        <td className="py-2 pr-3 font-medium">{row.ticker}</td>
        <td className="text-ink/70 py-2 pr-3">{row.name}</td>
        <td className="py-2 px-2 text-right">
          <input type="number" step="any" value={shares} onChange={(e) => setShares(e.target.value)} className="border-ink/15 w-20 rounded border px-1.5 py-1 text-right text-sm" />
        </td>
        <td colSpan={2} className="py-2 px-2 text-right">
          <input type="number" step="any" value={averageCost} onChange={(e) => setAverageCost(e.target.value)} className="border-ink/15 w-24 rounded border px-1.5 py-1 text-right text-sm" placeholder="Avg. cost" />
        </td>
        <td colSpan={3} className="py-2 px-2">
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className="border-ink/15 w-full rounded border px-1.5 py-1 text-sm" placeholder="Notes" />
        </td>
        <td className="py-2 pl-2 text-right">
          <button type="button" disabled={saving} onClick={handleSave} className="text-accent mr-2 text-xs font-medium">
            Save
          </button>
          <button type="button" onClick={() => setEditing(false)} className="text-ink/40 text-xs">
            Cancel
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-ink/5 border-b last:border-0">
      <td className="py-2 pr-3 font-medium">
        <Link href={`/company/${row.ticker}`} className="text-accent hover:underline">
          {row.ticker}
        </Link>
      </td>
      <td className="text-ink/70 py-2 pr-3">{row.name}</td>
      <td className="text-ink/80 py-2 px-2 text-right">{row.shares}</td>
      <td className="text-ink py-2 px-2 text-right">{formatPrice(row.currentPrice)}</td>
      <td className="text-ink py-2 px-2 text-right font-medium">{formatCompactCurrency(row.marketValue)}</td>
      <td className="text-ink/80 py-2 px-2 text-right">{formatRatioAsPercent(row.weight)}</td>
      <td className={`py-2 px-2 text-right font-medium ${gainLossTone}`}>{formatCompactCurrency(row.unrealizedGainLoss)}</td>
      <td className={`py-2 px-2 text-right font-medium ${gainLossTone}`}>{formatRatioAsPercent(row.unrealizedReturn)}</td>
      <td className="py-2 pl-2 text-right">
        <button type="button" onClick={() => setEditing(true)} className="text-ink/40 mr-2 text-xs hover:text-ink/70">
          Edit
        </button>
        <button type="button" onClick={handleRemove} className="text-ink/40 text-xs hover:text-red-700">
          Remove
        </button>
      </td>
    </tr>
  );
}

export function HoldingsTable({ holdings, onChanged }: { holdings: PortfolioHoldingRow[]; onChanged: () => void }) {
  return (
    <section>
      <h2 className="text-ink font-serif text-lg font-medium">Holdings</h2>
      <div className="mt-3">
        <AddHoldingForm onAdded={onChanged} />
      </div>

      {holdings.length === 0 ? (
        <p className="text-ink/50 text-sm">No holdings yet — add your first one above.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-ink/10 border-b text-left">
                <th className="text-ink/40 py-2 pr-3 text-[10px] font-medium uppercase tracking-wide">Ticker</th>
                <th className="text-ink/40 py-2 pr-3 text-[10px] font-medium uppercase tracking-wide">Company</th>
                <th className="text-ink/40 px-2 py-2 text-right text-[10px] font-medium uppercase tracking-wide">Shares</th>
                <th className="text-ink/40 px-2 py-2 text-right text-[10px] font-medium uppercase tracking-wide">Price</th>
                <th className="text-ink/40 px-2 py-2 text-right text-[10px] font-medium uppercase tracking-wide">Market Value</th>
                <th className="text-ink/40 px-2 py-2 text-right text-[10px] font-medium uppercase tracking-wide">Weight</th>
                <th className="text-ink/40 px-2 py-2 text-right text-[10px] font-medium uppercase tracking-wide">Gain/Loss</th>
                <th className="text-ink/40 px-2 py-2 text-right text-[10px] font-medium uppercase tracking-wide">Return</th>
                <th className="py-2 pl-2"></th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((row) => (
                <EditableRow key={row.id} row={row} onSaved={onChanged} onRemoved={onChanged} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
