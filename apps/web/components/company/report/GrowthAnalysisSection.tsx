import type { GrowthDriverItem } from '@/lib/ai/reportSchema';
import { CategorizedList } from './CategorizedList';

export function GrowthAnalysisSection({ drivers }: { drivers: GrowthDriverItem[] }) {
  return (
    <CategorizedList
      id="growth-analysis"
      title="Growth Analysis"
      items={drivers}
      emptyMessage="Insufficient data to determine specific growth drivers from the available SEC filing and earnings-call context."
    />
  );
}
