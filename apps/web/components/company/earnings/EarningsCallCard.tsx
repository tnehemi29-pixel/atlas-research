import Link from 'next/link';
import type { EarningsCallListItem } from '@/lib/api/earnings';
import { formatDate } from '@/lib/utils/format';

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Not yet checked',
  FETCHING: 'Retrieving…',
  PARSING: 'Processing…',
  COMPLETE: 'Transcript available',
  UNAVAILABLE: 'Transcript unavailable',
  FAILED: 'Processing failed',
};

const STATUS_STYLE: Record<string, string> = {
  PENDING: 'border-ink/15 bg-ink/5 text-ink/50',
  FETCHING: 'border-ink/15 bg-ink/5 text-ink/50',
  PARSING: 'border-ink/15 bg-ink/5 text-ink/50',
  COMPLETE: 'border-emerald-300 bg-emerald-50 text-emerald-700',
  UNAVAILABLE: 'border-ink/15 bg-ink/5 text-ink/50',
  FAILED: 'border-red-300 bg-red-50 text-red-700',
};

interface EarningsCallCardProps {
  ticker: string;
  call: EarningsCallListItem;
}

export function EarningsCallCard({ ticker, call }: EarningsCallCardProps) {
  const status = STATUS_LABEL[call.processingStatus] ?? call.processingStatus;
  const statusStyle = STATUS_STYLE[call.processingStatus] ?? STATUS_STYLE.PENDING;

  return (
    <div className="border-ink/10 bg-paper flex flex-wrap items-start justify-between gap-4 rounded-xl border p-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="border-accent/30 bg-accent-soft text-accent rounded px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide">
            Q{call.fiscalQuarter} {call.fiscalYear}
          </span>
          <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusStyle}`}>
            {status}
          </span>
        </div>
        <div className="text-ink mt-1.5 text-sm font-medium">{ticker} earnings call</div>
        <div className="text-ink/40 mt-1 flex flex-wrap gap-x-3 text-xs">
          {call.periodEndDate && <span>Period ended {formatDate(call.periodEndDate)}</span>}
          {call.callDate && <span>Call date {formatDate(call.callDate)}</span>}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <Link
          href={`/company/${ticker}/earnings/${call.id}`}
          className="border-accent text-accent hover:bg-accent-soft rounded-lg border px-3 py-1.5 text-xs font-medium"
        >
          Analyze
        </Link>
      </div>
    </div>
  );
}
