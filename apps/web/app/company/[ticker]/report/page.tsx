import type { Metadata } from 'next';
import { listReports } from '@/lib/services/researchReportService';
import { isAiConfigured } from '@/lib/ai/anthropicClient';
import { getCurrentUser } from '@/lib/auth/session';
import { getSavedReportIds } from '@/lib/services/savedReportService';
import { ReportWorkspace } from '@/components/company/report/ReportWorkspace';
import type { ResearchReportContentResponse, ResearchReportResponse } from '@/lib/api/reports';

export const dynamic = 'force-dynamic';

interface ReportPageProps {
  params: { ticker: string };
}

export async function generateMetadata({ params }: ReportPageProps): Promise<Metadata> {
  return { title: `${params.ticker.toUpperCase()} Research Report · Atlas Research` };
}

export default async function ReportPage({ params }: ReportPageProps) {
  const ticker = params.ticker.toUpperCase();

  const reports = await listReports(ticker);
  const initialReports: ResearchReportResponse[] = reports.map((r) => ({
    id: r.id,
    companyId: r.companyId,
    version: r.version,
    status: r.status,
    model: r.model,
    error: r.error,
    dataSnapshotAt: r.dataSnapshotAt.toISOString(),
    content: r.content as unknown as ResearchReportContentResponse,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));

  const user = await getCurrentUser();
  const savedReportIds = user ? await getSavedReportIds(user.id, initialReports.map((r) => r.id)) : new Set<string>();

  return (
    <ReportWorkspace
      ticker={ticker}
      initialReports={initialReports}
      aiConfigured={isAiConfigured()}
      loggedIn={Boolean(user)}
      initialSavedReportIds={[...savedReportIds]}
    />
  );
}
