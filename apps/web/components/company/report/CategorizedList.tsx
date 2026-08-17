import { ReportSection } from './ReportSection';
import { SourceCitation } from './SourceCitation';

interface CategorizedItem {
  category: string;
  description: string;
  source_ids: number[];
}

function humanizeCategory(category: string): string {
  return category
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** Shared renderer for the four {category, description, source_ids} list
 * shapes: growth drivers, SEC insights, earnings insights, catalysts (see
 * lib/ai/reportSchema.ts). An empty list is a valid outcome — "no catalysts
 * found" is not an error — so it renders a plain statement rather than
 * looking broken. */
export function CategorizedList({
  id,
  title,
  items,
  emptyMessage,
  itemBadge,
  extra,
}: {
  id?: string;
  title: string;
  items: CategorizedItem[];
  emptyMessage: string;
  /** e.g. "Potential catalyst" — forces the label the spec requires
   * regardless of whether the model's own text already included it. */
  itemBadge?: string;
  extra?: React.ReactNode;
}) {
  return (
    <ReportSection id={id} title={title}>
      {extra}
      {items.length === 0 ? (
        <p className="text-ink/50 text-sm italic">{emptyMessage}</p>
      ) : (
        <ul className="space-y-2.5">
          {items.map((item, i) => (
            <li key={i} className="border-ink/10 border-l-2 pl-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {itemBadge && (
                  <span className="text-accent bg-accent-soft rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                    {itemBadge}
                  </span>
                )}
                <span className="text-ink/40 text-[10px] font-medium uppercase tracking-wide">{humanizeCategory(item.category)}</span>
              </div>
              <p className="text-ink/80 mt-1 text-sm leading-relaxed">
                {item.description}
                <SourceCitation sourceIds={item.source_ids} />
              </p>
            </li>
          ))}
        </ul>
      )}
    </ReportSection>
  );
}
