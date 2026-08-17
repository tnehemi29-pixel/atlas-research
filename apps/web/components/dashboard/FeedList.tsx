import Link from 'next/link';
import type { ResearchFeedItemResponse } from '@/lib/api/monitoring';
import { formatUpdatedAt } from '@/lib/utils/format';

const TYPE_LABELS: Record<ResearchFeedItemResponse['type'], string> = {
  NEW_SEC_FILING: 'SEC Filing',
  NEW_EARNINGS_CALL: 'Earnings Call',
  NEW_RESEARCH_REPORT: 'New Report',
  RESEARCH_REPORT_UPDATED: 'Report Updated',
  VALUATION_CHANGE: 'Valuation Change',
  GUIDANCE_CHANGE: 'Guidance Change',
  FILING_RISK: 'Filing Risk',
};

export function FeedList({ items, emptyMessage }: { items: ResearchFeedItemResponse[]; emptyMessage: string }) {
  if (items.length === 0) {
    return <p className="text-ink/50 text-sm">{emptyMessage}</p>;
  }

  return (
    <ul className="divide-y divide-black/5">
      {items.map((item) => (
        <li key={item.id} className="py-3">
          <Link href={item.href} className="group block">
            <div className="flex items-center gap-2">
              <span className="text-ink/40 bg-black/5 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">{TYPE_LABELS[item.type]}</span>
              <span className="text-ink/40 text-xs">{formatUpdatedAt(item.occurredAt)}</span>
            </div>
            <p className="text-ink group-hover:text-accent mt-1 text-sm font-medium">{item.title}</p>
            <p className="text-ink/60 mt-0.5 text-sm">{item.description}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
