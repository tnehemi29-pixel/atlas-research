import { NextResponse } from 'next/server';
import { getCompanyOverview } from '@/lib/services/companyService';
import { ProviderNotConfiguredError, ProviderRequestError } from '@/lib/providers/fmp';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: { ticker: string } }) {
  try {
    const overview = await getCompanyOverview(params.ticker);

    if (!overview) {
      return NextResponse.json(
        { error: `No company found for "${params.ticker}".` },
        { status: 404 },
      );
    }

    return NextResponse.json(overview);
  } catch (error) {
    if (error instanceof ProviderNotConfiguredError) {
      return NextResponse.json(
        { error: 'Company data is temporarily unavailable.' },
        { status: 503 },
      );
    }
    if (error instanceof ProviderRequestError) {
      return NextResponse.json(
        { error: 'Data provider is unavailable right now.' },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { error: 'Unexpected error while loading company data.' },
      { status: 500 },
    );
  }
}
