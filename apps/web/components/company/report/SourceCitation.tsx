'use client';

import { useReportSources } from './reportSourcesContext';

/**
 * Renders a claim's `source_ids` as small numbered chips — "[1]", "[2]" —
 * matching the milestone spec's example citation format. Clicking a chip
 * jumps to and briefly highlights that source's card in the Sources section
 * (id="source-N", rendered by SourcesSection.tsx), the same jump-and-flash
 * pattern lib/company/filings/CitationBadge.tsx already uses for M7. An
 * empty array renders nothing — a general statement need not cite anything,
 * and that's not treated as a defect.
 */
export function SourceCitation({ sourceIds }: { sourceIds: number[] }) {
  const sources = useReportSources();
  if (sourceIds.length === 0) return null;

  function jumpToSource(id: number) {
    const el = document.getElementById(`source-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('ring-2', 'ring-accent');
    setTimeout(() => el.classList.remove('ring-2', 'ring-accent'), 2000);
  }

  return (
    <span className="ml-1.5 inline-flex gap-0.5 print:hidden">
      {sourceIds.map((id) => {
        const source = sources.find((s) => s.id === id);
        return (
          <button
            key={id}
            type="button"
            onClick={() => jumpToSource(id)}
            title={source?.label ?? `Source ${id}`}
            className="text-accent bg-accent-soft rounded px-1 text-[10px] font-medium leading-4 hover:underline"
          >
            [{id}]
          </button>
        );
      })}
    </span>
  );
}
