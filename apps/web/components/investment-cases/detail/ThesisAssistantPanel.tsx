'use client';

import { useState } from 'react';
import { askInvestmentThesisAssistant } from '@/lib/api/investmentCases';
import { ApiError } from '@/lib/api/companies';

interface Exchange {
  question: string;
  answer: string;
  citedEvidenceIds: string[];
  citedResearchEventIds: string[];
  caveats: string[];
}

/** Spec section 9 — the AI Thesis Assistant. Strictly synthesizes, compares,
 * explains, identifies conflicts, and surfaces questions over this case's
 * own real data; it never predicts, guarantees, invents, decides, alters a
 * model, or gives personalized advice (enforced server-side — see
 * lib/ai/investmentThesisPrompts.ts). Every citation shown here was
 * re-verified against real evidence/research-event ids before being
 * returned. */
export function ThesisAssistantPanel({ caseId }: { caseId: string }) {
  const [question, setQuestion] = useState('');
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAsk(event: React.FormEvent) {
    event.preventDefault();
    if (!question.trim()) return;
    setAsking(true);
    setError(null);
    const asked = question.trim();
    try {
      const result = await askInvestmentThesisAssistant(caseId, asked);
      setExchanges((prev) => [
        { question: asked, answer: result.payload.answer, citedEvidenceIds: result.payload.cited_evidence_ids, citedResearchEventIds: result.payload.cited_research_event_ids, caveats: result.payload.caveats },
        ...prev,
      ]);
      setQuestion('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The thesis assistant is unavailable right now.');
    } finally {
      setAsking(false);
    }
  }

  return (
    <section>
      <h2 className="text-ink font-serif text-lg">AI Thesis Assistant</h2>
      <p className="text-ink/50 mt-1 text-sm">
        Synthesizes, compares, and surfaces questions from this case&apos;s own real data — it never predicts returns,
        invents facts, or makes the investment decision for you.
      </p>

      <form onSubmit={handleAsk} className="mt-4 flex gap-2">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. What evidence contradicts the core thesis?"
          className="border-ink/15 bg-paper text-ink flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
        <button type="submit" disabled={asking || !question.trim()} className="bg-accent shrink-0 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {asking ? 'Asking…' : 'Ask'}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}

      {exchanges.length > 0 && (
        <ul className="mt-4 space-y-4">
          {exchanges.map((ex, i) => (
            <li key={i} className="border-ink/10 rounded-lg border p-4">
              <p className="text-ink/50 text-xs font-medium uppercase tracking-wide">Q: {ex.question}</p>
              <p className="text-ink mt-2 text-sm">{ex.answer}</p>
              {(ex.citedEvidenceIds.length > 0 || ex.citedResearchEventIds.length > 0) && (
                <p className="text-ink/40 mt-2 text-xs">
                  Cited: {ex.citedEvidenceIds.length} evidence item(s), {ex.citedResearchEventIds.length} research event(s).
                </p>
              )}
              {ex.caveats.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {ex.caveats.map((c, j) => (
                    <li key={j} className="text-ink/40 text-xs">
                      · {c}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
