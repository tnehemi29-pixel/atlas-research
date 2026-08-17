import Link from 'next/link';
import type { CompanyTimelineEventResponse } from '@/lib/api/researchEvents';
import { formatDate } from '@/lib/utils/format';
import { MATERIALITY_STYLE, RESEARCH_EVENT_CATEGORY_LABELS } from '@/lib/utils/researchEventDisplay';

/** The company overview page's "Recent Changes" panel (spec section 22) —
 * a trimmed pointer into the full Research Timeline, not a duplicate of it. */
export function RecentChangesPanel({ ticker, changes }: { ticker: string; changes: CompanyTimelineEventResponse[] }) {
  return (
    <section className="border-ink/10 bg-paper mt-8 rounded-xl border p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-ink font-serif text-lg font-medium">Recent Changes</h2>
        <Link href={`/company/${ticker}/timeline`} className="text-accent text-xs font-medium hover:underline">
          View full timeline →
        </Link>
      </div>

      {changes.length === 0 ? (
        <p className="text-ink/50 mt-2 text-sm">No research events detected for {ticker} yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-black/5">
          {changes.map((event) => (
            <li key={event.id} className="py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${MATERIALITY_STYLE[event.materiality] ?? MATERIALITY_STYLE.LOW}`}>{event.materiality}</span>
                <span className="text-ink/40 bg-black/5 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">{RESEARCH_EVENT_CATEGORY_LABELS[event.category] ?? event.category}</span>
                <span className="text-ink/40 text-xs">{formatDate(event.eventDate)}</span>
              </div>
              <p className="text-ink mt-1 text-sm font-medium">{event.title}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
