'use client';

import type { BusinessTrendItem, CapitalAllocationItem, EarningsCitedItem, EarningsRiskItem } from '@/lib/ai/earningsSchema';
import type { EarningsAnalysisResponse, TranscriptSegmentResponse } from '@/lib/api/earnings';
import { EarningsCitationBadge } from './EarningsCitationBadge';
import { resolveSegmentAnchor } from './resolveSegmentAnchor';

const RISK_CATEGORY_LABELS: Record<string, string> = {
  demand: 'Demand',
  competition: 'Competition',
  regulation: 'Regulation',
  costs: 'Costs',
  supply_chain: 'Supply Chain',
  macroeconomic: 'Macroeconomic',
  liquidity: 'Liquidity',
  technology: 'Technology',
  other: 'Other',
};

const TREND_CATEGORY_LABELS: Record<string, string> = {
  demand: 'Demand',
  pricing: 'Pricing',
  volume: 'Volume',
  customer_behavior: 'Customer Behavior',
  geographic_markets: 'Geographic Markets',
  product_launches: 'Product Launches',
  competitive_environment: 'Competitive Environment',
  supply_chain: 'Supply Chain',
  hiring: 'Hiring',
  cost_structure: 'Cost Structure',
  other: 'Other',
};

const CAPITAL_CATEGORY_LABELS: Record<string, string> = {
  capex: 'CapEx',
  buybacks: 'Buybacks',
  dividends: 'Dividends',
  acquisitions: 'Acquisitions',
  debt: 'Debt',
  cash: 'Cash',
  investments: 'Investments',
  other: 'Other',
};

function CitedItemList({ items, segments }: { items: EarningsCitedItem[]; segments: TranscriptSegmentResponse[] }) {
  if (items.length === 0) return <p className="text-ink/40 text-xs">None identified on this call.</p>;
  return (
    <ul className="space-y-3">
      {items.map((item, index) => (
        <li key={index}>
          <p className="text-ink text-sm">{item.description}</p>
          <EarningsCitationBadge speaker={item.source.speaker} excerpt={item.source.excerpt} anchor={resolveSegmentAnchor(segments, item.source.excerpt)} />
        </li>
      ))}
    </ul>
  );
}

function CategorizedList<T extends { description: string; source: { speaker: string; excerpt: string } }>({
  items,
  segments,
  categoryOf,
  categoryLabels,
  emptyMessage,
}: {
  items: T[];
  segments: TranscriptSegmentResponse[];
  categoryOf: (item: T) => string;
  categoryLabels: Record<string, string>;
  emptyMessage: string;
}) {
  if (items.length === 0) return <p className="text-ink/40 text-xs">{emptyMessage}</p>;
  return (
    <ul className="space-y-3">
      {items.map((item, index) => (
        <li key={index}>
          <div className="flex items-start justify-between gap-2">
            <p className="text-ink text-sm">{item.description}</p>
            <span className="border-ink/15 text-ink/60 shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
              {categoryLabels[categoryOf(item)] ?? categoryOf(item)}
            </span>
          </div>
          <EarningsCitationBadge speaker={item.source.speaker} excerpt={item.source.excerpt} anchor={resolveSegmentAnchor(segments, item.source.excerpt)} />
        </li>
      ))}
    </ul>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-ink/10 bg-paper rounded-xl border p-4">
      <h3 className="text-ink text-sm font-semibold">{title}</h3>
      <div className="mt-3">{children}</div>
    </div>
  );
}

interface EarningsAnalysisPanelProps {
  analysis: EarningsAnalysisResponse;
  segments: TranscriptSegmentResponse[];
}

export function EarningsAnalysisPanel({ analysis, segments }: EarningsAnalysisPanelProps) {
  if (analysis.status === 'FAILED') {
    return (
      <div className="border-ink/10 bg-paper mt-3 rounded-xl border p-6">
        <p className="text-sm font-medium text-red-700">Analysis generation failed.</p>
        <p className="text-ink/60 mt-1 text-xs">{analysis.error ?? 'An unknown error occurred.'}</p>
        <p className="text-ink/40 mt-2 text-xs">The original transcript below remains fully available.</p>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-4">
      <Section title="Executive Summary">
        <p className="text-ink text-sm leading-relaxed">{analysis.summary}</p>
      </Section>

      <Section title="Business Trends">
        <CategorizedList<BusinessTrendItem>
          items={analysis.businessTrends}
          segments={segments}
          categoryOf={(item) => item.category}
          categoryLabels={TREND_CATEGORY_LABELS}
          emptyMessage="No notable business trends identified on this call."
        />
      </Section>

      <Section title="Management Commentary">
        <CitedItemList items={analysis.managementCommentary} segments={segments} />
      </Section>

      <Section title="Risk Signals">
        <CategorizedList<EarningsRiskItem>
          items={analysis.risks}
          segments={segments}
          categoryOf={(item) => item.category}
          categoryLabels={RISK_CATEGORY_LABELS}
          emptyMessage="No notable risks flagged on this call."
        />
      </Section>

      <Section title="Capital Allocation">
        <CategorizedList<CapitalAllocationItem>
          items={analysis.capitalAllocation}
          segments={segments}
          categoryOf={(item) => item.category}
          categoryLabels={CAPITAL_CATEGORY_LABELS}
          emptyMessage="No capital-allocation discussion identified on this call."
        />
      </Section>

      <p className="text-ink/40 text-xs">
        Generated by {analysis.model} on {new Date(analysis.generatedAt).toLocaleString()}. This is an AI-generated
        research aid, not investment advice — every item above cites the transcript text it was drawn from.
      </p>
    </div>
  );
}
