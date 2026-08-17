import type { ResearchCompsAnalysis } from '@/lib/research/types';
import { formatMultiple, formatPrice, formatRatioAsPercent } from '@/lib/utils/format';
import { NarrativeSection } from './NarrativeSection';

/** Explains lib/comps/engine.ts's existing comps output — never recalculates
 * it. "Never describe the company as 'cheap' or 'expensive' without naming
 * the specific multiple and context" is enforced by prompt instruction; this
 * table gives the reader the exact multiples the narrative refers to. */
export function CompsAnalysisSection({ comps, narrative }: { comps: ResearchCompsAnalysis | null; narrative: { text: string; source_ids: number[] } }) {
  return (
    <NarrativeSection
      id="comps-analysis"
      title="Comparable Company Analysis"
      data={narrative}
      extra={
        !comps ? (
          <p className="text-ink/50 mb-3 text-sm italic">No comparable-company peer set could be identified for this company.</p>
        ) : (
          <div className="mb-3 space-y-3">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-ink/10 border-b text-left">
                    <th className="text-ink/40 py-1.5 pr-3 text-[10px] font-medium uppercase tracking-wide"></th>
                    <th className="text-ink/40 px-2 py-1.5 text-right text-[10px] font-medium uppercase tracking-wide">EV/Revenue</th>
                    <th className="text-ink/40 px-2 py-1.5 text-right text-[10px] font-medium uppercase tracking-wide">EV/EBITDA</th>
                    <th className="text-ink/40 px-2 py-1.5 text-right text-[10px] font-medium uppercase tracking-wide">EV/EBIT</th>
                    <th className="text-ink/40 py-1.5 pl-2 text-right text-[10px] font-medium uppercase tracking-wide">P/E</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-ink/5 border-b">
                    <td className="text-ink py-1.5 pr-3 font-medium">Target</td>
                    <td className="text-ink/80 px-2 py-1.5 text-right">{formatMultiple(comps.targetMultiples.evToRevenue)}</td>
                    <td className="text-ink/80 px-2 py-1.5 text-right">{formatMultiple(comps.targetMultiples.evToEbitda)}</td>
                    <td className="text-ink/80 px-2 py-1.5 text-right">{formatMultiple(comps.targetMultiples.evToEbit)}</td>
                    <td className="text-ink/80 py-1.5 pl-2 text-right">{formatMultiple(comps.targetMultiples.peRatio)}</td>
                  </tr>
                  <tr>
                    <td className="text-ink py-1.5 pr-3 font-medium">Peer Median</td>
                    <td className="text-ink/80 px-2 py-1.5 text-right">{formatMultiple(comps.peerMedianMultiples.evToRevenue)}</td>
                    <td className="text-ink/80 px-2 py-1.5 text-right">{formatMultiple(comps.peerMedianMultiples.evToEbitda)}</td>
                    <td className="text-ink/80 px-2 py-1.5 text-right">{formatMultiple(comps.peerMedianMultiples.evToEbit)}</td>
                    <td className="text-ink/80 py-1.5 pl-2 text-right">{formatMultiple(comps.peerMedianMultiples.peRatio)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-ink/70 text-sm">
              Comps-implied share price: <span className="text-ink font-medium">{formatPrice(comps.impliedSharePrice)}</span> (
              {formatRatioAsPercent(comps.upsideDownside)} vs. current price)
            </p>
            <div>
              <p className="text-ink/40 mb-1 text-[10px] font-medium uppercase tracking-wide">Peer Set ({comps.peers.length})</p>
              <p className="text-ink/70 text-sm">{comps.peers.map((p) => `${p.name} (${p.ticker})`).join(', ')}</p>
            </div>
          </div>
        )
      }
    />
  );
}
