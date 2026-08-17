import type { ResearchKeyMetric } from '@/lib/research/types';
import { ReportSection } from './ReportSection';
import { SourceCitation } from './SourceCitation';

/** A flat, deterministic summary table — every value is pre-formatted by
 * aggregateResearchContext.ts itself, so the LLM never touches a number here. */
export function KeyMetricsSection({ metrics }: { metrics: ResearchKeyMetric[] }) {
  return (
    <ReportSection id="key-metrics" title="Key Metrics">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        {metrics.map((m) => (
          <div key={m.label}>
            <dt className="text-ink/40 text-[10px] font-medium uppercase tracking-wide">{m.label}</dt>
            <dd className="text-ink text-sm font-medium">
              {m.value}
              {m.sourceId !== null && <SourceCitation sourceIds={[m.sourceId]} />}
            </dd>
          </div>
        ))}
      </dl>
    </ReportSection>
  );
}
