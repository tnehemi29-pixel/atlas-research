'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CompanySearch } from '@/components/company-search/CompanySearch';
import { createAlert, deleteAlert, setAlertActive, type AlertResponse, type AlertType } from '@/lib/api/alerts';
import { ApiError } from '@/lib/api/companies';
import { formatUpdatedAt } from '@/lib/utils/format';

const ALERT_TYPES: Array<{ value: AlertType; label: string }> = [
  { value: 'NEW_SEC_FILING', label: 'New SEC filing' },
  { value: 'EARNINGS_AVAILABLE', label: 'Earnings available' },
  { value: 'DCF_VALUATION_CHANGE', label: 'DCF valuation changes materially' },
  { value: 'RESEARCH_REPORT_UPDATED', label: 'Research report updated' },
  { value: 'GUIDANCE_CHANGED', label: 'Guidance changed' },
  { value: 'HIGH_IMPORTANCE_RESEARCH_EVENT', label: 'High-importance research event' },
  { value: 'CRITICAL_RESEARCH_EVENT', label: 'Critical research event' },
  { value: 'NEW_MATERIAL_RISK', label: 'New material risk disclosed' },
];

export function AlertsWorkspace({ initial }: { initial: AlertResponse[] }) {
  const [alerts, setAlerts] = useState(initial);
  const [type, setType] = useState<AlertType>('NEW_SEC_FILING');
  const [ticker, setTicker] = useState<string | null>(null);
  const [threshold, setThreshold] = useState('10');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const created = await createAlert({
        type,
        ticker,
        thresholdPercent: type === 'DCF_VALUATION_CHANGE' ? Number(threshold) : undefined,
      });
      setAlerts((prev) => [...prev, created]);
      setTicker(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create alert.');
    } finally {
      setCreating(false);
    }
  }

  async function handleToggle(id: string, isActive: boolean) {
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, isActive } : a)));
    await setAlertActive(id, isActive).catch(() => {});
  }

  async function handleDelete(id: string) {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    await deleteAlert(id).catch(() => {});
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-ink font-serif text-2xl">Research Alerts</h1>
      <p className="text-ink/50 mt-1 max-w-2xl text-sm">
        Research monitoring, not trading alerts — Atlas never triggers on price. Alerts are re-evaluated
        deterministically every time you visit this page (there is no background notification queue yet — see{' '}
        <Link href="/" className="text-accent hover:underline">
          the README
        </Link>
        {' '}for why).
      </p>

      <form onSubmit={handleCreate} className="border-ink/10 bg-paper mt-6 rounded-xl border p-4">
        <p className="text-ink/40 mb-2 text-[10px] font-medium uppercase tracking-wide">New Alert</p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-64">
            <label className="text-ink/50 text-xs">Trigger</label>
            <select value={type} onChange={(e) => setType(e.target.value as AlertType)} className="border-ink/15 bg-paper text-ink mt-0.5 w-full rounded-lg border px-2 py-1.5 text-sm">
              {ALERT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="w-56">
            <label className="text-ink/50 text-xs">
              Company <span className="text-ink/30">(optional — all followed if empty)</span>
            </label>
            <CompanySearch placeholder="Search ticker…" onSelect={(r) => setTicker(r.ticker)} />
            {ticker && <p className="text-accent mt-1 text-xs font-medium">Scoped to: {ticker}</p>}
          </div>
          {type === 'DCF_VALUATION_CHANGE' && (
            <div className="w-28">
              <label className="text-ink/50 text-xs">Threshold %</label>
              <input type="number" min="0.1" step="0.1" value={threshold} onChange={(e) => setThreshold(e.target.value)} className="border-ink/15 bg-paper text-ink mt-0.5 w-full rounded-lg border px-2 py-1.5 text-sm" />
            </div>
          )}
          <button type="submit" disabled={creating} className="bg-accent shrink-0 rounded-lg px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">
            {creating ? 'Creating…' : 'Create Alert'}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      </form>

      {alerts.length === 0 ? (
        <p className="text-ink/50 mt-8 text-sm">No alerts configured yet.</p>
      ) : (
        <ul className="mt-6 divide-y divide-black/5">
          {alerts.map((alert) => (
            <li key={alert.id} className="py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-ink text-sm font-medium">
                    {ALERT_TYPES.find((t) => t.value === alert.type)?.label}
                    {alert.type === 'DCF_VALUATION_CHANGE' && alert.thresholdPercent !== null && ` (±${alert.thresholdPercent}%)`}
                  </p>
                  <p className="text-ink/50 text-xs">{alert.company ? alert.company.ticker : 'All followed companies'}</p>
                  {alert.lastTriggeredAt ? (
                    <p className="text-accent mt-1 text-xs font-medium">
                      Triggered {formatUpdatedAt(alert.lastTriggeredAt)}: {alert.lastTriggeredSummary}
                    </p>
                  ) : (
                    <p className="text-ink/30 mt-1 text-xs">
                      {alert.lastCheckedAt ? `Checked ${formatUpdatedAt(alert.lastCheckedAt)} — not currently triggered` : 'Not yet checked'}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <label className="text-ink/50 flex items-center gap-1.5 text-xs">
                    <input type="checkbox" checked={alert.isActive} onChange={(e) => handleToggle(alert.id, e.target.checked)} />
                    Active
                  </label>
                  <button type="button" onClick={() => handleDelete(alert.id)} className="text-ink/40 text-xs hover:text-red-700">
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
