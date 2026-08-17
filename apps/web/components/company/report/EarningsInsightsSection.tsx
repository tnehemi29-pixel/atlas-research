import type { EarningsInsightItem } from '@/lib/ai/reportSchema';
import type { ResearchEarningsContext } from '@/lib/research/types';
import { CategorizedList } from './CategorizedList';

export function EarningsInsightsSection({
  earnings,
  insights,
  ticker,
}: {
  earnings: ResearchEarningsContext | null;
  insights: EarningsInsightItem[];
  ticker: string;
}) {
  return (
    <CategorizedList
      id="earnings-insights"
      title="Earnings Call Insights"
      items={insights}
      emptyMessage={
        earnings ? 'No specific insights were generated from the latest earnings-call analysis.' : 'No earnings calls were found for this company.'
      }
      extra={
        earnings && (
          <div className="mb-2 text-xs">
            <p className="text-ink/50">
              Latest call: Q{earnings.call.fiscalQuarter} {earnings.call.fiscalYear} —{' '}
              <a href={`/company/${ticker}/earnings/${earnings.call.id}`} className="text-accent hover:underline">
                View call →
              </a>
              {!earnings.analysis && ' (no AI analysis generated yet)'}
              {earnings.analysis && (
                <span className="text-ink/40"> — AI-based language analysis; not presented as objective fact.</span>
              )}
            </p>
            {earnings.guidance.length > 0 && (
              <p className="text-ink/50 mt-1">
                Guidance: {earnings.guidance.map((g) => `${g.metricLabel} (${g.period}): ${g.change.toLowerCase()}`).join(', ')}
              </p>
            )}
          </div>
        )
      }
    />
  );
}
