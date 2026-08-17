import { NextRequest, NextResponse } from 'next/server';
import { runValuationSpreadAnalysis, runValuationSpreadOutOfSample, runValuationSpreadWalkForward } from '@/lib/services/backtestService';

export const dynamic = 'force-dynamic';

/** GET /api/research-backtest/valuation-spread — point-in-time target multiple
 * vs. current peer-median multiple (spec section 11).
 *  Standard:      ?ticker=X&from=YYYY-MM-DD&to=YYYY-MM-DD
 *  Out-of-sample: &mode=outOfSample&trainFrom=&trainTo=&testFrom=&testTo=
 *  Walk-forward:  &mode=walkForward&from=&to=&initialTrainYears=&testYears= */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const ticker = params.get('ticker');
  if (!ticker) return NextResponse.json({ error: 'ticker query parameter is required.' }, { status: 400 });

  const mode = params.get('mode') ?? 'standard';

  if (mode === 'outOfSample') {
    const trainFrom = params.get('trainFrom');
    const trainTo = params.get('trainTo');
    const testFrom = params.get('testFrom');
    const testTo = params.get('testTo');
    if (!trainFrom || !trainTo || !testFrom || !testTo) {
      return NextResponse.json({ error: 'trainFrom, trainTo, testFrom, and testTo are required for mode=outOfSample.' }, { status: 400 });
    }
    return NextResponse.json(await runValuationSpreadOutOfSample(ticker, trainFrom, trainTo, testFrom, testTo));
  }

  if (mode === 'walkForward') {
    const from = params.get('from');
    const to = params.get('to');
    const initialTrainYears = Number.parseInt(params.get('initialTrainYears') ?? '', 10);
    const testYears = Number.parseInt(params.get('testYears') ?? '', 10);
    if (!from || !to || !Number.isFinite(initialTrainYears) || !Number.isFinite(testYears)) {
      return NextResponse.json({ error: 'from, to, initialTrainYears, and testYears are required for mode=walkForward.' }, { status: 400 });
    }
    return NextResponse.json(await runValuationSpreadWalkForward(ticker, from, to, initialTrainYears, testYears));
  }

  const from = params.get('from');
  const to = params.get('to');
  if (!from || !to) return NextResponse.json({ error: 'from and to query parameters are required.' }, { status: 400 });
  return NextResponse.json(await runValuationSpreadAnalysis(ticker, from, to));
}
