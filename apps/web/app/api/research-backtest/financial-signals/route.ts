import { NextRequest, NextResponse } from 'next/server';
import { runFinancialSignalValidation, segmentObservationsForRobustness, type FinancialSignalType } from '@/lib/services/backtestService';

export const dynamic = 'force-dynamic';

const VALID_SIGNALS: FinancialSignalType[] = [
  'REVENUE_ACCELERATION',
  'REVENUE_DECELERATION',
  'MARGIN_EXPANSION',
  'MARGIN_CONTRACTION',
  'FCF_GROWTH',
  'DEBT_REDUCTION',
  'GUIDANCE_INCREASE',
  'GUIDANCE_DECREASE',
];

function parseTickerList(value: string | null): string[] {
  if (!value) return [];
  return value.split(',').map((t) => t.trim()).filter(Boolean);
}

/** GET /api/research-backtest/financial-signals?tickers=A,B&signal=REVENUE_ACCELERATION[&segment=true]
 * Financial-signal-vs-forward-return validation (spec section 8); pass
 * segment=true to also attach spec section 12's robustness segmentation. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tickers = parseTickerList(params.get('tickers'));
  const signal = params.get('signal') as FinancialSignalType | null;

  if (tickers.length === 0) return NextResponse.json({ error: 'tickers query parameter is required.' }, { status: 400 });
  if (!signal || !VALID_SIGNALS.includes(signal)) {
    return NextResponse.json({ error: `signal must be one of: ${VALID_SIGNALS.join(', ')}.` }, { status: 400 });
  }

  const result = await runFinancialSignalValidation(tickers, signal);
  if (params.get('segment') !== 'true') return NextResponse.json(result);

  const robustness = segmentObservationsForRobustness(result.observations.map((o) => ({ date: o.signalDate, marketCap: o.marketCap, forwardOutcomes: o.forwardOutcomes })));
  return NextResponse.json({ ...result, robustness });
}
