import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { listAuditLog } from '@/lib/services/auditLogService';

export const dynamic = 'force-dynamic';

/** GET /api/integrity/[ticker]/audit-log — spec section 23's audit trail
 * for this company: what Atlas knew, when it knew it, and why it produced
 * each conclusion. No auth required — company-scoped research data, same
 * convention as thesis-monitor/timeline. */
export async function GET(_request: Request, { params }: { params: { ticker: string } }) {
  const company = await db.company.findUnique({ where: { ticker: params.ticker.trim().toUpperCase() } });
  if (!company) return NextResponse.json({ error: 'Company not found.' }, { status: 404 });

  const log = await listAuditLog(company.id);
  return NextResponse.json(log);
}
