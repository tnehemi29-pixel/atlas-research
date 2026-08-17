import { db } from '@/lib/db';
import { requireWorkspaceMember } from '@/lib/services/workspaceService';

/**
 * Milestone 15 spec section 14 — the workspace dashboard's aggregate
 * counts. Every number here is a read over data another milestone already
 * owns (companies covered -> CompanyCoverage, reports in review ->
 * Milestone 9's ResearchReport.reviewStatus, open integrity issues ->
 * Milestone 14's ResearchIntegrityIssue, recent changes -> Milestone 11's
 * ResearchEvent) — this file never re-derives or re-detects any of it, and
 * never triggers a fresh detection run on load (spec section 29's "do not
 * load the entire workspace into the browser... reuse existing Atlas
 * data"): recent changes reads whatever ResearchEvent rows already exist,
 * the same way the global integrity dashboard only reads already-computed
 * snapshots rather than sweeping the whole portfolio.
 */

const RECENT_CHANGES_LIMIT = 10;

export interface WorkspaceDashboardRecentChange {
  ticker: string;
  companyName: string;
  title: string;
  materiality: string;
  eventDate: string;
}

export interface WorkspaceDashboardSummary {
  companiesCovered: number;
  activeProjects: number;
  reportsInReview: number;
  openIntegrityIssues: number;
  overdueTasks: number;
  recentResearchChanges: WorkspaceDashboardRecentChange[];
}

export async function getWorkspaceDashboard(userId: string, workspaceId: string): Promise<WorkspaceDashboardSummary> {
  await requireWorkspaceMember(userId, workspaceId);

  const coverage = await db.companyCoverage.findMany({ where: { workspaceId }, select: { companyId: true } });
  const coveredCompanyIds = coverage.map((c) => c.companyId);

  const [activeProjects, reportsInReview, openIntegrityIssues, overdueTasks, recentEvents] = await Promise.all([
    db.researchProject.count({ where: { workspaceId, status: 'ACTIVE' } }),
    db.researchReport.count({ where: { reviewStatus: 'IN_REVIEW', reviews: { some: { workspaceId } } } }),
    coveredCompanyIds.length > 0 ? db.researchIntegrityIssue.count({ where: { companyId: { in: coveredCompanyIds }, status: { in: ['OPEN', 'ACKNOWLEDGED'] } } }) : 0,
    db.researchTask.count({ where: { workspaceId, status: { not: 'COMPLETED' }, dueDate: { lt: new Date() } } }),
    coveredCompanyIds.length > 0
      ? db.researchEvent.findMany({
          where: { companyId: { in: coveredCompanyIds } },
          orderBy: { eventDate: 'desc' },
          take: RECENT_CHANGES_LIMIT,
          include: { company: { select: { ticker: true, name: true } } },
        })
      : [],
  ]);

  return {
    companiesCovered: coveredCompanyIds.length,
    activeProjects,
    reportsInReview,
    openIntegrityIssues,
    overdueTasks,
    recentResearchChanges: recentEvents.map((e) => ({
      ticker: e.company.ticker,
      companyName: e.company.name,
      title: e.title,
      materiality: e.materiality,
      eventDate: e.eventDate.toISOString(),
    })),
  };
}
