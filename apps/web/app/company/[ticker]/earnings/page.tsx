import type { Metadata } from 'next';
import { CompanyEarningsNotFoundError, listEarningsCalls } from '@/lib/services/earningsCallService';
import { CompanyNav } from '@/components/company/CompanyNav';
import { EarningsWorkspace } from '@/components/company/earnings/EarningsWorkspace';
import type { EarningsCallListItem } from '@/lib/api/earnings';

export const dynamic = 'force-dynamic';

interface EarningsPageProps {
  params: { ticker: string };
}

export async function generateMetadata({ params }: EarningsPageProps): Promise<Metadata> {
  return { title: `${params.ticker.toUpperCase()} Earnings Calls · Atlas Research` };
}

export default async function EarningsPage({ params }: EarningsPageProps) {
  const ticker = params.ticker.toUpperCase();

  let calls;
  try {
    calls = await listEarningsCalls(ticker);
  } catch (error) {
    if (error instanceof CompanyEarningsNotFoundError) {
      return (
        <main className="mx-auto max-w-5xl px-6 py-12">
          <CompanyNav ticker={ticker} active="earnings" />
          <h1 className="text-ink font-serif text-2xl">No earnings calls found</h1>
          <p className="text-ink/60 mt-2 max-w-lg text-sm">
            Atlas derives {ticker}&apos;s earnings-call list from its own ingested quarterly financial filings —
            visit the Overview or Valuation tab first so quarterly data can be synced, or double-check the ticker.
          </p>
        </main>
      );
    }

    return (
      <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-6 text-center">
        <h1 className="text-ink font-serif text-2xl">Data temporarily unavailable</h1>
        <p className="text-ink/60 mt-2">
          We couldn&apos;t load {ticker}&apos;s earnings-call history right now. Please try again shortly.
        </p>
      </main>
    );
  }

  const initialCalls: EarningsCallListItem[] = calls.map((call) => ({
    id: call.id,
    companyId: call.companyId,
    fiscalYear: call.fiscalYear,
    fiscalQuarter: call.fiscalQuarter,
    periodEndDate: call.periodEndDate ? call.periodEndDate.toISOString() : null,
    callDate: call.callDate ? call.callDate.toISOString() : null,
    provider: call.provider,
    providerTranscriptId: call.providerTranscriptId,
    processingStatus: call.processingStatus,
    processingError: call.processingError,
    createdAt: call.createdAt.toISOString(),
    updatedAt: call.updatedAt.toISOString(),
  }));

  return <EarningsWorkspace ticker={ticker} calls={initialCalls} />;
}
