import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getCompanyValuationMetrics, getPeerCandidates } from '@/lib/services/compsDataService';
import { CompanyNav } from '@/components/company/CompanyNav';
import { CompsWorkspace } from '@/components/company/comps/CompsWorkspace';
import type { PeerCandidate } from '@/lib/comps/types';

export const dynamic = 'force-dynamic';

interface CompsPageProps {
  params: { ticker: string };
}

export async function generateMetadata({ params }: CompsPageProps): Promise<Metadata> {
  return { title: `${params.ticker.toUpperCase()} Comparable Companies · Atlas Research` };
}

export default async function CompsPage({ params }: CompsPageProps) {
  const ticker = params.ticker.toUpperCase();

  let target;
  try {
    target = await getCompanyValuationMetrics(ticker);
  } catch {
    target = undefined;
  }

  if (target === null) {
    notFound();
  }

  if (!target) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-6 text-center">
        <h1 className="text-ink font-serif text-2xl">Data temporarily unavailable</h1>
        <p className="text-ink/60 mt-2">
          We couldn&apos;t reach the data provider for {ticker}. Please try again shortly.
        </p>
      </main>
    );
  }

  let initialCandidates: PeerCandidate[] = [];
  try {
    initialCandidates = await getPeerCandidates(ticker);
  } catch {
    // Peer discovery failing (rate limit, provider hiccup) shouldn't block
    // the whole page — the user can still search and add peers manually.
    initialCandidates = [];
  }

  if (target.revenue === null && target.marketCap === null) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-12">
        <CompanyNav ticker={ticker} active="comps" />
        <h1 className="text-ink font-serif text-2xl">No financial data available</h1>
        <p className="text-ink/60 mt-2 max-w-lg text-sm">
          A comparable company analysis needs at least market and financial data for {ticker}, and
          neither is available yet. Visit the{' '}
          <a href={`/company/${ticker}`} className="text-accent hover:underline">
            company overview
          </a>{' '}
          page to trigger a sync, then return here.
        </p>
      </main>
    );
  }

  return <CompsWorkspace ticker={ticker} target={target} initialCandidates={initialCandidates} />;
}
