import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { getResearchFeed } from '@/lib/services/researchFeedService';
import { getEarningsCalendar } from '@/lib/services/earningsCalendarService';
import { getPortfolioDetail } from '@/lib/services/portfolioService';
import { listAlerts } from '@/lib/services/alertService';
import { FeedList } from '@/components/dashboard/FeedList';
import { formatCompactCurrency, formatRatioAsPercent, formatUpdatedAt } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Dashboard · Atlas Research' };

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const [feed, calendar, portfolio, alerts] = await Promise.all([
    getResearchFeed(user.id),
    getEarningsCalendar(user.id),
    getPortfolioDetail(user.id),
    listAlerts(user.id),
  ]);

  const upcomingCalendar = calendar.filter((c) => c.expectedDate !== null).slice(0, 5);
  const triggeredAlerts = alerts.filter((a) => a.lastTriggeredAt !== null);

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <h1 className="text-ink font-serif text-2xl">Dashboard</h1>
      <p className="text-ink/50 mt-1 text-sm">A personalized research terminal across your watchlists and portfolio.</p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Link href="/portfolio" className="border-ink/10 bg-paper hover:border-accent/40 rounded-xl border p-4">
          <p className="text-ink/40 text-[10px] font-medium uppercase tracking-wide">Portfolio Value</p>
          <p className="text-ink mt-1 text-xl font-medium">{formatCompactCurrency(portfolio.summary.totalMarketValue)}</p>
          <p className="text-ink/50 mt-0.5 text-xs">
            Return: {formatRatioAsPercent(portfolio.summary.totalUnrealizedReturn)}
          </p>
        </Link>
        <Link href="/earnings-calendar" className="border-ink/10 bg-paper hover:border-accent/40 rounded-xl border p-4">
          <p className="text-ink/40 text-[10px] font-medium uppercase tracking-wide">Upcoming Earnings</p>
          <p className="text-ink mt-1 text-xl font-medium">{upcomingCalendar.length}</p>
          <p className="text-ink/50 mt-0.5 text-xs">Estimated dates for followed companies</p>
        </Link>
        <Link href="/alerts" className="border-ink/10 bg-paper hover:border-accent/40 rounded-xl border p-4">
          <p className="text-ink/40 text-[10px] font-medium uppercase tracking-wide">Alerts</p>
          <p className="text-ink mt-1 text-xl font-medium">
            {triggeredAlerts.length} / {alerts.length}
          </p>
          <p className="text-ink/50 mt-0.5 text-xs">Currently triggered / configured</p>
        </Link>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <h2 className="text-ink font-serif text-lg font-medium">Research Feed</h2>
          <p className="text-ink/50 mt-1 text-xs">New filings, calls, research reports, and research changes across everything you follow.</p>
          <div className="mt-3">
            <FeedList items={feed} emptyMessage="No recent activity — add companies to a watchlist or your portfolio to start building a feed." />
          </div>
        </section>

        <div className="space-y-8">
          <section>
            <h2 className="text-ink font-serif text-lg font-medium">Upcoming Earnings</h2>
            {upcomingCalendar.length === 0 ? (
              <p className="text-ink/50 mt-2 text-sm">No estimated earnings dates yet.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {upcomingCalendar.map((entry) => (
                  <li key={entry.ticker} className="text-sm">
                    <span className="text-ink font-medium">{entry.ticker}</span>{' '}
                    <span className="text-ink/60">~{formatUpdatedAt(entry.expectedDate)}</span>
                    <span className="text-ink/30 ml-1 text-xs">(est.)</span>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/earnings-calendar" className="text-accent mt-2 inline-block text-xs hover:underline">
              View full calendar →
            </Link>
          </section>

          <section>
            <h2 className="text-ink font-serif text-lg font-medium">Triggered Alerts</h2>
            {triggeredAlerts.length === 0 ? (
              <p className="text-ink/50 mt-2 text-sm">No alerts currently triggered.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {triggeredAlerts.map((alert) => (
                  <li key={alert.id} className="text-ink/70 text-sm">
                    {alert.lastTriggeredSummary}
                  </li>
                ))}
              </ul>
            )}
            <Link href="/alerts" className="text-accent mt-2 inline-block text-xs hover:underline">
              Manage alerts →
            </Link>
          </section>
        </div>
      </div>
    </main>
  );
}
