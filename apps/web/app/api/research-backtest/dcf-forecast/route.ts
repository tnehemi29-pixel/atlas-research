import { NextRequest, NextResponse } from 'next/server';
import { runDcfForecastValidation } from '@/lib/services/backtestService';
import { CompanyNotFoundError } from '@/lib/services/financialDataService';

export const dynamic = 'force-dynamic';

/** GET /api/research-backtest/dcf-forecast?ticker=X — forecast-vs-actual
 * validation for every point-in-time DCF this company has ever supported
 * (spec section 7). */
export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get('ticker');
  if (!ticker) return NextResponse.json({ error: 'ticker query parameter is required.' }, { status: 400 });

  try {
    return NextResponse.json(await runDcfForecastValidation(ticker));
  } catch (error) {
    if (error instanceof CompanyNotFoundError) return NextResponse.json({ error: `Unknown ticker "${ticker}".` }, { status: 404 });
    throw error;
  }
}
