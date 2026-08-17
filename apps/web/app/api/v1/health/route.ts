import { NextResponse } from 'next/server';
import { getHealthStatus } from '@/lib/services/healthService';

export const dynamic = 'force-dynamic';

export async function GET() {
  const health = await getHealthStatus();
  const statusCode = health.status === 'ok' ? 200 : 503;

  return NextResponse.json(health, { status: statusCode });
}
