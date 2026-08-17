'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  fetchResearchEventDetail,
  markAllResearchEventsRead,
  markResearchEventRead,
  markResearchEventUnread,
  type ResearchEventDetailResponse,
  type ResearchFeedEventSummaryResponse,
  type ResearchFeedResponse,
} from '@/lib/api/researchEvents';
import { formatDate, formatRatioAsPercent, formatUpdatedAt } from '@/lib/utils/format';
import { formatResearchEventValue, MATERIALITY_STYLE, RESEARCH_EVENT_CATEGORY_LABELS } from '@/lib/utils/researchEventDisplay';

type FilterKey = 'ALL' | 'HIGH' | 'SEC_FILING' | 'EARNINGS' | 'VALUATION';

const CHIPS: { key: FilterKey; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'HIGH', label: 'High Importance' },
  { key: 'SEC_FILING', label: 'SEC' },
  { key: 'EARNINGS', label: 'Earnings' },
  { key: 'VALUATION', label: 'Valuation' },
];

/** The Milestone 11 personalized research feed. Filtering is entirely
 * client-side against the one already-fetched batch of events — the
 * dataset for a single user's followed companies is small, so a chip click
 * never needs a network round trip. Expanding a row is the only place that
 * hits the network (event detail, and the read-state mutation it triggers). */
