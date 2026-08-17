import { NextResponse } from 'next/server';
import { getThesisMonitor } from '@/lib/services/thesisMonitorService';

export const dynamic = 'force-dynamic';

/** GET /api/companies/[ticker]/assumption-changes — a flattened view of
 * the thesis monitor: only the assumptions that have at least one recorded
 * live comparison, each with the comparison inlined. Returns an empty array
 * (never fabricates) when there's no report or no comparisons yet. */
export async function GET(_request: Request, { params }: { params: { ticker: string } }) {
  const result = await getThesisMonitor(params.ticker);
  if (!result) return NextResponse.json([]);

  const changes = result.assumptions
    .filter((a) => a.latestComparison !== null)
    .map((a) => ({
      key: a.key,
      label: a.label,
      originalValue: a.originalValue,
      unit: a.unit,
      newValue: a.latestComparison!.newValue,
      changeAbsolute: a.latestComparison!.changeAbsolute,
      changePercent: a.latestComparison!.changePercent,
      flagged: a.latestComparison!.flagged,
      note: a.latestComparison!.note,
      comparedAt: a.latestComparison!.comparedAt,
      researchEventId: a.latestComparison!.researchEventId,
    }));

  return NextResponse.json(changes);
}
