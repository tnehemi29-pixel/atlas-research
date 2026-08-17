import { NextRequest, NextResponse } from 'next/server';
import type { ResearchEventType } from '@prisma/client';
import { runResearchEventOutcomeValidation, segmentObservationsForRobustness } from '@/lib/services/backtestService';

export const dynamic = 'force-dynamic';

const VALID_RESEARCH_EVENT_TYPES: ResearchEventType[] = [
  'NEW_FILING',
  'FINANCIAL_CHANGE',
  'MARGIN_CHANGE',
  'GUIDANCE_CHANGE',
  'DCF_VALUATION_CHANGE',
  'COMPS_VALUATION_CHANGE',
  'NEW_RESEARCH_REPORT',
  'RESEARCH_REPORT_UPDATED',
  'NEW_RISK',
  'CORPORATE_EVENT',
  'EARNINGS_CALL',
];

function parseTickerList(value: string | null): string[] {
  if (!value) return [];
  return value.split(',').map((t) => t.trim()).filter(Boolean);
}

function parseHorizons(value: string | null): number[] | undefined {
  if (!value) return undefined;
  const horizons = value
    .split(',')
    .map((v) => Number.parseInt(v.trim(), 10))
    .filter((n) => Number.isFinite(n));
  return horizons.length > 0 ? horizons : undefined;
}

/** GET /api/research-backtest/research-events?tickers=A,B&eventType=GUIDANCE_CHANGE
 *  [&horizons=1,3,6][&segment=true] — connects Milestone 11 research events
 * to subsequent market outcomes (spec section 10), never implying
 * causality; pass segment=true for spec section 12's robustness
 * segmentation. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tickers = parseTickerList(params.get('tickers'));
  const eventType = params.get('eventType') as ResearchEventType | null;

  if (tickers.length === 0) return NextResponse.json({ error: 'tickers query parameter is required.' }, { status: 400 });
  if (!eventType || !VALID_RESEARCH_EVENT_TYPES.includes(eventType)) {
    return NextResponse.json({ error: `eventType must be one of: ${VALID_RESEARCH_EVENT_TYPES.join(', ')}.` }, { status: 400 });
  }

  const horizons = parseHorizons(params.get('horizons'));
  const result = await runResearchEventOutcomeValidation(tickers, eventType, horizons);
  if (params.get('segment') !== 'true') return NextResponse.json(result);

  const robustness = segmentObservationsForRobustness(result.observations.map((o) => ({ date: o.signalDate, marketCap: o.marketCap, forwardOutcomes: o.forwardOutcomes })));
  return NextResponse.json({ ...result, robustness });
}
