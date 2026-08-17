'use client';

import { useState } from 'react';
import {
  createInvestmentCaseEvidence,
  deleteInvestmentCaseEvidence,
  type EvidenceDirectionValue,
  type EvidenceSourceTypeValue,
  type InvestmentCaseEvidenceResponse,
  type ConfidenceLevelValue,
} from '@/lib/api/investmentCases';
import { ApiError } from '@/lib/api/companies';
import { formatDate } from '@/lib/utils/format';
import { EVIDENCE_DIRECTION_LABELS, EVIDENCE_DIRECTION_STYLE, EVIDENCE_SOURCE_TYPE_LABELS, formatConfidence } from '@/lib/utils/investmentCaseDisplay';

const DIRECTIONS: EvidenceDirectionValue[] = ['SUPPORTS', 'CONTRADICTS', 'NEUTRAL'];
const STRENGTHS: ConfidenceLevelValue[] = ['LOW', 'MEDIUM', 'HIGH'];
const SOURCE_TYPES: EvidenceSourceTypeValue[] = ['TEN_K', 'TEN_Q', 'EIGHT_K', 'EARNINGS_CALL', 'FINANCIAL_STATEMENT', 'DCF', 'COMPS', 'HISTORICAL_VALIDATION', 'RESEARCH_EVENT'];
const ROW_BACKED: ReadonlySet<EvidenceSourceTypeValue> = new Set(['TEN_K', 'TEN_Q', 'EIGHT_K', 'EARNINGS_CALL', 'RESEARCH_EVENT']);

function rowIdField(sourceType: EvidenceSourceTypeValue): 'secFilingId' | 'earningsCallId' | 'researchEventId' | null {
  if (sourceType === 'TEN_K' || sourceType === 'TEN_Q' || sourceType === 'EIGHT_K') return 'secFilingId';
  if (sourceType === 'EARNINGS_CALL') return 'earningsCallId';
  if (sourceType === 'RESEARCH_EVENT') return 'researchEventId';
  return null;
}

/** Spec sections 7-9 — the Evidence Matrix. Every item must resolve to a
 * real, company-scoped Atlas record (row-backed source types require a
 * real filing/call/event id — see lib/investmentCase/evidenceValidation.ts)
 * or a plain, honestly-labeled non-row source (financials/DCF/comps/
 * historical validation). Rejections surface the backend's own reason. */
