import type { ResearchDcfAnalysis } from '@/lib/research/types';
import { formatCompactCurrency, formatPrice, formatRatioAsPercent } from '@/lib/utils/format';
import { NarrativeSection } from './NarrativeSection';

/** A distinct, comparison-first framing of the same Bear/Base/Bull DCF
 * outputs DcfAnalysisSection already shows in full assumption detail — this
 * section is about what differs between scenarios, not how each one is
 * built. "Do NOT let the LLM invent scenario numbers" — every value below is
 * read directly off ResearchDcfAnalysis, never generated. */
export function ScenarioAnalysisSection({ dcf, narrative }: { dcf: ResearchDcfAnalysis | null; narrative: { text: string; source_ids: number[] } }) {
  return (
    <NarrativeSection
      id="scenario-analysis"
      title="Scenario Analysis"
      data={narrative}
      extra={
        !dcf ? (
          <p className="text-ink/50 mb-3 text-sm italic">No scenario analysis is available without a DCF model.</p>
        ) : (
          <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {dcf.scenarios.map((s) => (
              <div key={s.label} className="border-ink/10 rounded-lg border p-3">
                <p className="text-ink text-sm font-medium">{s.label} Case</p>
                <dl className="mt-2 space-y-1 text-xs">
                  <div className="flex justify-between">
                    <dt className="text-ink/50">Revenue</dt>
                    <dd className="text-ink">{formatCompactCurrency(s.finalYearRevenue)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink/50">Op. Margin</dt>
                    <dd className="text-ink">{formatRatioAsPercent(s.finalYearOperatingMargin)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink/50">FCF</dt>
                    <dd className="text-ink">{formatCompactCurrency(s.finalYearUnleveredFcf)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink/50">WACC</dt>
                    <dd className="text-ink">{formatRatioAsPercent(s.wacc)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink/50">Terminal Growth</dt>
                    <dd className="text-ink">{formatRatioAsPercent(s.terminalGrowthRate)}</dd>
                  </div>
                  <div className="border-ink/10 flex justify-between border-t pt-1 font-medium">
                    <dt className="text-ink/70">Implied Price</dt>
                    <dd className="text-ink">{formatPrice(s.impliedSharePrice)}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        )
      }
    />
  );
}
