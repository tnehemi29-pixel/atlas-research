'use client';

import { useState } from 'react';
import {
  createInvestmentCaseCatalyst,
  createInvestmentCaseRisk,
  deleteInvestmentCaseCatalyst,
  deleteInvestmentCaseRisk,
  updateInvestmentCaseCatalyst,
  updateInvestmentCaseRisk,
  type CatalystStatusValue,
  type ConfidenceLevelValue,
  type InvestmentCaseCatalystResponse,
  type InvestmentCaseRiskResponse,
  type RiskStatusValue,
} from '@/lib/api/investmentCases';
import { ApiError } from '@/lib/api/companies';
import { CATALYST_STATUS_LABELS, RISK_STATUS_LABELS, formatConfidence } from '@/lib/utils/investmentCaseDisplay';

const LEVELS: ConfidenceLevelValue[] = ['LOW', 'MEDIUM', 'HIGH'];
const RISK_STATUSES: RiskStatusValue[] = ['MONITORING', 'ESCALATING', 'MITIGATED', 'REALIZED'];
const CATALYST_STATUSES: CatalystStatusValue[] = ['UPCOMING', 'IN_PROGRESS', 'OCCURRED', 'FAILED', 'UNCERTAIN'];

/** Spec sections 18-19 — structured risks and catalysts. Neither list is
 * ever populated automatically; every row is something the user (or a
 * cited AI suggestion routed through the same write path) explicitly
 * entered. */
