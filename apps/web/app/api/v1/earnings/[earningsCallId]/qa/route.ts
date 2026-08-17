import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { separateQaExchanges } from '@/lib/earnings/qaSeparation';
import { EarningsCallNotFoundError, getCallWithSegments } from '@/lib/services/earningsCallService';

export const dynamic = 'force-dynamic';

interface AnalystTopicItem {
  topic: string;
  [key: string]: unknown;
}

/** GET /api/v1/earnings/[earningsCallId]/qa
 * Analyst Q&A: the deterministically paired question/answer exchanges (see
 * lib/earnings/qaSeparation.ts — no AI involved in the pairing itself) plus,
 * if an analysis has been generated, the AI's per-question topic/summary
 * annotations and a deterministic topic-count rollup grouped from them —
 * the model labels each question's topic, but counting is always done here,
 * never by the model itself. */
export async function GET(_request: Request, { params }: { params: { earningsCallId: string } }) {
  try {
    const { segments } = await getCallWithSegments(params.earningsCallId);
    const exchanges = separateQaExchanges(segments);

    const analysis = await db.earningsAnalysis.findUnique({ where: { earningsCallId: params.earningsCallId } });
    const analystTopics = (analysis?.analystTopics as unknown as AnalystTopicItem[] | null) ?? null;

    const topicCounts = new Map<string, number>();
    for (const item of analystTopics ?? []) {
      topicCounts.set(item.topic, (topicCounts.get(item.topic) ?? 0) + 1);
    }

    return NextResponse.json({
      exchanges,
      analystTopics,
      topicCounts: [...topicCounts.entries()].map(([topic, count]) => ({ topic, count })),
    });
  } catch (error) {
    if (error instanceof EarningsCallNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json({ error: 'Unexpected error while loading Q&A.' }, { status: 500 });
  }
}
