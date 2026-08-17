import Link from 'next/link';
import type { FilingListItem } from '@/lib/api/filings';
import { categorizeEightKItem } from '@/lib/sec/eightKItems';
import { parseItemCodes } from '@/lib/sec/types';
import { formatDate } from '@/lib/utils/format';

const TYPE_LABELS: Record<string, string> = {
  TEN_K: '10-K',
  TEN_Q: '10-Q',
  EIGHT_K: '8-K',
  DEF_14A: 'DEF 14A',
  TWENTY_F: '20-F',
  OTHER: 'Other',
};

const IMPORTANCE_STYLE: Record<string, string> = {
  High: 'border-red-300 bg-red-50 text-red-700',
  Medium: 'border-amber-300 bg-amber-50 text-amber-800',
  Low: 'border-ink/15 bg-ink/5 text-ink/50',
};

interface FilingCardProps {
  ticker: string;
  filing: FilingListItem;
}

export function FilingCard({ ticker, filing }: FilingCardProps) {
  const itemLabels = parseItemCodes(filing.items).map((code) => categorizeEightKItem(code).label);
  const description = itemLabels.length > 0 ? itemLabels.join(' · ') : (filing.description ?? filing.formType);

  return (
    <div className="border-ink/10 bg-paper flex flex-wrap items-start justify-between gap-4 rounded-xl border p-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="border-accent/30 bg-accent-soft text-accent rounded px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide">
            {TYPE_LABELS[filing.filingType] ?? filing.formType}
          </span>
          <span
            className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${IMPORTANCE_STYLE[filing.importance] ?? IMPORTANCE_STYLE.Low}`}
          >
            {filing.importance}
          </span>
          <span className="text-ink/40 text-xs">Filed {formatDate(filing.filingDate)}</span>
          {filing.periodEnd && <span className="text-ink/40 text-xs">· Period {formatDate(filing.periodEnd)}</span>}
        </div>
        <div className="text-ink mt-1.5 text-sm font-medium">{description}</div>
        <div className="text-ink/40 mt-1 font-mono text-xs">Accession {filing.accessionNumber}</div>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <a href={filing.secUrl} target="_blank" rel="noopener noreferrer" className="text-accent text-xs hover:underline">
          Original Filing ↗
        </a>
        <Link
          href={`/company/${ticker}/filings/${filing.id}`}
          className="border-accent text-accent hover:bg-accent-soft rounded-lg border px-3 py-1.5 text-xs font-medium"
        >
          Analyze
        </Link>
      </div>
    </div>
  );
}
