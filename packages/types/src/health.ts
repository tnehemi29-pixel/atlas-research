export type HealthStatus = 'ok' | 'degraded';

export interface HealthCheckResult {
  status: HealthStatus;
  timestamp: string;
  uptimeSeconds: number;
  database: 'connected' | 'unreachable';
}
