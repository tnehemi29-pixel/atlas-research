import type { CatalystItem } from '@/lib/ai/reportSchema';
import { CategorizedList } from './CategorizedList';

export function CatalystsSection({ catalysts }: { catalysts: CatalystItem[] }) {
  return (
    <CategorizedList
      id="catalysts"
      title="Catalysts"
      items={catalysts}
      itemBadge="Potential catalyst"
      emptyMessage="Insufficient data to determine specific potential catalysts from the available research context."
    />
  );
}
