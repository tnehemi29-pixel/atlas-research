'use client';

import { useMemo, useState } from 'react';
import { CompanyNav } from '@/components/company/CompanyNav';
import type { CompanyTimelineEventResponse } from '@/lib/api/researchEvents';
import { formatDate } from '@/lib/utils/format';
import { MATERIALITY_STYLE, RESEARCH_EVENT_CATEGORY_LABELS } from '@/lib/utils/researchEventDisplay';

type FilterKey = 'ALL' | 'SEC_FILING' | 'EARNINGS' | 'FINANCIAL' | 'VALUATION' | 'CORPORATE_EVENT';

const CHIPS: { key: FilterKey; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'SEC_FILING', label: 'SEC' },
  { key: 'EARNINGS', label: 'Earnings' },
  { key: 'FINANCIAL', label: 'Financial' },
  { key: 'VALUATION', label: 'Valuation' },
  { key: 'CORPORATE_EVENT', label: 'Corporate' },
];

/** A company's unified, global research-event history — every user sees
 * the same timeline (no read/unread state, no personalization; that lives
 * on the /research-feed page instead). Filtering is client-side against
 * the one already-fetched batch, same rationale as ResearchFeedWorkspace. */
export function CompanyTimelineWorkspace({ ticker, initial }: { ticker: string; initial: CompanyTimelineEventResponse[] }) {
  const [filter, setFilter] = useState<FilterKey>('ALL');

  const filtered = useMemo(() => (filter === 'ALL' ? initial : initial.filter((e) => e.category === filter)), [initial, filter]);

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <CompanyNav ticker={ticker} active="timeline" />

      <h1 className="text-ink font-serif text-2xl">{ticker} Research Timeline</h1>
      <p className="text-ink/50 mt-1 max-w-2xl text-sm">
        Every detected change for {ticker} — SEC filings, earnings, financial results, valuation moves, and corporate
        events — in one place. Shared across every Atlas user; personalized read state lives on your{' '}
        <a href="/research-feed" className="text-accent hover:underline">
          Research Feed
        </a>
        .
      </p>

      <div className="mt-5 flex flex-wrap gap-1.5">
        {CHIPS.map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => setFilter(chip.key)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              filter === chip.key ? 'border-accent bg-accent-soft text-accent' : 'border-ink/15 text-ink/60 hover:border-ink/30'
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-ink/50 mt-8 text-sm">{initial.length === 0 ? 'No research events detected for this company yet.' : 'No events match this filter.'}</p>
      ) : (
        <ul className="mt-6 space-y-2">
          {filtered.map((event) => (
            <li key={event.id} className="border-ink/10 bg-paper rounded-xl border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${MATERIALITY_STYLE[event.materiality] ?? MATERIALITY_STYLE.LOW}`}>{event.materiality}</span>
                <span className="text-ink/40 bg-black/5 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">{RESEARCH_EVENT_CATEGORY_LABELS[event.category] ?? event.category}</span>
                <span className="text-ink/40 text-xs">{formatDate(event.eventDate)}</span>
              </div>
              <p className="text-ink mt-1.5 text-sm font-medium">{event.title}</p>
              <p className="text-ink/60 mt-0.5 text-sm">{event.description}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
