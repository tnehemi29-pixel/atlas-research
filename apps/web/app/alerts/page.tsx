import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { evaluateAlerts } from '@/lib/services/alertService';
import { AlertsWorkspace } from '@/components/alerts/AlertsWorkspace';
import type { AlertResponse } from '@/lib/api/alerts';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Alerts · Atlas Research' };

export default async function AlertsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const alerts = await evaluateAlerts(user.id);
  const initial: AlertResponse[] = alerts.map((a) => ({
    id: a.id,
    userId: a.userId,
    type: a.type,
    companyId: a.companyId,
    company: a.company ? { ticker: a.company.ticker, name: a.company.name } : null,
    thresholdPercent: a.thresholdPercent,
    isActive: a.isActive,
    lastCheckedAt: a.lastCheckedAt ? a.lastCheckedAt.toISOString() : null,
    lastTriggeredAt: a.lastTriggeredAt ? a.lastTriggeredAt.toISOString() : null,
    lastTriggeredSummary: a.lastTriggeredSummary,
    createdAt: a.createdAt.toISOString(),
  }));

  return <AlertsWorkspace initial={initial} />;
}
