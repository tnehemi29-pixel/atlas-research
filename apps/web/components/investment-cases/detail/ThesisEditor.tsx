'use client';

import { useState } from 'react';
import { updateInvestmentCase, type InvestmentCaseDetailResponse } from '@/lib/api/investmentCases';
import { ApiError } from '@/lib/api/companies';

function ListEditor({ label, items, onSave, placeholder }: { label: string; items: string[]; onSave: (items: string[]) => Promise<void>; placeholder: string }) {
  const [draft, setDraft] = useState(items.join('\n'));
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(draft.split('\n').map((s) => s.trim()).filter(Boolean));
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-ink/60 text-xs font-medium">{label}</span>
        {dirty && (
          <button type="button" onClick={handleSave} disabled={saving} className="text-accent text-xs font-medium disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        )}
      </div>
      <textarea
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setDirty(true);
        }}
        rows={3}
        placeholder={placeholder}
        className="border-ink/15 bg-paper text-ink mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
      />
      <p className="text-ink/30 mt-1 text-xs">One item per line.</p>
    </div>
  );
}

function TextEditor({ label, value, onSave, placeholder, rows = 3 }: { label: string; value: string; onSave: (value: string) => Promise<void>; placeholder: string; rows?: number }) {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(draft);
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-ink/60 text-xs font-medium">{label}</span>
        {dirty && (
          <button type="button" onClick={handleSave} disabled={saving} className="text-accent text-xs font-medium disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        )}
      </div>
      <textarea
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setDirty(true);
        }}
        rows={rows}
        placeholder={placeholder}
        className="border-ink/15 bg-paper text-ink mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
      />
    </div>
  );
}

/** Spec section 3 (structured thesis editor — never one blob) and section
 * 20 ("What Would Change My Mind?"). Every field saves independently, and
 * nothing here ever writes InvestmentCase.status — that's a separate,
 * always-explicit control in the page header. */
export function ThesisEditor({ caseData, onUpdated }: { caseData: InvestmentCaseDetailResponse; onUpdated: () => Promise<void> }) {
  const [error, setError] = useState<string | null>(null);

  async function save(field: Parameters<typeof updateInvestmentCase>[1]) {
    setError(null);
    try {
      await updateInvestmentCase(caseData.id, field);
      await onUpdated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save.');
      throw err;
    }
  }

  return (
    <section>
      <h2 className="text-ink font-serif text-lg">Investment Thesis</h2>
      <p className="text-ink/50 mt-1 text-sm">A structured thesis, not a single blob — each component edits and saves independently.</p>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}

      <div className="mt-4 space-y-5">
        <TextEditor label="Core Thesis" value={caseData.coreThesis} onSave={(coreThesis) => save({ coreThesis })} placeholder="The core investment thesis…" rows={4} />
        <ListEditor label="Key Drivers" items={caseData.keyDrivers} onSave={(keyDrivers) => save({ keyDrivers })} placeholder="e.g. Services mix shift expanding gross margin" />

        <div className="grid gap-4 sm:grid-cols-3">
          <TextEditor label="Bull Case Summary" value={caseData.bullSummary ?? ''} onSave={(bullSummary) => save({ bullSummary: bullSummary || null })} placeholder="What has to go right…" />
          <TextEditor label="Base Case Summary" value={caseData.baseSummary ?? ''} onSave={(baseSummary) => save({ baseSummary: baseSummary || null })} placeholder="The expected path…" />
          <TextEditor label="Bear Case Summary" value={caseData.bearSummary ?? ''} onSave={(bearSummary) => save({ bearSummary: bearSummary || null })} placeholder="What could go wrong…" />
        </div>

        <div>
          <h3 className="text-ink font-serif text-base">What Would Change My Mind?</h3>
          <p className="text-ink/50 mt-1 text-sm">Written down in advance — never inferred after the fact.</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <ListEditor label="Would Strengthen the Thesis" items={caseData.strengthenIndicators} onSave={(strengthenIndicators) => save({ strengthenIndicators })} placeholder="e.g. Services growth reaccelerates above 15%" />
            <ListEditor label="Would Weaken the Thesis" items={caseData.weakenIndicators} onSave={(weakenIndicators) => save({ weakenIndicators })} placeholder="e.g. Gross margin contracts 200bps" />
            <ListEditor label="Would Invalidate the Thesis" items={caseData.invalidateIndicators} onSave={(invalidateIndicators) => save({ invalidateIndicators })} placeholder="e.g. Loses a top-3 customer" />
          </div>
        </div>
      </div>
    </section>
  );
}
