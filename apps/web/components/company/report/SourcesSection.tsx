import type { ResearchSource } from '@/lib/research/types';
import { ReportSection } from './ReportSection';

const TYPE_LABELS: Record<ResearchSource['type'], string> = {
  SEC_FILING: 'SEC Filing',
  EARNINGS_CALL: 'Earnings Call',
  FINANCIAL_STATEMENT: 'Financial Statement',
  DCF_MODEL: 'DCF Calculation',
  COMPS_MODEL: 'Comps Calculation',
  MARKET_DATA: 'Market Data',
};

function sourceLink(source: ResearchSource, ticker: string): string | null {
  if (source.secFilingId) return `/company/${ticker}/filings/${source.secFilingId}`;
  if (source.earningsCallId) return `/company/${ticker}/earnings/${source.earningsCallId}`;
  return null;
}

/** The backend-built, closed source registry rendered as numbered cards —
 * every SourceCitation chip elsewhere in the report jumps to id="source-N"
 * here. "The backend should inject valid source IDs into the report" is the
 * whole reason this list is exhaustive and fixed rather than assembled from
 * whatever the model happened to cite. */
export function SourcesSection({ sources, ticker }: { sources: ResearchSource[]; ticker: string }) {
  return (
    <ReportSection id="sources" title="Research Sources">
      <ol className="space-y-2">
        {sources.map((source) => {
          const href = sourceLink(source, ticker);
          return (
            <li key={source.id} id={`source-${source.id}`} className="border-ink/10 rounded-lg border p-2.5 text-sm transition-shadow">
              <span className="text-ink/40 mr-1.5 font-medium">[{source.id}]</span>
              <span className="text-ink/40 mr-1.5 rounded bg-black/5 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                {TYPE_LABELS[source.type]}
              </span>
              <span className="text-ink">{source.label}</span>
              {source.detail && <span className="text-ink/50"> — {source.detail}</span>}
              {href && (
                <a href={href} className="text-accent ml-2 text-xs hover:underline">
                  View →
                </a>
              )}
            </li>
          );
        })}
      </ol>
    </ReportSection>
  );
}
