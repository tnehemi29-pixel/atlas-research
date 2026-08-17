import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { listSavedReports } from '@/lib/services/savedReportService';
import { SavedReportsWorkspace } from '@/components/reports/SavedReportsWorkspace';
import type { SavedReportResponse } from '@/lib/api/savedReports';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Saved Reports · Atlas Research' };

export default async function SavedReportsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const saved = await listSavedReports(user.id);
  const initial: SavedReportResponse[] = saved.map((s) => ({
    id: s.id,
    savedAt: s.savedAt.toISOString(),
    researchReport: {
      id: s.researchReport.id,
      version: s.researchReport.version,
      status: s.researchReport.status,
      createdAt: s.researchReport.createdAt.toISOString(),
      company: { ticker: s.researchReport.company.ticker, name: s.researchReport.company.name },
    },
  }));

  return <SavedReportsWorkspace initial={initial} />;
}
