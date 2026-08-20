import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getCompanyOverview } from '@/lib/services/companyService';
import { getFinancials } from '@/lib/services/financialDataService';
import { getCostOfDebtOverride } from '@/lib/services/valuationOverrideService';
import { CompanyNav } from '@/components/company/CompanyNav';
import { DcfWorkspace } from '@/components/company/valuation/DcfWorkspace';

export const dynamic = 'force-dynamic';

interface ValuationPageProps {
  params: { ticker: string };
}

export async function generateMetadata({ params }: ValuationPageProps): Promise<Metadata> {
  return { title: `${params.ticker.toUpperCase()} Valuation · Atlas Research` };
}

export default async function ValuationPage({ params }: ValuationPageProps) {
  const ticker = params.ticker.toUpperCase();

  let overview;
  try {
    overview = await getCompanyOverview(params.ticker);
  } catch {
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
          We couldn&apos;t reach the data provider for {ticker}. Please try again shortly.
        </p>
      </main>
    );
  }

  let financials;
  try {
    financials = await getFinancials(params.ticker, 'annual');
  } catch {
    financials = undefined;
  }

  if (!financials || financials.periods.filter((p) => p.periodType === 'annual').length === 0) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-12">
        <CompanyNav ticker={ticker} active="valuation" />
        <h1 className="text-ink font-serif text-2xl">No historical financial data available</h1>
        <p className="text-ink/60 mt-2 max-w-lg text-sm">
          A DCF valuation is built entirely from {ticker}&apos;s historical financial statements — none
          of it is invented. Annual financial data for this company hasn&apos;t synced successfully yet,
          so the model can&apos;t be built. Visit the{' '}
          <a href={`/company/${ticker}`} className="text-accent hover:underline">
            company overview
          </a>{' '}
          page to trigger a sync, then return here.
        </p>
      </main>
    );
  }

  const savedCostOfDebtOverride = await getCostOfDebtOverride(ticker).catch(() => null);

  return (
    <DcfWorkspace
      ticker={ticker}
      overview={overview}
      financials={financials}
      savedCostOfDebtOverride={savedCostOfDebtOverride}
    />
  );
}
