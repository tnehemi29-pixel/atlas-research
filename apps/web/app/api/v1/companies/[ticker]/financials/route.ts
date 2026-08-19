import { NextRequest, NextResponse } from 'next/server';
import type { PeriodType } from '@erp/types';
import { CompanyNotFoundError, getFinancials } from '@/lib/services/financialDataService';
import { SecNotFoundError, SecRateLimitError, SecRequestError } from '@/lib/providers/secEdgar';

export const dynamic = 'force-dynamic';

function parsePeriodType(value: string | null): PeriodType {
  return value === 'quarterly' ? 'quarterly' : 'annual';
}

export async function GET(request: NextRequest, { params }: { params: { ticker: string } }) {
  const periodType = parsePeriodType(request.nextUrl.searchParams.get('period'));

  try {
    const financials = await getFinancials(params.ticker, periodType);
    return NextResponse.json(financials);
  } catch (error) {
    if (error instanceof CompanyNotFoundError || error instanceof SecNotFoundError) {
      return NextResponse.json(
        { error: `No SEC filer found for "${params.ticker}".` },
        { status: 404 },
      );
    }
    if (error instanceof SecRateLimitError) {
      return NextResponse.json(
        { error: 'SEC EDGAR rate limit reached — try again shortly.' },
        { status: 429 },
      );
    }
    if (error instanceof SecRequestError) {
      return NextResponse.json({ error: 'SEC EDGAR is unavailable right now.' }, { status: 502 });
    }
    console.error('[financials] Unexpected error', {
      ticker: params.ticker,
      periodType,
      error,
    });
    return NextResponse.json(
      { error: 'Unexpected error while loading financial data.' },
      { status: 500 },
    );
  }
}
