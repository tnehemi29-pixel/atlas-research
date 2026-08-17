import type { ResearchContext } from '@/lib/research/types';
import { formatCompactCurrency, formatMultiple, formatPrice, formatRatioAsPercent } from '@/lib/utils/format';
import { NarrativeSection } from './NarrativeSection';
import { SourceCitation } from './SourceCitation';

function Tag({ label }: { label: string }) {
  return <span className="text-ink/40 ml-1 rounded bg-black/5 px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide">{label}</span>;
}

/** Combines DCF + comps into one summary table with the "Actual / Calculated
 * / Forecast" tags the spec explicitly requires so a reader never confuses a
 * quoted market price with a modeled output. */
export function ValuationSection({ context, narrative }: { context: ResearchContext; narrative: { text: string; source_ids: number[] } }) {
  const base = context.dcfAnalysis?.scenarios.find((s) => s.label === 'Base') ?? null;
  const comps = context.compsAnalysis;

  return (
    <NarrativeSection
      id="valuation"
      title="Valuation"
      data={narrative}
      extra={
        <div className="mb-3 overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-ink/5 border-b">
                <td className="text-ink/60 py-1.5">
                  Current Price <Tag label="Actual" />
                </td>
                <td className="text-ink py-1.5 text-right font-medium">{formatPrice(context.companyOverview.price)}</td>
              </tr>
              {base && (
                <tr className="border-ink/5 border-b">
                  <td className="text-ink/60 py-1.5">
                    DCF Implied Price (Base) <Tag label="Calculated" />
                    <SourceCitation sourceIds={context.dcfAnalysis ? [context.dcfAnalysis.sourceId] : []} />
                  </td>
                  <td className="text-ink py-1.5 text-right font-medium">
                    {formatPrice(base.impliedSharePrice)} ({formatRatioAsPercent(base.upsideDownside)})
                  </td>
                </tr>
              )}
              {comps && (
                <tr className="border-ink/5 border-b">
                  <td className="text-ink/60 py-1.5">
                    Comps Implied Price <Tag label="Calculated" />
                    <SourceCitation sourceIds={[comps.sourceId]} />
                  </td>
                  <td className="text-ink py-1.5 text-right font-medium">
                    {formatPrice(comps.impliedSharePrice)} ({formatRatioAsPercent(comps.upsideDownside)})
                  </td>
                </tr>
              )}
              {comps && (
                <>
                  <tr className="border-ink/5 border-b">
                    <td className="text-ink/60 py-1.5">
                      EV / Revenue <Tag label="Actual" />
                    </td>
                    <td className="text-ink py-1.5 text-right">{formatMultiple(comps.targetMultiples.evToRevenue)}</td>
                  </tr>
                  <tr className="border-ink/5 border-b">
                    <td className="text-ink/60 py-1.5">
                      EV / EBITDA <Tag label="Actual" />
                    </td>
                    <td className="text-ink py-1.5 text-right">{formatMultiple(comps.targetMultiples.evToEbitda)}</td>
                  </tr>
                  <tr className="border-ink/5 border-b">
                    <td className="text-ink/60 py-1.5">
                      EV / EBIT <Tag label="Actual" />
                    </td>
                    <td className="text-ink py-1.5 text-right">{formatMultiple(comps.targetMultiples.evToEbit)}</td>
                  </tr>
                  <tr>
                    <td className="text-ink/60 py-1.5">
                      P/E <Tag label="Actual" />
                    </td>
                    <td className="text-ink py-1.5 text-right">{formatMultiple(comps.targetMultiples.peRatio)}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
          {!base && !comps && (
            <p className="text-ink/50 text-sm italic">
              Insufficient data to determine a modeled valuation — see DCF Analysis and Comparable Company Analysis.
            </p>
          )}
          <p className="text-ink/40 mt-1 text-[10px]">
            Market cap: {formatCompactCurrency(context.companyOverview.marketCap)} · Enterprise value: {formatCompactCurrency(context.companyOverview.enterpriseValue)}
          </p>
        </div>
      }
    />
  );
}
