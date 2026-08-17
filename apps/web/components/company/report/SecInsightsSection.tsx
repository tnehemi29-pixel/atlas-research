import type { SecInsightItem } from '@/lib/ai/reportSchema';
import type { ResearchSecFilingContext } from '@/lib/research/types';
import { formatDate } from '@/lib/utils/format';
import { CategorizedList } from './CategorizedList';

/** "Every important insight must link back to the relevant filing" — the
 * filing metadata + a direct link into the M7 filing detail page sits above
 * the (already source-cited) insight list. */
export function SecInsightsSection({
  sec,
  insights,
  ticker,
}: {
  sec: ResearchSecFilingContext | null;
  insights: SecInsightItem[];
  ticker: string;
}) {
  return (
    <CategorizedList
      id="sec-insights"
      title="SEC Filing Insights"
      items={insights}
      emptyMessage={
        sec ? 'No specific insights were generated from the latest filing analysis.' : 'No SEC filings were found for this company.'
      }
      extra={
        sec && (
          <p className="text-ink/50 mb-2 text-xs">
            Latest filing: {sec.filing.formType}, filed {formatDate(sec.filing.filingDate)} —{' '}
            <a href={`/company/${ticker}/filings/${sec.filing.id}`} className="text-accent hover:underline">
              View filing →
            </a>
            {!sec.analysis && ' (no AI analysis generated yet)'}
          </p>
        )
      }
    />
  );
}
