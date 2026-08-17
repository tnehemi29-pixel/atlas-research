import type { ResearchFinancialPerformance } from '@/lib/research/types';
import { formatCompactCurrency, formatRatioAsPercent } from '@/lib/utils/format';
import { NarrativeSection } from './NarrativeSection';
import { SourceCitation } from './SourceCitation';

/** Every numerical claim in financial_analysis_narrative must reference this
 * table — the table itself comes straight from Atlas's own normalized
 * financial statements (see aggregateResearchContext.ts), never from the AI. */
export function FinancialPerformanceSection({
  performance,
  narrative,
}: {
  performance: ResearchFinancialPerformance;
  narrative: { text: string; source_ids: number[] };
}) {
  const hasData = performance.metrics.some((m) => m.values.length > 0);
  const years = hasData ? performance.metrics.find((m) => m.values.length > 0)!.values.map((v) => v.fiscalYear) : [];

  return (
    <NarrativeSection
      id="financial-performance"
      title="Financial Performance"
      data={narrative}
      extra={
        !hasData ? (
          <p className="text-ink/50 mb-3 text-sm italic">
            No annual financial statement history is available for this company.
          </p>
        ) : (
          <div className="mb-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-ink/10 border-b text-left">
                  <th className="text-ink/40 py-1.5 pr-3 text-[10px] font-medium uppercase tracking-wide">Metric</th>
                  {years.map((y) => (
                    <th key={y} className="text-ink/40 px-2 py-1.5 text-right text-[10px] font-medium uppercase tracking-wide">
                      FY{y}
                    </th>
                  ))}
                  <th className="text-ink/40 py-1.5 pl-2 text-right text-[10px] font-medium uppercase tracking-wide">YoY</th>
                </tr>
              </thead>
              <tbody>
                {performance.metrics.map((metric) => (
                  <tr key={metric.label} className="border-ink/5 border-b last:border-0">
                    <td className="text-ink py-1.5 pr-3">{metric.label}</td>
                    {metric.values.map((v) => (
                      <td key={v.fiscalYear} className="text-ink/80 px-2 py-1.5 text-right">
                        {metric.changeKind === 'points' ? formatRatioAsPercent(v.value) : formatCompactCurrency(v.value)}
                      </td>
                    ))}
                    <td className="py-1.5 pl-2 text-right font-medium text-ink">{formatRatioAsPercent(metric.latestYoyChange)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-ink/40 mt-1 text-[10px]">
              Source: {performance.dataAsOf ? `data as of ${performance.dataAsOf.slice(0, 10)}` : 'Atlas normalized financial statements'}
              <SourceCitation sourceIds={[performance.sourceId]} />
              {performance.stale && <span className="text-amber-700"> — stale cached snapshot</span>}
            </p>
          </div>
        )
      }
    />
  );
}
