'use client';

import { useState } from 'react';
import {
  createInvestmentCaseInvalidationCriterion,
  deleteInvestmentCaseInvalidationCriterion,
  updateInvestmentCaseInvalidationCriterion,
  type InvalidationComparatorValue,
  type InvalidationEvaluationResponse,
  type InvestmentAssumptionMetricValue,
  type InvestmentCaseInvalidationCriterionResponse,
} from '@/lib/api/investmentCases';
import { ApiError } from '@/lib/api/companies';
import { ASSUMPTION_METRIC_LABELS } from '@/lib/investmentCase/assumptionLabels';

const METRICS: InvestmentAssumptionMetricValue[] = ['REVENUE_GROWTH', 'REVENUE_CAGR', 'OPERATING_MARGIN', 'FCF_MARGIN', 'WACC', 'TERMINAL_GROWTH', 'EXIT_MULTIPLE', 'EPS_GROWTH', 'DEBT', 'SHARE_COUNT'];
const COMPARATORS: { value: InvalidationComparatorValue; label: string }[] = [
  { value: 'LESS_THAN', label: 'is below' },
  { value: 'LESS_THAN_OR_EQUAL', label: 'is at or below' },
  { value: 'GREATER_THAN', label: 'is above' },
  { value: 'GREATER_THAN_OR_EQUAL', label: 'is at or above' },
];

/** Spec section 11 — user-defined invalidation criteria. A "Potentially
 * Met" evaluation is always advisory (computed live, never written by the
 * system) — the user resolves it explicitly via the status control below;
 * nothing here ever changes InvestmentCase.status on its own. */
export function InvalidationCriteriaPanel({
  caseId,
  criteria,
  evaluations,
  onChanged,
}: {
  caseId: string;
  criteria: InvestmentCaseInvalidationCriterionResponse[];
  evaluations: InvalidationEvaluationResponse[];
  onChanged: () => Promise<void>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [description, setDescription] = useState('');
  const [quantitative, setQuantitative] = useState(false);
  const [metric, setMetric] = useState<InvestmentAssumptionMetricValue>('REVENUE_GROWTH');
  const [comparator, setComparator] = useState<InvalidationComparatorValue>('LESS_THAN');
  const [threshold, setThreshold] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const evaluationByCriterion = new Map(evaluations.map((e) => [e.criterionId, e]));

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    if (!description.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await createInvestmentCaseInvalidationCriterion(caseId, {
        description: description.trim(),
        metric: quantitative ? metric : null,
        comparator: quantitative ? comparator : null,
        thresholdValue: quantitative && threshold.trim() ? Number(threshold) : null,
      });
      await onChanged();
      setDescription('');
      setThreshold('');
      setShowForm(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add the criterion.');
    } finally {
      setSaving(false);
    }
  }

  async function handleResolve(criterionId: string) {
    try {
      await updateInvestmentCaseInvalidationCriterion(caseId, criterionId, { status: 'RESOLVED' });
      await onChanged();
    } catch {
      // best-effort
    }
  }

  async function handleDelete(criterionId: string) {
    try {
      await deleteInvestmentCaseInvalidationCriterion(caseId, criterionId);
      await onChanged();
    } catch {
      // best-effort
    }
  }

  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="text-ink font-serif text-lg">Invalidation Criteria</h2>
        <button type="button" onClick={() => setShowForm((s) => !s)} className="text-accent text-sm font-medium">
          {showForm ? 'Cancel' : '+ Add Criterion'}
        </button>
      </div>
      <p className="text-ink/50 mt-1 text-sm">
        Written down in advance. A live &quot;Potentially Met&quot; flag is only ever advisory — it never auto-invalidates
        the thesis; you decide how to resolve it.
      </p>

      {showForm && (
        <form onSubmit={handleAdd} className="border-ink/10 bg-ink/[0.02] mt-4 space-y-3 rounded-lg border p-4">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Describe the criterion…" className="border-ink/15 bg-paper text-ink w-full rounded-lg border px-3 py-2 text-sm" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={quantitative} onChange={(e) => setQuantitative(e.target.checked)} />
            Machine-checkable against a metric (optional — otherwise purely qualitative)
          </label>
          {quantitative && (
            <div className="grid gap-3 sm:grid-cols-3">
              <select value={metric} onChange={(e) => setMetric(e.target.value as InvestmentAssumptionMetricValue)} className="border-ink/15 bg-paper text-ink rounded-lg border px-2 py-2 text-sm">
                {METRICS.map((m) => (
                  <option key={m} value={m}>
                    {ASSUMPTION_METRIC_LABELS[m]}
                  </option>
                ))}
              </select>
              <select value={comparator} onChange={(e) => setComparator(e.target.value as InvalidationComparatorValue)} className="border-ink/15 bg-paper text-ink rounded-lg border px-2 py-2 text-sm">
                {COMPARATORS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              <input type="number" step="any" value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder="Threshold" className="border-ink/15 bg-paper text-ink rounded-lg border px-2 py-2 text-sm" />
            </div>
          )}
          <button type="submit" disabled={saving} className="bg-accent rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {saving ? 'Saving…' : 'Add Criterion'}
          </button>
        </form>
      )}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}

      {criteria.length === 0 ? (
        <p className="text-ink/40 mt-4 text-sm">No invalidation criteria defined yet.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {criteria.map((c) => {
            const evaluation = evaluationByCriterion.get(c.id);
            const potentiallyMet = evaluation?.potentiallyMet ?? false;
            return (
              <li key={c.id} className={`rounded-lg border p-3 text-sm ${potentiallyMet ? 'border-red-300 bg-red-50' : 'border-ink/10'}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-ink">{c.description}</p>
                  <button type="button" onClick={() => handleDelete(c.id)} className="text-ink/30 shrink-0 text-xs hover:text-red-700">
                    Remove
                  </button>
                </div>
                {evaluation && (
                  <p className={`mt-1 text-xs ${potentiallyMet ? 'text-red-800' : 'text-ink/40'}`}>
                    {potentiallyMet && <span className="font-medium">Potentially Met — </span>}
                    {evaluation.reason}
                  </p>
                )}
                {potentiallyMet && c.status !== 'RESOLVED' && (
                  <button type="button" onClick={() => handleResolve(c.id)} className="text-accent mt-2 text-xs font-medium">
                    Mark Reviewed / Resolved
                  </button>
                )}
                {c.status === 'RESOLVED' && <span className="text-ink/30 mt-2 block text-xs">Resolved.</span>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
