import Link from 'next/link';
import type { FilingListItem } from '@/lib/api/filings';
import { categorizeEightKItem } from '@/lib/sec/eightKItems';
import { parseItemCodes } from '@/lib/sec/types';
import { formatDate } from '@/lib/utils/format';

const IMPORTANCE_STYLE: Record<string, string> = { High: 'text-red-700', Medium: 'text-amber-700', Low: 'text-ink/40' };

interface ResearchTimelineProps {
  ticker: string;
  filings: FilingListItem[];
}

export function ResearchTimeline({ ticker, filings }: ResearchTimelineProps) {
  const rows = [...filings].sort((a, b) => new Date(b.filingDate).getTime() - new Date(a.filingDate).getTime());

  return (
    <section className="mt-8">
      <h2 className="text-ink font-serif text-lg font-semibold">Research Timeline</h2>
      <p className="text-ink/50 mt-1 text-xs">
        Importance is rule-based, not an AI judgment (see the methodology page): 10-K/10-Q filings and 8-Ks
        disclosing earnings, acquisitions, or bankruptcy/restructuring are High; executive changes, financing, and
        material contracts are Medium.
      </p>
      <div className="border-ink/10 mt-3 overflow-x-auto rounded-xl border">
        <table className="w-full min-w-max border-collapse text-sm">
          <thead>
            <tr className="border-ink/10 bg-paper border-b">
              <th className="text-ink/40 px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide">Date</th>
              <th className="text-ink/40 px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide">Filing</th>
              <th className="text-ink/40 px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide">Event</th>
              <th className="text-ink/40 px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide">Importance</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="text-ink/50 px-4 py-6 text-center text-sm">
                  No filings match the current filters.
                </td>
              </tr>
            )}
            {rows.map((filing) => {
              const itemLabels = parseItemCodes(filing.items).map((code) => categorizeEightKItem(code).label);
              const event = itemLabels.length > 0 ? itemLabels.join(', ') : (filing.description ?? filing.formType);
              return (
                <tr key={filing.id} className="border-ink/5 border-b last:border-0">
                  <td className="text-ink px-4 py-2.5 font-mono text-xs tabular-nums">{formatDate(filing.filingDate)}</td>
                  <td className="px-4 py-2.5">
                    <Link href={`/company/${ticker}/filings/${filing.id}`} className="text-accent text-xs font-medium hover:underline">
                      {filing.formType}
                    </Link>
                  </td>
                  <td className="text-ink/70 px-4 py-2.5 text-xs">{event}</td>
                  <td className={`px-4 py-2.5 text-xs font-semibold ${IMPORTANCE_STYLE[filing.importance] ?? ''}`}>
                    {filing.importance}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
