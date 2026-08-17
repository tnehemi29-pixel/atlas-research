import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { CompanyFinancialsResponse } from '@erp/types';
import { getCompanyOverview } from '@/lib/services/companyService';
import { getFinancials } from '@/lib/services/financialDataService';
import { getCompanyRecentChanges } from '@/lib/services/researchEventFeedService';
import { CompanyNav } from '@/components/company/CompanyNav';
import { CompanyHeader } from '@/components/company/CompanyHeader';
import { PriceSnapshot } from '@/components/company/PriceSnapshot';
import { KeyStats } from '@/components/company/KeyStats';
import { RecentChangesPanel } from '@/components/company/RecentChangesPanel';
import { IntegrityPanel } from '@/components/company/integrity/IntegrityPanel';
import { FinancialsWorkspace } from '@/components/company/financials/FinancialsWorkspace';

export const dynamic = 'force-dynamic';

interface CompanyPageProps {
  params: { ticker: string };
}

export async function generateMetadata({ params }: CompanyPageProps): Promise<Metadata> {
  return { title: `${params.ticker.toUpperCase()} · Equity Research Platform` };
}

export default async function CompanyPage({ params }: CompanyPageProps) {
  let overview;
  try {
    overview = await getCompanyOverview(params.ticker);
  } catch {
    // Provider unreachable and nothing cached to fall back on — distinct
    // from "ticker doesn't exist," so this isn't a 404.
    overview = undefined;
  }

  if (overview === null) {
    notFound();
  }

  if (!overview) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-6 text-center">
        <h1 className="text-ink font-serif text-2xl">Data temporarily unavailable</h1>
        <p className="text-ink/60 mt-2">
          We couldn&apos;t reach the data provider for {params.ticker.toUpperCase()}. Please try
          again shortly.
        </p>
      </main>
    );
  }

  let financials: CompanyFinancialsResponse | undefined;
  try {
    financials = await getFinancials(params.ticker, 'annual');
  } catch {
    // Independent data source from the FMP-backed overview above — a
    // failure here shouldn't 404 or blank out the rest of the page.
    financials = undefined;
  }

  const recentChanges = await getCompanyRecentChanges(params.ticker);

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <CompanyNav ticker={params.ticker.toUpperCase()} active="overview" />
      <CompanyHeader overview={overview} />
      <PriceSnapshot overview={overview} />
      <KeyStats overview={overview} />
      <RecentChangesPanel ticker={params.ticker.toUpperCase()} changes={recentChanges} />
      <IntegrityPanel ticker={params.ticker.toUpperCase()} />
      <FinancialsWorkspace ticker={params.ticker.toUpperCase()} initialAnnualData={financials} />
    </main>
  );
}
