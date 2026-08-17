import Link from 'next/link';
import type { EarningsCallListItem } from '@/lib/api/earnings';
import { formatDate } from '@/lib/utils/format';

interface EarningsTimelineProps {
  ticker: string;
  calls: EarningsCallListItem[];
}

/** The quarter-by-quarter research timeline (spec: "Q1 2025 -> Q2 2025 ->
 * ..."). Revenue/EPS/guidance/themes/risks per quarter live behind each
 * call's own AI analysis (generated on request, not eagerly for every row
 * here) — this table shows what's known without generating anything: the
 * fiscal period and transcript status. Click through to a quarter for the
 * full research view. */
export function EarningsTimeline({ ticker, calls }: EarningsTimelineProps) {
  const rows = [...calls].sort((a, b) => (a.fiscalYear - b.fiscalYear) || (a.fiscalQuarter - b.fiscalQuarter));

  return (
    <section className="mt-8">
      <h2 className="text-ink font-serif text-lg font-semibold">Earnings Timeline</h2>
      <p className="text-ink/50 mt-1 text-xs">
        Derived from {ticker}&apos;s own ingested quarterly financial filings — a quarter appears here once its 10-Q
        or 10-K has been processed, independent of whether a transcript is available for it.
      </p>
      <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-2">
        {rows.map((call, index) => (
          <div key={call.id} className="flex shrink-0 items-center gap-2">
            <Link
              href={`/company/${ticker}/earnings/${call.id}`}
              className="border-ink/10 bg-paper hover:border-accent hover:bg-accent-soft rounded-lg border px-3 py-2 text-center text-xs font-medium"
            >
              <div className="text-ink">
                Q{call.fiscalQuarter} {call.fiscalYear}
              </div>
              <div className="text-ink/40 mt-0.5">{call.periodEndDate ? formatDate(call.periodEndDate) : '—'}</div>
            </Link>
            {index < rows.length - 1 && <span className="text-ink/20">→</span>}
          </div>
        ))}
      </div>
    </section>
  );
}
