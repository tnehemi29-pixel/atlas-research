'use client';

import { useState } from 'react';
import {
  deleteInvestmentCaseAssumption,
  setInvestmentCaseAssumption,
  type InvestmentAssumptionMetricValue,
  type InvestmentCaseAssumptionResponse,
  type InvestmentScenarioValue,
  type ThesisChallengeResponse,
} from '@/lib/api/investmentCases';
import { ApiError } from '@/lib/api/companies';
import { ASSUMPTION_METRIC_LABELS } from '@/lib/investmentCase/assumptionLabels';
import { ASSUMPTION_SCENARIO_LABELS, formatConfidence } from '@/lib/utils/investmentCaseDisplay';

const METRICS: InvestmentAssumptionMetricValue[] = ['REVENUE_GROWTH', 'REVENUE_CAGR', 'OPERATING_MARGIN', 'FCF_MARGIN', 'WACC', 'TERMINAL_GROWTH', 'EXIT_MULTIPLE', 'EPS_GROWTH', 'DEBT', 'SHARE_COUNT'];
const SCENARIOS: InvestmentScenarioValue[] = ['BULL', 'BASE', 'BEAR'];

/** Spec sections 4-6 — thesis assumptions, connected to live data via the
 * deterministic Thesis Challenge Engine. A "Potential Challenge" is always
 * framed as exactly that (never "thesis broken") and is only ever computed
 * for BASE-scenario assumptions — see lib/investmentCase/thesisChallengeEngine.ts. */
export function AssumptionsPanel({
  caseId,
  assumptions,
  challenges,
  onChanged,
}: {
  caseId: string;
  assumptions: InvestmentCaseAssumptionResponse[];
  challenges: ThesisChallengeResponse[];
  onChanged: () => Promise<void>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [metric, setMetric] = useState<InvestmentAssumptionMetricValue>('REVENUE_GROWTH');
  const [scenario, setScenario] = useState<InvestmentScenarioValue>('BASE');
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState('ratio');
  const [source, setSource] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const challengesByMetric = new Map(challenges.map((c) => [c.metric, c]));

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || !unit.trim() || !source.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await setInvestmentCaseAssumption(caseId, { metric, scenario, value: parsed, unit: unit.trim(), asOfDate: new Date().toISOString(), source: source.trim() });
      await onChanged();
      setValue('');
      setSource('');
      setShowForm(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save the assumption.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(assumptionId: string) {
    try {
      await deleteInvestmentCaseAssumption(caseId, assumptionId);
      await onChanged();
    } catch {
      // best-effort; a refresh reconciles
    }
  }

  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="text-ink font-serif text-lg">Key Assumptions</h2>
        <button type="button" onClick={() => setShowForm((s) => !s)} className="text-accent text-sm font-medium">
          {showForm ? 'Cancel' : '+ Add Assumption'}
        </button>
      </div>
      <p className="text-ink/50 mt-1 text-sm">
        Tracked per Bull/Base/Bear scenario. BASE-scenario assumptions are compared against live data below — every gap is
        flagged as a <span className="font-medium">Potential Challenge</span>, never an automatic conclusion.
      </p>

      {showForm && (
        <form onSubmit={handleAdd} className="border-ink/10 bg-ink/[0.02] mt-4 grid gap-3 rounded-lg border p-4 sm:grid-cols-5">
          <select value={metric} onChange={(e) => setMetric(e.target.value as InvestmentAssumptionMetricValue)} className="border-ink/15 bg-paper text-ink rounded-lg border px-2 py-2 text-sm">
            {METRICS.map((m) => (
              <option key={m} value={m}>
                {ASSUMPTION_METRIC_LABELS[m]}
              </option>
            ))}
          </select>
          <select value={scenario} onChange={(e) => setScenario(e.target.value as InvestmentScenarioValue)} className="border-ink/15 bg-paper text-ink rounded-lg border px-2 py-2 text-sm">
            {SCENARIOS.map((s) => (
              <option key={s} value={s}>
                {ASSUMPTION_SCENARIO_LABELS[s]}
              </option>
            ))}
          </select>
          <input type="number" step="any" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Value" className="border-ink/15 bg-paper text-ink rounded-lg border px-2 py-2 text-sm" />
          <input type="text" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Unit (ratio, x, $)" className="border-ink/15 bg-paper text-ink rounded-lg border px-2 py-2 text-sm" />
          <input type="text" value={source} onChange={(e) => setSource(e.target.value)} placeholder="Source" className="border-ink/15 bg-paper text-ink rounded-lg border px-2 py-2 text-sm" />
          <button type="submit" disabled={saving} className="bg-accent col-span-full rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 sm:w-auto">
            {saving ? 'Saving…' : 'Save Assumption'}
          </button>
        </form>
      )}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}

      {assumptions.length === 0 ? (
        <p className="text-ink/40 mt-4 text-sm">No assumptions tracked yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[700px] border-collapse text-sm">
            <thead>
              <tr className="border-ink/10 text-ink/50 border-b text-left text-xs font-medium uppercase tracking-wide">
                <th className="py-2 pr-4">Metric</th>
                <th className="py-2 pr-4">Scenario</th>
                <th className="py-2 pr-4">Value</th>
                <th className="py-2 pr-4">Source</th>
                <th className="py-2 pr-4">Confidence</th>
                <th className="py-2 pr-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {assumptions.map((a) => {
                const challenge = a.scenario === 'BASE' ? challengesByMetric.get(a.metric) : undefined;
                return (
                  <tr key={a.id}>
                    <td className="py-2 pr-4">{ASSUMPTION_METRIC_LABELS[a.metric]}</td>
                    <td className="py-2 pr-4">{ASSUMPTION_SCENARIO_LABELS[a.scenario]}</td>
                    <td className="py-2 pr-4">
                      {a.value} {a.unit}
                    </td>
                    <td className="text-ink/60 py-2 pr-4">{a.source}</td>
                    <td className="text-ink/60 py-2 pr-4">{formatConfidence(a.confidence)}</td>
                    <td className="py-2 pr-4 text-right">
                      <button type="button" onClick={() => handleDelete(a.id)} className="text-ink/30 text-xs hover:text-red-700">
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {challenges.length > 0 && (
            <div className="mt-4 space-y-2">
              {challenges.map((c) => (
                <div key={c.metric} className="rounded-lg border border-orange-300 bg-orange-50 px-3 py-2 text-sm text-orange-900">
                  <span className="font-medium">Potential Challenge — {c.label}:</span> {c.trigger} Difference:{' '}
                  {c.differenceKind === 'PERCENTAGE_POINTS' ? `${(c.difference * 100).toFixed(1)} percentage points` : `${(c.difference * 100).toFixed(1)}%`} vs.{' '}
                  {c.source}. Affects: {c.affectedAreas.join(', ')}.
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
