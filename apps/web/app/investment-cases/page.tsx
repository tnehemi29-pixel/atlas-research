import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { getInvestmentCaseDashboard } from '@/lib/services/investmentCaseDashboardService';
import { InvestmentCasesWorkspace } from '@/components/investment-cases/InvestmentCasesWorkspace';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Investment Cases · Atlas Research' };

export default async function InvestmentCasesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const rows = await getInvestmentCaseDashboard(user.id);

  return <InvestmentCasesWorkspace initialRows={rows} />;
}
