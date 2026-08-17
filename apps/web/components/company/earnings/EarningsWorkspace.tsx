import Link from 'next/link';
import type { EarningsCallListItem } from '@/lib/api/earnings';
import { CompanyNav } from '@/components/company/CompanyNav';
import { EarningsCallCard } from './EarningsCallCard';
import { EarningsTimeline } from './EarningsTimeline';

interface EarningsWorkspaceProps {
  ticker: string;
  calls: EarningsCallListItem[];
}

export function EarningsWorkspace({ ticker, calls }: EarningsWorkspaceProps) {
  const sorted = [...calls].sort((a, b) => (b.fiscalYear - a.fiscalYear) || (b.fiscalQuarter - a.fiscalQuarter));

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <div className="mb-2 flex items-center justify-between">
        <CompanyNav ticker={ticker} active="earnings" />
        <Link href={`/company/${ticker}/earnings/methodology`} className="text-accent text-sm hover:underline">
          Methodology →
        </Link>
      </div>

      <header className="border-ink/10 border-b pb-6">
        <h1 className="text-ink font-serif text-2xl font-semibold">Earnings Call Intelligence</h1>
        <p className="text-ink/50 mt-2 max-w-2xl text-sm">
          A chronological feed of {ticker}&apos;s quarterly earnings calls. Select a quarter to review management
          commentary, guidance, business trends, and analyst Q&amp;A alongside the company&apos;s reported results.
        </p>
      </header>

      <section className="mt-6">
        <div className="flex flex-col gap-3">
          {sorted.length === 0 ? (
            <div className="border-ink/10 bg-paper text-ink/50 rounded-xl border p-6 text-center text-sm">
              No earnings calls found yet.
            </div>
          ) : (
            sorted.map((call) => <EarningsCallCard key={call.id} ticker={ticker} call={call} />)
          )}
        </div>
      </section>

      <EarningsTimeline ticker={ticker} calls={sorted} />
    </main>
  );
}
