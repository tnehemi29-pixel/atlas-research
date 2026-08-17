import type { HealthCheckResult } from '@erp/types';
import { db } from '@/lib/db';

export async function getHealthStatus(): Promise<HealthCheckResult> {
  let database: HealthCheckResult['database'] = 'unreachable';

  try {
    await db.$queryRaw`SELECT 1`;
    database = 'connected';
  } catch {
    database = 'unreachable';
  }

  return {
    status: database === 'connected' ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    database,
  };
}
