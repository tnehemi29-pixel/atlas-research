import type { ResearchDcfAnalysis } from '@/lib/research/types';
import { formatCompactCurrency, formatPrice, formatRatioAsPercent } from '@/lib/utils/format';
import { NarrativeSection } from './NarrativeSection';

/** Explains lib/valuation/engine.ts's existing DCF output — never
 * recalculates it. Every number here is read straight off ResearchDcfAnalysis,
 * itself a direct re-run of the same engine components/company/valuation
 * already uses. */
export function DcfAnalysisSection({ dcf, narrative }: { dcf: ResearchDcfAnalysis | null; narrative: { text: string; source_ids: number[] } }) {
  return (
    <NarrativeSection
      id="dcf-analysis"
      title="DCF Analysis"
      data={narrative}
      extra={
        !dcf ? (
          <p className="text-ink/50 mb-3 text-sm italic">
            Insufficient historical financial data to run the DCF model for this company.
          </p>
        ) : (
          <div className="mb-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-ink/10 border-b text-left">
                  <th className="text-ink/40 py-1.5 pr-3 text-[10px] font-medium uppercase tracking-wide">Assumption / Output</th>
                  {dcf.scenarios.map((s) => (
                    <th key={s.label} className="text-ink/40 px-2 py-1.5 text-right text-[10px] font-medium uppercase tracking-wide">
                      {s.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <Row label={`Final-Year Revenue (${dcf.forecastYears}y forecast)`} scenarios={dcf.scenarios} pick={(s) => formatCompactCurrency(s.finalYearRevenue)} />
                <Row label="Final-Year Operating Margin" scenarios={dcf.scenarios} pick={(s) => formatRatioAsPercent(s.finalYearOperatingMargin)} />
                <Row label="Final-Year Unlevered FCF" scenarios={dcf.scenarios} pick={(s) => formatCompactCurrency(s.finalYearUnleveredFcf)} />
                <Row label="WACC" scenarios={dcf.scenarios} pick={(s) => formatRatioAsPercent(s.wacc)} />
                <Row label="Terminal Growth Rate" scenarios={dcf.scenarios} pick={(s) => formatRatioAsPercent(s.terminalGrowthRate)} />
                <Row label="Terminal Value Share of EV" scenarios={dcf.scenarios} pick={(s) => formatRatioAsPercent(s.terminalValueSharePct)} />
                <Row label="Enterprise Value" scenarios={dcf.scenarios} pick={(s) => formatCompactCurrency(s.enterpriseValue)} />
                <Row label="Equity Value" scenarios={dcf.scenarios} pick={(s) => formatCompactCurrency(s.equityValue)} />
                <Row label="Implied Share Price" scenarios={dcf.scenarios} pick={(s) => formatPrice(s.impliedSharePrice)} bold />
                <Row label="Upside / Downside vs. Current Price" scenarios={dcf.scenarios} pick={(s) => formatRatioAsPercent(s.upsideDownside)} bold />
              </tbody>
            </table>
            {dcf.scenarios.some((s) => s.issues.length > 0) && (
              <p className="text-ink/40 mt-2 text-[10px]">
                {dcf.scenarios
                  .filter((s) => s.issues.length > 0)
                  .map((s) => `${s.label}: ${s.issues.join('; ')}`)
                  .join(' · ')}
              </p>
            )}
          </div>
        )
      }
    />
  );
}

function Row<T>({ label, scenarios, pick, bold }: { label: string; scenarios: T[]; pick: (s: T) => string; bold?: boolean }) {
  return (
    <tr className="border-ink/5 border-b last:border-0">
      <td className="text-ink/60 py-1.5 pr-3">{label}</td>
      {scenarios.map((s, i) => (
        <td key={i} className={`px-2 py-1.5 text-right ${bold ? 'text-ink font-medium' : 'text-ink/80'}`}>
          {pick(s)}
        </td>
      ))}
    </tr>
  );
}