export function ResearchFeedWorkspace({ initial }: { initial: ResearchFeedResponse }) {
  const [items, setItems] = useState(initial.items);
  const [filter, setFilter] = useState<FilterKey>('ALL');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailById, setDetailById] = useState<Record<string, ResearchEventDetailResponse>>({});
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const unreadCount = items.filter((i) => !i.isRead).length;

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (filter === 'ALL') return true;
      if (filter === 'HIGH') return item.materiality === 'HIGH' || item.materiality === 'CRITICAL';
      return item.category === filter;
    });
  }, [items, filter]);

  const unread = filtered.filter((i) => !i.isRead);
  const read = filtered.filter((i) => i.isRead);

  async function handleExpand(item: ResearchFeedEventSummaryResponse) {
    if (expandedId === item.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(item.id);

    if (!item.isRead) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, isRead: true } : i)));
      markResearchEventRead(item.id).catch(() => {});
    }

    if (!detailById[item.id]) {
      setLoadingDetailId(item.id);
      try {
        const detail = await fetchResearchEventDetail(item.id);
        setDetailById((prev) => ({ ...prev, [item.id]: detail }));
      } catch {
        // Leave unset — the row keeps showing summary info even if the detail fetch fails.
      } finally {
        setLoadingDetailId(null);
      }
    }
  }

  async function handleToggleRead(item: ResearchFeedEventSummaryResponse, event: React.MouseEvent) {
    event.stopPropagation();
    const nextRead = !item.isRead;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, isRead: nextRead } : i)));
    await (nextRead ? markResearchEventRead(item.id) : markResearchEventUnread(item.id)).catch(() => {});
  }

  async function handleMarkAllRead() {
    setMarkingAll(true);
    setItems((prev) => prev.map((i) => ({ ...i, isRead: true })));
    await markAllResearchEventsRead().catch(() => {});
    setMarkingAll(false);
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-ink font-serif text-2xl">Research Feed</h1>
          <p className="text-ink/50 mt-1 max-w-2xl text-sm">
            Detected changes across every company you follow — SEC filings, earnings, financials, and valuation. Every
            item traces back to a real Atlas source; nothing here is a trading recommendation.{' '}
            <Link href="/research-feed/methodology" className="text-accent hover:underline">
              How this works →
            </Link>
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={handleMarkAllRead}
            disabled={markingAll}
            className="border-ink/15 text-ink/60 hover:text-ink shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          >
            {markingAll ? 'Marking…' : `Mark all read (${unreadCount})`}
          </button>
        )}
      </div>

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
        <p className="text-ink/50 mt-8 text-sm">
          {items.length === 0
            ? "No research events yet — add companies to a watchlist or your portfolio, and check back after they've been detected."
            : 'No events match this filter.'}
        </p>
      ) : (
        <div className="mt-6 space-y-8">
          {unread.length > 0 && (
            <section>
              <h2 className="text-ink/40 text-[10px] font-medium uppercase tracking-wide">Unread ({unread.length})</h2>
              <div className="mt-2 space-y-2">
                {unread.map((item) => (
                  <EventRow
                    key={item.id}
                    item={item}
                    expanded={expandedId === item.id}
                    detail={detailById[item.id]}
                    loading={loadingDetailId === item.id}
                    onExpand={() => handleExpand(item)}
                    onToggleRead={(e) => handleToggleRead(item, e)}
                  />
                ))}
              </div>
            </section>
          )}
          {read.length > 0 && (
            <section>
              <h2 className="text-ink/40 text-[10px] font-medium uppercase tracking-wide">{unread.length > 0 ? 'Read' : 'All Events'}</h2>
              <div className="mt-2 space-y-2">
                {read.map((item) => (
                  <EventRow
                    key={item.id}
                    item={item}
                    expanded={expandedId === item.id}
                    detail={detailById[item.id]}
                    loading={loadingDetailId === item.id}
                    onExpand={() => handleExpand(item)}
                    onToggleRead={(e) => handleToggleRead(item, e)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </main>
  );
}

function EventRow({
  item,
  expanded,
  detail,
  loading,
  onExpand,
  onToggleRead,
}: {
  item: ResearchFeedEventSummaryResponse;
  expanded: boolean;
  detail: ResearchEventDetailResponse | undefined;
  loading: boolean;
  onExpand: () => void;
  onToggleRead: (event: React.MouseEvent) => void;
}) {
  return (
    <div className={`border-ink/10 bg-paper rounded-xl border ${!item.isRead ? 'border-l-2 border-l-accent' : ''}`}>
      <button type="button" onClick={onExpand} className="flex w-full flex-wrap items-start justify-between gap-3 p-4 text-left">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/company/${item.ticker}`} onClick={(e) => e.stopPropagation()} className="text-accent text-xs font-semibold hover:underline">
              {item.ticker}
            </Link>
            <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${MATERIALITY_STYLE[item.materiality] ?? MATERIALITY_STYLE.LOW}`}>
              {item.materiality}
            </span>
            <span className="text-ink/40 bg-black/5 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">{RESEARCH_EVENT_CATEGORY_LABELS[item.category] ?? item.category}</span>
            <span className="text-ink/40 text-xs">{formatDate(item.eventDate)}</span>
          </div>
          <p className="text-ink mt-1.5 text-sm font-medium">{item.title}</p>
          <p className="text-ink/60 mt-0.5 text-sm">{item.aiSummary ?? item.description}</p>
        </div>
        <span onClick={onToggleRead} role="button" tabIndex={0} className="text-ink/40 hover:text-ink shrink-0 text-xs">
          {item.isRead ? 'Mark unread' : 'Mark read'}
        </span>
      </button>

      {expanded && (
        <div className="border-ink/10 border-t p-4">
          {loading && !detail ? <p className="text-ink/40 text-sm">Loading…</p> : detail ? <EventDetail detail={detail} /> : <p className="text-ink/40 text-sm">Could not load event detail.</p>}
        </div>
      )}
    </div>
  );
}

function EventDetail({ detail }: { detail: ResearchEventDetailResponse }) {
  return (
    <div className="space-y-4">
      {detail.changes.length > 0 && (
        <div>
          <h3 className="text-ink/40 text-[10px] font-medium uppercase tracking-wide">What Changed</h3>
          <div className="mt-1.5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-ink/40 text-left text-xs">
                  <th className="pb-1 pr-4 font-medium">Metric</th>
                  <th className="pb-1 pr-4 font-medium">Previous</th>
                  <th className="pb-1 pr-4 font-medium">Current</th>
                  <th className="pb-1 font-medium">Change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {detail.changes.map((c, i) => (
                  <tr key={i}>
                    <td className="text-ink py-1 pr-4">{c.metric}</td>
                    <td className="text-ink/70 py-1 pr-4">{formatResearchEventValue(c.unit, c.previousValue)}</td>
                    <td className="text-ink/70 py-1 pr-4">{formatResearchEventValue(c.unit, c.currentValue)}</td>
                    <td className="py-1">{c.changePercent !== null ? formatRatioAsPercent(c.changePercent) : formatResearchEventValue(c.unit, c.changeAbsolute)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(detail.aiWhyItMatters || detail.description) && (
        <div>
          <h3 className="text-ink/40 text-[10px] font-medium uppercase tracking-wide">Why It Matters</h3>
          <p className="text-ink/80 mt-1 text-sm">{detail.aiWhyItMatters ?? detail.description}</p>
        </div>
      )}

      {detail.impacts.length > 0 && (
        <div>
          <h3 className="text-ink/40 text-[10px] font-medium uppercase tracking-wide">Potential Research Impact</h3>
          <ul className="mt-1 space-y-1">
            {detail.impacts.map((impact, i) => (
              <li key={i} className="text-sm">
                <span className="text-ink font-medium">{impact.area.replace(/_/g, ' ')}:</span> <span className="text-ink/70">{impact.note}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {detail.aiQuestionsToInvestigate && detail.aiQuestionsToInvestigate.length > 0 && (
        <div>
          <h3 className="text-ink/40 text-[10px] font-medium uppercase tracking-wide">Questions to Investigate</h3>
          <ul className="text-ink/70 mt-1 list-disc space-y-1 pl-4 text-sm">
            {detail.aiQuestionsToInvestigate.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h3 className="text-ink/40 text-[10px] font-medium uppercase tracking-wide">Sources</h3>
        <ul className="mt-1 space-y-1">
          {detail.sources.map((source, i) => (
            <li key={i} className="text-sm">
              <Link href={source.href} className="text-accent hover:underline">
                {source.label}
              </Link>
              {source.detail && <span className="text-ink/50"> — {source.detail}</span>}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-black/5 pt-3 text-xs">
        <span className="text-ink/40">
          Confidence: <span className="text-ink/70 font-medium">{detail.confidence}</span>
        </span>
        {detail.aiStatus === 'SUCCESS' && detail.aiConfidence && (
          <span className="text-ink/40">
            AI confidence: <span className="text-ink/70 font-medium">{detail.aiConfidence}</span>
          </span>
        )}
        {detail.aiStatus === 'FAILED' && <span className="text-ink/40">AI explanation unavailable — sources and changes above are unaffected.</span>}
        <span className="text-ink/40">Detected {formatUpdatedAt(detail.detectedAt)}</span>
      </div>
    </div>
  );
}
