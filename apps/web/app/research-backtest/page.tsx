import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { BacktestWorkspace } from '@/components/research-backtest/BacktestWorkspace';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Historical Backtesting · Atlas Research' };

export default async function ResearchBacktestPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-ink font-serif text-2xl font-semibold">Historical Backtesting & Research Validation</h1>
          <p className="text-ink/60 mt-2 max-w-2xl text-sm leading-relaxed">
            A research and validation tool — not an automated trading system. It tests whether Atlas&apos;s signals,
            valuations, and research events would have been useful historically, using only information that would
            actually have been available at each point in time.
          </p>
        </div>
        <Link href="/research-backtest/methodology" className="text-accent shrink-0 text-sm hover:underline">
          Methodology →
        </Link>
      </div>

      <div className="mt-8">
        <BacktestWorkspace />
      </div>
    </main>
  );
}
