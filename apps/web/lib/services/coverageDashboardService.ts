import { db } from '@/lib/db';
import { requireWorkspaceMember } from '@/lib/services/workspaceService';

/**
 * Milestone 15 spec sections 4 and 16 — the `/workspace/coverage` table and
 * the per-analyst coverage summary. Deliberately workflow-only: no
 * investment-return ranking, no "best analyst," nothing gamified — every
 * number here is a plain count of research artifacts, matching spec section
 * 17's explicit prohibition ("Do NOT rank users by investment returns,
 * stock-picking performance, 'best analyst.' Avoid gamification.").
 */

export interface CompanyCoverageRow {
  ticker: string;
  companyName: string;
  sector: string | null;
  analyst: { id: string; name: string | null; email: string } | null;
  lastResearchUpdate: string | null;
  lastReviewApprovedAt: string | null;
  openTasks: number;
  openIntegrityIssues: number;
  investmentCaseStatus: string | null;
}

export async function getCoverageTable(userId: string, workspaceId: string): Promise<CompanyCoverageRow[]> {
  await requireWorkspaceMember(userId, workspaceId);

  const coverage = await db.companyCoverage.findMany({
    where: { workspaceId },
    include: { company: true, analyst: { select: { id: true, name: true, email: true } } },
    orderBy: { company: { ticker: 'asc' } },
  });

  const rows: CompanyCoverageRow[] = [];
  for (const entry of coverage) {
    const [latestReport, latestApprovedReview, openTasks, openIntegrityIssues, analystCase] = await Promise.all([
      db.researchReport.findFirst({ where: { companyId: entry.companyId }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
      db.researchReview.findFirst({ where: { workspaceId, researchReport: { companyId: entry.companyId }, approvedAt: { not: null } }, orderBy: { approvedAt: 'desc' }, select: { approvedAt: true } }),
      db.researchTask.count({ where: { workspaceId, companyId: entry.companyId, status: { not: 'COMPLETED' } } }),
      db.researchIntegrityIssue.count({ where: { companyId: entry.companyId, status: { in: ['OPEN', 'ACKNOWLEDGED'] } } }),
      db.investmentCase.findFirst({ where: { companyId: entry.companyId, userId: entry.analystUserId }, orderBy: { updatedAt: 'desc' }, select: { status: true } }),
    ]);

    rows.push({
      ticker: entry.company.ticker,
      companyName: entry.company.name,
      sector: entry.company.sector,
      analyst: entry.analyst,
      lastResearchUpdate: latestReport?.createdAt.toISOString() ?? null,
      lastReviewApprovedAt: latestApprovedReview?.approvedAt?.toISOString() ?? null,
      openTasks,
      openIntegrityIssues,
      investmentCaseStatus: analystCase?.status ?? null,
    });
  }
  return rows;
}

export interface AnalystCoverageRow {
  analyst: { id: string; name: string | null; email: string };
  companies: number;
  reports: number;
  openTasks: number;
}

export async function getAnalystCoverageSummary(userId: string, workspaceId: string): Promise<AnalystCoverageRow[]> {
  await requireWorkspaceMember(userId, workspaceId);

  const members = await db.workspaceMember.findMany({ where: { workspaceId }, include: { user: { select: { id: true, name: true, email: true } } } });

  const rows: AnalystCoverageRow[] = [];
  for (const member of members) {
    const coverage = await db.companyCoverage.findMany({ where: { workspaceId, analystUserId: member.userId }, select: { companyId: true } });
    const companyIds = coverage.map((c) => c.companyId);

    const [reports, openTasks] = await Promise.all([
      companyIds.length > 0 ? db.researchReport.count({ where: { companyId: { in: companyIds } } }) : 0,
      db.researchTask.count({ where: { workspaceId, assignedUserId: member.userId, status: { not: 'COMPLETED' } } }),
    ]);

    rows.push({ analyst: member.user, companies: companyIds.length, reports, openTasks });
  }
  return rows;
}