export function EvidenceMatrix({ caseId, evidence, onChanged }: { caseId: string; evidence: InvestmentCaseEvidenceResponse[]; onChanged: () => Promise<void> }) {
  const [showForm, setShowForm] = useState(false);
  const [claim, setClaim] = useState('');
  const [evidenceText, setEvidenceText] = useState('');
  const [category, setCategory] = useState('');
  const [direction, setDirection] = useState<EvidenceDirectionValue>('SUPPORTS');
  const [strength, setStrength] = useState<ConfidenceLevelValue>('MEDIUM');
  const [sourceType, setSourceType] = useState<EvidenceSourceTypeValue>('FINANCIAL_STATEMENT');
  const [sourceLabel, setSourceLabel] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    if (!claim.trim() || !evidenceText.trim() || !category.trim() || !sourceLabel.trim()) return;
    const idField = rowIdField(sourceType);
    if (idField && !sourceId.trim()) {
      setError('This source type requires a real Atlas record id (e.g. the filing id from its detail-page URL).');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createInvestmentCaseEvidence(caseId, {
        claim: claim.trim(),
        evidence: evidenceText.trim(),
        date: new Date().toISOString(),
        category: category.trim(),
        direction,
        strength,
        sourceType,
        sourceLabel: sourceLabel.trim(),
        secFilingId: idField === 'secFilingId' ? sourceId.trim() : null,
        earningsCallId: idField === 'earningsCallId' ? sourceId.trim() : null,
        researchEventId: idField === 'researchEventId' ? sourceId.trim() : null,
      });
      await onChanged();
      setClaim('');
      setEvidenceText('');
      setCategory('');
      setSourceLabel('');
      setSourceId('');
      setShowForm(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add the evidence item.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(evidenceId: string) {
    try {
      await deleteInvestmentCaseEvidence(caseId, evidenceId);
      await onChanged();
    } catch {
      // best-effort; a refresh reconciles
    }
  }

  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="text-ink font-serif text-lg">Evidence Matrix</h2>
        <button type="button" onClick={() => setShowForm((s) => !s)} className="text-accent text-sm font-medium">
          {showForm ? 'Cancel' : '+ Add Evidence'}
        </button>
      </div>
      <p className="text-ink/50 mt-1 text-sm">
        Every item must link to a real, verifiable Atlas source — a filing, earnings call, research event, or a plain
        labeled model source. Nothing is accepted without one.
      </p>

      {showForm && (
        <form onSubmit={handleAdd} className="border-ink/10 bg-ink/[0.02] mt-4 space-y-3 rounded-lg border p-4">
          <input type="text" value={claim} onChange={(e) => setClaim(e.target.value)} placeholder="Claim (what this evidence says)" className="border-ink/15 bg-paper text-ink w-full rounded-lg border px-3 py-2 text-sm" />
          <textarea value={evidenceText} onChange={(e) => setEvidenceText(e.target.value)} rows={2} placeholder="Evidence detail" className="border-ink/15 bg-paper text-ink w-full rounded-lg border px-3 py-2 text-sm" />
          <div className="grid gap-3 sm:grid-cols-3">
            <input type="text" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category (e.g. Growth)" className="border-ink/15 bg-paper text-ink rounded-lg border px-2 py-2 text-sm" />
            <select value={direction} onChange={(e) => setDirection(e.target.value as EvidenceDirectionValue)} className="border-ink/15 bg-paper text-ink rounded-lg border px-2 py-2 text-sm">
              {DIRECTIONS.map((d) => (
                <option key={d} value={d}>
                  {EVIDENCE_DIRECTION_LABELS[d]}
                </option>
              ))}
            </select>
            <select value={strength} onChange={(e) => setStrength(e.target.value as ConfidenceLevelValue)} className="border-ink/15 bg-paper text-ink rounded-lg border px-2 py-2 text-sm">
              {STRENGTHS.map((s) => (
                <option key={s} value={s}>
                  {formatConfidence(s)} strength
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <select value={sourceType} onChange={(e) => setSourceType(e.target.value as EvidenceSourceTypeValue)} className="border-ink/15 bg-paper text-ink rounded-lg border px-2 py-2 text-sm">
              {SOURCE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {EVIDENCE_SOURCE_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            <input type="text" value={sourceLabel} onChange={(e) => setSourceLabel(e.target.value)} placeholder="Source label (e.g. Q2 2026 10-Q)" className="border-ink/15 bg-paper text-ink rounded-lg border px-2 py-2 text-sm" />
            {ROW_BACKED.has(sourceType) && (
              <input type="text" value={sourceId} onChange={(e) => setSourceId(e.target.value)} placeholder="Atlas record id" className="border-ink/15 bg-paper text-ink rounded-lg border px-2 py-2 text-sm" />
            )}
          </div>
          <button type="submit" disabled={saving} className="bg-accent rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {saving ? 'Saving…' : 'Add Evidence'}
          </button>
        </form>
      )}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}

      {evidence.length === 0 ? (
        <p className="text-ink/40 mt-4 text-sm">No evidence recorded yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-black/5">
          {evidence.map((e) => (
            <li key={e.id} className="py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${EVIDENCE_DIRECTION_STYLE[e.direction]}`}>{EVIDENCE_DIRECTION_LABELS[e.direction]}</span>
                    <span className="text-ink/40 text-xs">{e.category}</span>
                    <span className="text-ink/40 text-xs">· {formatConfidence(e.strength)} strength</span>
                  </div>
                  <p className="text-ink mt-1 text-sm font-medium">{e.claim}</p>
                  <p className="text-ink/60 mt-0.5 text-sm">{e.evidence}</p>
                  <p className="text-ink/40 mt-1 text-xs">
                    {EVIDENCE_SOURCE_TYPE_LABELS[e.sourceType]} — {e.sourceLabel} · {formatDate(e.date)}
                  </p>
                </div>
                <button type="button" onClick={() => handleDelete(e.id)} className="text-ink/30 shrink-0 text-xs hover:text-red-700">
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
