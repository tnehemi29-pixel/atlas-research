import type { Metadata } from 'next';
import { CompanyFilingsNotFoundError, listFilings } from '@/lib/services/secFilingService';
import { classifyFilingImportance } from '@/lib/sec/importance';
import { parseItemCodes, type SecFilingTypeValue } from '@/lib/sec/types';
import { CompanyNav } from '@/components/company/CompanyNav';
import { FilingsWorkspace } from '@/components/company/filings/FilingsWorkspace';
import type { FilingListItem } from '@/lib/api/filings';

export const dynamic = 'force-dynamic';

interface FilingsPageProps {
  params: { ticker: string };
}

export async function generateMetadata({ params }: FilingsPageProps): Promise<Metadata> {
  return { title: `${params.ticker.toUpperCase()} SEC Filings · Atlas Research` };
}

export default async function FilingsPage({ params }: FilingsPageProps) {
  const ticker = params.ticker.toUpperCase();

  let filings;
  try {
    filings = await listFilings(ticker);
  } catch (error) {
    if (error instanceof CompanyFilingsNotFoundError) {
      return (
        <main className="mx-auto max-w-5xl px-6 py-12">
          <CompanyNav ticker={ticker} active="filings" />
          <h1 className="text-ink font-serif text-2xl">No SEC filer found</h1>
          <p className="text-ink/60 mt-2 max-w-lg text-sm">
            SEC EDGAR has no registered filer for &ldquo;{ticker}&rdquo;. Double check the ticker, or this may be a
            non-US-listed company that doesn&apos;t file with the SEC.
          </p>
        </main>
      );
    }

    return (
      <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-6 text-center">
        <h1 className="text-ink font-serif text-2xl">Data temporarily unavailable</h1>
        <p className="text-ink/60 mt-2">
          We couldn&apos;t reach SEC EDGAR for {ticker}&apos;s filing history. Please try again shortly.
        </p>
      </main>
    );
  }

  const initialFilings: FilingListItem[] = filings.map((filing) => ({
    id: filing.id,
    companyId: filing.companyId,
    filingType: filing.filingType,
    formType: filing.formType,
    filingDate: filing.filingDate.toISOString(),
    periodEnd: filing.periodEnd ? filing.periodEnd.toISOString() : null,
    accessionNumber: filing.accessionNumber,
    primaryDocument: filing.primaryDocument,
    secUrl: filing.secUrl,
    description: filing.description,
    items: filing.items,
    processingStatus: filing.processingStatus,
    processingError: filing.processingError,
    createdAt: filing.createdAt.toISOString(),
    updatedAt: filing.updatedAt.toISOString(),
    importance: classifyFilingImportance(filing.filingType as SecFilingTypeValue, parseItemCodes(filing.items)),
  }));

  return <FilingsWorkspace ticker={ticker} initialFilings={initialFilings} />;
}