export function RisksCatalystsPanel({
  caseId,
  risks,
  catalysts,
  onChanged,
}: {
  caseId: string;
  risks: InvestmentCaseRiskResponse[];
  catalysts: InvestmentCaseCatalystResponse[];
  onChanged: () => Promise<void>;
}) {
  const [showRiskForm, setShowRiskForm] = useState(false);
  const [riskText, setRiskText] = useState('');
  const [riskImpact, setRiskImpact] = useState<ConfidenceLevelValue>('MEDIUM');
  const [riskProbability, setRiskProbability] = useState<ConfidenceLevelValue>('MEDIUM');
  const [riskSaving, setRiskSaving] = useState(false);

  const [showCatalystForm, setShowCatalystForm] = useState(false);
  const [catalystText, setCatalystText] = useState('');
  const [catalystTimeframe, setCatalystTimeframe] = useState('');
  const [catalystImpact, setCatalystImpact] = useState<ConfidenceLevelValue>('MEDIUM');
  const [catalystSaving, setCatalystSaving] = useState(false);

  const [error, setError] = useState<string | null>(null);

  async function handleAddRisk(event: React.FormEvent) {
    event.preventDefault();
    if (!riskText.trim()) return;
    setRiskSaving(true);
    setError(null);
    try {
      await createInvestmentCaseRisk(caseId, { risk: riskText.trim(), impact: riskImpact, probability: riskProbability });
      await onChanged();
      setRiskText('');
      setShowRiskForm(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add the risk.');
    } finally {
      setRiskSaving(false);
    }
  }

  async function handleRiskStatus(riskId: string, status: RiskStatusValue) {
    try {
      await updateInvestmentCaseRisk(caseId, riskId, { status });
      await onChanged();
    } catch {
      // best-effort
    }
  }

  async function handleDeleteRisk(riskId: string) {
    try {
      await deleteInvestmentCaseRisk(caseId, riskId);
      await onChanged();
    } catch {
      // best-effort
    }
  }

  async function handleAddCatalyst(event: React.FormEvent) {
    event.preventDefault();
    if (!catalystText.trim() || !catalystTimeframe.trim()) return;
    setCatalystSaving(true);
    setError(null);
    try {
      await createInvestmentCaseCatalyst(caseId, { catalyst: catalystText.trim(), timeframe: catalystTimeframe.trim(), potentialImpact: catalystImpact });
      await onChanged();
      setCatalystText('');
      setCatalystTimeframe('');
      setShowCatalystForm(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add the catalyst.');
    } finally {
      setCatalystSaving(false);
    }
  }

  async function handleCatalystStatus(catalystId: string, status: CatalystStatusValue) {
    try {
      await updateInvestmentCaseCatalyst(caseId, catalystId, { status });
      await onChanged();
    } catch {
      // best-effort
    }
  }

  async function handleDeleteCatalyst(catalystId: string) {
    try {
      await deleteInvestmentCaseCatalyst(caseId, catalystId);
      await onChanged();
    } catch {
      // best-effort
    }
  }

  return (
    <section>
      <h2 className="text-ink font-serif text-lg">Risks &amp; Catalysts</h2>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}

      <div className="mt-4 grid gap-8 sm:grid-cols-2">
        <div>
          <div className="flex items-center justify-between">
            <h3 className="text-ink text-sm font-medium">Risks</h3>
            <button type="button" onClick={() => setShowRiskForm((s) => !s)} className="text-accent text-xs font-medium">
              {showRiskForm ? 'Cancel' : '+ Add Risk'}
            </button>
          </div>
          {showRiskForm && (
            <form onSubmit={handleAddRisk} className="border-ink/10 bg-ink/[0.02] mt-2 space-y-2 rounded-lg border p-3">
              <textarea value={riskText} onChange={(e) => setRiskText(e.target.value)} rows={2} placeholder="Describe the risk…" className="border-ink/15 bg-paper text-ink w-full rounded-lg border px-2 py-1.5 text-sm" />
              <div className="flex gap-2">
                <select value={riskImpact} onChange={(e) => setRiskImpact(e.target.value as ConfidenceLevelValue)} className="border-ink/15 bg-paper text-ink flex-1 rounded-lg border px-2 py-1.5 text-sm">
                  {LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {formatConfidence(l)} impact
                    </option>
                  ))}
                </select>
                <select value={riskProbability} onChange={(e) => setRiskProbability(e.target.value as ConfidenceLevelValue)} className="border-ink/15 bg-paper text-ink flex-1 rounded-lg border px-2 py-1.5 text-sm">
                  {LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {formatConfidence(l)} probability
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" disabled={riskSaving} className="bg-accent rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
                {riskSaving ? 'Saving…' : 'Add Risk'}
              </button>
            </form>
          )}
          <ul className="mt-3 space-y-2">
            {risks.length === 0 && <p className="text-ink/40 text-sm">No risks tracked yet.</p>}
            {risks.map((r) => (
              <li key={r.id} className="border-ink/10 rounded-lg border p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-ink">{r.risk}</p>
                  <button type="button" onClick={() => handleDeleteRisk(r.id)} className="text-ink/30 shrink-0 text-xs hover:text-red-700">
                    Remove
                  </button>
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs">
                  <span className="text-ink/40">
                    {formatConfidence(r.impact)} impact{r.probability ? ` · ${formatConfidence(r.probability)} probability` : ''}
                  </span>
                  <select value={r.status} onChange={(e) => handleRiskStatus(r.id, e.target.value as RiskStatusValue)} className="border-ink/15 bg-paper text-ink rounded border px-1.5 py-0.5 text-xs">
                    {RISK_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {RISK_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <h3 className="text-ink text-sm font-medium">Catalysts</h3>
            <button type="button" onClick={() => setShowCatalystForm((s) => !s)} className="text-accent text-xs font-medium">
              {showCatalystForm ? 'Cancel' : '+ Add Catalyst'}
            </button>
          </div>
          {showCatalystForm && (
            <form onSubmit={handleAddCatalyst} className="border-ink/10 bg-ink/[0.02] mt-2 space-y-2 rounded-lg border p-3">
              <textarea value={catalystText} onChange={(e) => setCatalystText(e.target.value)} rows={2} placeholder="Describe the catalyst…" className="border-ink/15 bg-paper text-ink w-full rounded-lg border px-2 py-1.5 text-sm" />
              <div className="flex gap-2">
                <input type="text" value={catalystTimeframe} onChange={(e) => setCatalystTimeframe(e.target.value)} placeholder="Timeframe (e.g. Q3 2026)" className="border-ink/15 bg-paper text-ink flex-1 rounded-lg border px-2 py-1.5 text-sm" />
                <select value={catalystImpact} onChange={(e) => setCatalystImpact(e.target.value as ConfidenceLevelValue)} className="border-ink/15 bg-paper text-ink flex-1 rounded-lg border px-2 py-1.5 text-sm">
                  {LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {formatConfidence(l)} impact
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" disabled={catalystSaving} className="bg-accent rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
                {catalystSaving ? 'Saving…' : 'Add Catalyst'}
              </button>
            </form>
          )}
          <ul className="mt-3 space-y-2">
            {catalysts.length === 0 && <p className="text-ink/40 text-sm">No catalysts tracked yet.</p>}
            {catalysts.map((c) => (
              <li key={c.id} className="border-ink/10 rounded-lg border p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-ink">{c.catalyst}</p>
                  <button type="button" onClick={() => handleDeleteCatalyst(c.id)} className="text-ink/30 shrink-0 text-xs hover:text-red-700">
                    Remove
                  </button>
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs">
                  <span className="text-ink/40">
                    {c.timeframe} · {formatConfidence(c.potentialImpact)} impact
                  </span>
                  <select value={c.status} onChange={(e) => handleCatalystStatus(c.id, e.target.value as CatalystStatusValue)} className="border-ink/15 bg-paper text-ink rounded border px-1.5 py-0.5 text-xs">
                    {CATALYST_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {CATALYST_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
