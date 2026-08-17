import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { getFilingMonitor } from '@/lib/services/filingMonitorService';
import { formatUpdatedAt } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'SEC Filings · Atlas Research' };

export default async function FilingsMonitorPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const monitor = await getFilingMonitor(user.id);

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-ink font-serif text-2xl">SEC Filing Monitor</h1>
      <p className="text-ink/50 mt-1 text-sm">
        Recent filings for every company in your watchlists and portfolio. Reuses Atlas&apos;s existing SEC Filing
        Intelligence (Milestone 7) — click through for the full filing analysis.
      </p>

      {monitor.length === 0 ? (
        <p className="text-ink/50 mt-8 text-sm">No filings yet — follow a company via a watchlist or your portfolio to see its filings here.</p>
      ) : (
        <ul className="mt-6 divide-y divide-black/5">
          {monitor.map((entry) => (
            <li key={entry.filingId} className="flex items-center justify-between py-3">
              <div>
                <Link href={`/company/${entry.ticker}/filings/${entry.filingId}`} className="text-ink hover:text-accent font-medium">
                  {entry.ticker}
                </Link>
                <span className="text-ink/60 ml-2 text-sm">{entry.formType}</span>
                <span className="text-ink/40 ml-2 text-xs">{formatUpdatedAt(entry.filingDate)}</span>
              </div>
              {entry.isNew && <span className="text-accent bg-accent-soft rounded px-2 py-0.5 text-xs font-medium">New Filing</span>}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
