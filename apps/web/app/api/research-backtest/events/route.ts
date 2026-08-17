import { NextRequest, NextResponse } from 'next/server';
import type { ResearchEventType } from '@prisma/client';
import { runEventStudy, type EventStudySource } from '@/lib/services/backtestService';

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

/** GET /api/research-backtest/events?tickers=A,B&source=EARNINGS_CALL|RESEARCH_EVENT
 *  [&benchmark=SPY][&researchEventType=...] — event-study abnormal returns
 * around earnings calls or research events (spec section 9). */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tickers = parseTickerList(params.get('tickers'));
  const source = params.get('source') as EventStudySource | null;

  if (tickers.length === 0) return NextResponse.json({ error: 'tickers query parameter is required.' }, { status: 400 });
  if (source !== 'EARNINGS_CALL' && source !== 'RESEARCH_EVENT') {
    return NextResponse.json({ error: 'source must be EARNINGS_CALL or RESEARCH_EVENT.' }, { status: 400 });
  }

  const researchEventTypeParam = params.get('researchEventType');
  if (researchEventTypeParam && !VALID_RESEARCH_EVENT_TYPES.includes(researchEventTypeParam as ResearchEventType)) {
    return NextResponse.json({ error: `researchEventType must be one of: ${VALID_RESEARCH_EVENT_TYPES.join(', ')}.` }, { status: 400 });
  }

  const benchmarkTicker = params.get('benchmark') ?? undefined;
  const researchEventTypeFilter = (researchEventTypeParam as ResearchEventType | null) ?? undefined;

  const result = await runEventStudy(tickers, source, { benchmarkTicker, researchEventTypeFilter });
  return NextResponse.json(result);
}
