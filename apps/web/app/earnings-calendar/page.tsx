import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { getEarningsCalendar } from '@/lib/services/earningsCalendarService';
import { formatUpdatedAt } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Earnings Calendar · Atlas Research' };

export default async function EarningsCalendarPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const calendar = await getEarningsCalendar(user.id);

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-ink font-serif text-2xl">Earnings Calendar</h1>
      <p className="text-ink/50 mt-1 max-w-2xl text-sm">
        Estimated upcoming earnings dates for every company you follow. Atlas has no live earnings-calendar data
        source — every date is a deterministic estimate from the company&apos;s own historical quarterly cadence,
        clearly labeled, never presented as confirmed.
      </p>

      {calendar.length === 0 ? (
        <p className="text-ink/50 mt-8 text-sm">No companies followed yet.</p>
      ) : (
        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-ink/10 border-b text-left">
              <th className="text-ink/40 py-2 pr-3 text-[10px] font-medium uppercase tracking-wide">Ticker</th>
              <th className="text-ink/40 py-2 pr-3 text-[10px] font-medium uppercase tracking-wide">Company</th>
              <th className="text-ink/40 px-2 py-2 text-left text-[10px] font-medium uppercase tracking-wide">Expected Date</th>
              <th className="text-ink/40 px-2 py-2 text-left text-[10px] font-medium uppercase tracking-wide">Followed In</th>
            </tr>
          </thead>
          <tbody>
            {calendar.map((entry) => (
              <tr key={entry.ticker} className="border-ink/5 border-b last:border-0">
                <td className="py-2 pr-3 font-medium">
                  <Link href={`/company/${entry.ticker}`} className="text-accent hover:underline">
                    {entry.ticker}
                  </Link>
                </td>
                <td className="text-ink/70 py-2 pr-3">{entry.name}</td>
                <td className="py-2 px-2">
                  {entry.expectedDate ? (
                    <>
                      <span className="text-ink">{formatUpdatedAt(entry.expectedDate)}</span>
                      <span className="text-ink/40 ml-1 text-xs">(estimate)</span>
                    </>
                  ) : (
                    <span className="text-ink/40 text-xs">No prior call on record</span>
                  )}
                  <p className="text-ink/30 mt-0.5 text-xs">{entry.basis}</p>
                </td>
                <td className="text-ink/50 py-2 px-2 text-xs">{entry.followedIn.map((s) => s.label).join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
