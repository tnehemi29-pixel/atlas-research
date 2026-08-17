'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { InvestmentMemoContentResponse } from '@/lib/api/investmentCases';
import { INVESTMENT_CASE_STATUS_LABELS, EVIDENCE_DIRECTION_LABELS, EVIDENCE_SOURCE_TYPE_LABELS, ASSUMPTION_SCENARIO_LABELS, formatConfidence } from '@/lib/utils/investmentCaseDisplay';
import { formatDate, formatPrice, formatRatioAsPercent, formatCompactCurrency, formatMultiple } from '@/lib/utils/format';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-ink/10 break-inside-avoid border-t pt-6">
      <h2 className="text-ink font-serif text-lg">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Spec sections 21-23 — the 16-section memo document plus Investment
 * Committee presentation mode (a print-friendly toggle, not a separate
 * document). Every figure below comes straight from the memo's own frozen
 * `content` — nothing here recalculates or re-fetches anything live. */
export function MemoDocument({
  caseId,
  ticker,
  status,
  createdAt,
  model,
  content,
}: {
  caseId: string;
  ticker: string;
  status: 'SUCCESS' | 'FAILED';
  createdAt: string;
  model: string | null;
  content: InvestmentMemoContentResponse;
}) {
  const [committeeMode, setCommitteeMode] = useState(false);

  return (
    <main className={`mx-auto max-w-4xl px-6 py-12 print:max-w-none print:px-0 ${committeeMode ? 'committee-mode' : ''}`}>
      <div className="flex items-center justify-between print:hidden">
        <Link href={`/investment-cases/${caseId}`} className="text-ink/40 hover:text-accent text-sm">
          ← {ticker}
        </Link>
        <div className="flex gap-2">
          <button type="button" onClick={() => setCommitteeMode((v) => !v)} className="border-ink/15 rounded-lg border px-3 py-1.5 text-xs font-medium">
            {committeeMode ? 'Exit Committee Mode' : 'Investment Committee Mode'}
          </button>
          <button type="button" onClick={() => window.print()} className="border-ink/15 rounded-lg border px-3 py-1.5 text-xs font-medium">
            Print / Save PDF
          </button>
        </div>
      </div>

      <header className="mt-6">
        <h1 className={`text-ink font-serif ${committeeMode ? 'text-4xl' : 'text-3xl'}`}>
          {content.businessOverview.companyName} ({ticker})
        </h1>
        <p className="text-ink/50 mt-1 text-sm">
          Investment Memo · {formatDate(createdAt)} · {INVESTMENT_CASE_STATUS_LABELS[content.investmentThesis.status] ?? content.investmentThesis.status} · Horizon: {content.investmentThesis.horizon}
        </p>
        {status === 'FAILED' && (
          <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            The AI-written narrative sections (Executive Summary, Conclusion) could not be generated this time — every
            other section below is still complete, since it&apos;s assembled directly from Atlas&apos;s own data, not the AI.
          </p>
        )}
      </header>

      <div className="mt-8 space-y-8">
        <Section title="1. Executive Summary">
          {content.executiveSummary.text ? <p className="text-ink text-sm leading-relaxed">{content.executiveSummary.text}</p> : <p className="text-ink/40 text-sm">Not available.</p>}
        </Section>

        <Section title="2. Business Overview">
          <dl className="text-ink/70 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-ink/40 text-xs">Sector</dt>
              <dd>{content.businessOverview.sector ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-ink/40 text-xs">Industry</dt>
              <dd>{content.businessOverview.industry ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-ink/40 text-xs">Exchange</dt>
              <dd>{content.businessOverview.exchange ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-ink/40 text-xs">Market Cap</dt>
              <dd>{formatCompactCurrency(content.businessOverview.marketCap)}</dd>
            </div>
          </dl>
        </Section>

        <Section title="3. Investment Thesis">
          <p className="text-ink text-sm leading-relaxed">{content.investmentThesis.coreThesis}</p>
          {content.investmentThesis.keyDrivers.length > 0 && (
            <ul className="mt-2 space-y-1">
              {content.investmentThesis.keyDrivers.map((d, i) => (
                <li key={i} className="text-ink/70 text-sm">
                  · {d}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="4. Financial Analysis">
          <dl className="text-ink/70 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-ink/40 text-xs">Revenue</dt>
              <dd>{formatCompactCurrency(content.financialAnalysis.revenue)}</dd>
            </div>
            <div>
              <dt className="text-ink/40 text-xs">Revenue Growth</dt>
              <dd>{formatRatioAsPercent(content.financialAnalysis.revenueGrowth)}</dd>
            </div>
            <div>
              <dt className="text-ink/40 text-xs">Operating Margin</dt>
              <dd>{formatRatioAsPercent(content.financialAnalysis.operatingMargin)}</dd>
            </div>
            <div>
              <dt className="text-ink/40 text-xs">Free Cash Flow</dt>
              <dd>{formatCompactCurrency(content.financialAnalysis.freeCashFlow)}</dd>
            </div>
          </dl>
        </Section>

        <Section title="5. Valuation">
          <dl className="text-ink/70 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-ink/40 text-xs">Current Price</dt>
              <dd>{formatPrice(content.valuation.currentSharePrice)}</dd>
            </div>
            <div>
              <dt className="text-ink/40 text-xs">DCF Base</dt>
              <dd>{formatPrice(content.valuation.dcfBase)}</dd>
            </div>
            <div>
              <dt className="text-ink/40 text-xs">DCF Bull / Bear</dt>
              <dd>
                {formatPrice(content.valuation.dcfBull)} / {formatPrice(content.valuation.dcfBear)}
              </dd>
            </div>
            <div>
              <dt className="text-ink/40 text-xs">Comps Implied</dt>
              <dd>{formatPrice(content.valuation.compsImplied)}</dd>
            </div>
            <div>
              <dt className="text-ink/40 text-xs">EV/EBITDA</dt>
              <dd>{formatMultiple(content.valuation.evToEbitda)}</dd>
            </div>
            <div>
              <dt className="text-ink/40 text-xs">P/E</dt>
              <dd>{formatMultiple(content.valuation.peRatio)}</dd>
            </div>
          </dl>
        </Section>

        <Section title="6. Bull / Base / Bear Case">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-ink/40 text-xs font-medium uppercase">Bull</p>
              <p className="text-ink/70 mt-1 text-sm">{content.bullBaseBear.bullSummary ?? '—'}</p>
            </div>
            <div>
              <p className="text-ink/40 text-xs font-medium uppercase">Base</p>
              <p className="text-ink/70 mt-1 text-sm">{content.bullBaseBear.baseSummary ?? '—'}</p>
            </div>
            <div>
              <p className="text-ink/40 text-xs font-medium uppercase">Bear</p>
              <p className="text-ink/70 mt-1 text-sm">{content.bullBaseBear.bearSummary ?? '—'}</p>
            </div>
          </div>
          {content.bullBaseBear.assumptions.length > 0 && (
            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="text-ink/40 text-left text-xs uppercase">
                  <th className="py-1 pr-3">Metric</th>
                  <th className="py-1 pr-3">Scenario</th>
                  <th className="py-1 pr-3">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {content.bullBaseBear.assumptions.map((a, i) => (
                  <tr key={i}>
                    <td className="py-1 pr-3">{a.label}</td>
                    <td className="py-1 pr-3">{ASSUMPTION_SCENARIO_LABELS[a.scenario]}</td>
                    <td className="py-1 pr-3">
                      {a.value} {a.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section title="7. Catalysts">
          {content.catalysts.length === 0 ? (
            <p className="text-ink/40 text-sm">None recorded.</p>
          ) : (
            <ul className="space-y-1">
              {content.catalysts.map((c) => (
                <li key={c.id} className="text-ink/70 text-sm">
                  · {c.catalyst} ({c.timeframe}, {formatConfidence(c.potentialImpact)} impact)
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="8. Risks">
          {content.risks.length === 0 ? (
            <p className="text-ink/40 text-sm">None recorded.</p>
          ) : (
            <ul className="space-y-1">
              {content.risks.map((r) => (
                <li key={r.id} className="text-ink/70 text-sm">
                  · {r.risk} ({formatConfidence(r.impact)} impact)
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="9. Evidence For">
          {content.evidenceFor.length === 0 ? (
            <p className="text-ink/40 text-sm">None recorded.</p>
          ) : (
            <ul className="space-y-1">
              {content.evidenceFor.map((e) => (
                <li key={e.id} className="text-ink/70 text-sm">
                  · {e.claim} ({EVIDENCE_SOURCE_TYPE_LABELS[e.sourceType]} — {e.sourceLabel})
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="10. Evidence Against">
          {content.evidenceAgainst.length === 0 ? (
            <p className="text-ink/40 text-sm">None recorded.</p>
          ) : (
            <ul className="space-y-1">
              {content.evidenceAgainst.map((e) => (
                <li key={e.id} className="text-ink/70 text-sm">
                  · {e.claim} ({EVIDENCE_SOURCE_TYPE_LABELS[e.sourceType]} — {e.sourceLabel})
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="11. Key Assumptions">
          {content.keyAssumptions.length === 0 ? (
            <p className="text-ink/40 text-sm">None recorded.</p>
          ) : (
            <ul className="space-y-1">
              {content.keyAssumptions.map((a, i) => (
                <li key={i} className="text-ink/70 text-sm">
                  · {a.label}: {a.value} {a.unit}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="12. What Would Change My Mind?">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-ink/40 text-xs font-medium uppercase">Strengthen</p>
              <ul className="mt-1 space-y-0.5">
                {content.whatWouldChangeMyMind.strengthen.map((s, i) => (
                  <li key={i} className="text-ink/70 text-sm">
                    · {s}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-ink/40 text-xs font-medium uppercase">Weaken</p>
              <ul className="mt-1 space-y-0.5">
                {content.whatWouldChangeMyMind.weaken.map((s, i) => (
                  <li key={i} className="text-ink/70 text-sm">
                    · {s}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-ink/40 text-xs font-medium uppercase">Invalidate</p>
              <ul className="mt-1 space-y-0.5">
                {content.whatWouldChangeMyMind.invalidate.map((s, i) => (
                  <li key={i} className="text-ink/70 text-sm">
                    · {s}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Section>

        <Section title="13. Historical Validation">
          <p className="text-ink/70 text-sm">{content.historicalValidation.summary}</p>
          {content.historicalValidation.limitations.map((l, i) => (
            <p key={i} className="text-ink/40 mt-1 text-xs">
              {l}
            </p>
          ))}
        </Section>

        <Section title="14. Conclusion">
          {content.conclusion.text ? <p className="text-ink text-sm leading-relaxed">{content.conclusion.text}</p> : <p className="text-ink/40 text-sm">Not available.</p>}
        </Section>

        <Section title="15. Sources">
          <p className="text-ink/70 text-sm">
            {content.sources.evidence.length} evidence item(s), {content.sources.researchEvents.length} research event(s) cited.
          </p>
        </Section>

        <Section title="16. Methodology">
          <ul className="space-y-1">
            {content.methodology.map((m, i) => (
              <li key={i} className="text-ink/50 text-xs">
                {m}
              </li>
            ))}
          </ul>
          {model && <p className="text-ink/30 mt-2 text-xs">AI narrative model: {model}</p>}
        </Section>
      </div>
    </main>
  );
}
