import { db } from '@/lib/db';
import { requireWorkspaceMember } from '@/lib/services/workspaceService';

/**
 * Milestone 15 spec section 22 — the AI Research Assistant "must use only
 * workspace-authorized data" and "must respect user permissions, workspace
 * membership, and company access." This module is the ONE place that
 * assembles the assistant's context: every row is read through an existing,
 * already-authorized service or a query scoped to this workspace/this
 * user's own data — never a raw cross-workspace or cross-user query. Every
 * row carries a stable, citable id (e.g. `task:<id>`) so the AI layer can
 * cite a real Atlas record, checked against `collectValidContextIds` before
 * ever being shown to the user (mirrors Milestone 13's `collectValidCitationIds`
 * discipline exactly).
 */

const MAX_ROWS = 15;

export interface WorkspaceAssistantContext {
  workspaceName: string;
  callerRole: string;
  coveredCompanies: { id: string; ticker: string; name: string; analystName: string | null }[];
  openTasks: { id: string; title: string; ticker: string | null; assignee: string | null; priority: string; status: string; dueDate: string | null }[];
  reportsInReview: { id: string; ticker: string; version: number; submittedAt: string }[];
  openIntegrityIssues: { id: string; ticker: string; category: string; severity: string; description: string }[];
  recentResearchChanges: { id: string; ticker: string; title: string; materiality: string; eventDate: string }[];
  committeeSubmissions: { id: string; ticker: string; ownerName: string | null; horizon: string }[];
  callerOwnCases: { id: string; ticker: string; status: string; coreThesis: string }[];
}

export async function buildWorkspaceAssistantContext(userId: string, workspaceId: string): Promise<WorkspaceAssistantContext> {
  const member = await requireWorkspaceMember(userId, workspaceId);
  const workspace = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId } });

  const coverage = await db.companyCoverage.findMany({
    where: { workspaceId },
    include: { company: { select: { id: true, ticker: true, name: true } }, analyst: { select: { name: true } } },
    take: MAX_ROWS,
  });
  const coveredCompanyIds = coverage.map((c) => c.companyId);

  const [tasks, reviews, issues, events, committeeCases, ownCases] = await Promise.all([
    db.researchTask.findMany({
      where: { workspaceId, status: { not: 'COMPLETED' } },
      include: { company: { select: { ticker: true } }, assignedUser: { select: { name: true, email: true } } },
      orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
      take: MAX_ROWS,
    }),
    db.researchReview.findMany({
      where: { workspaceId, approvedAt: null },
      include: { researchReport: { select: { version: true, company: { select: { ticker: true } } } } },
      take: MAX_ROWS,
    }),
    coveredCompanyIds.length > 0
      ? db.researchIntegrityIssue.findMany({
          where: { companyId: { in: coveredCompanyIds }, status: { in: ['OPEN', 'ACKNOWLEDGED'] } },
          include: { company: { select: { ticker: true } } },
          orderBy: { severity: 'desc' },
          take: MAX_ROWS,
        })
      : [],
    coveredCompanyIds.length > 0
      ? db.researchEvent.findMany({ where: { companyId: { in: coveredCompanyIds } }, orderBy: { eventDate: 'desc' }, include: { company: { select: { ticker: true } } }, take: MAX_ROWS })
      : [],
    db.investmentCase.findMany({
      where: { committeeReviewStatus: 'SUBMITTED', project: { workspaceId } },
      include: { company: { select: { ticker: true } }, user: { select: { name: true } } },
      take: MAX_ROWS,
    }),
    db.investmentCase.findMany({ where: { userId, project: { workspaceId } }, include: { company: { select: { ticker: true } } }, take: MAX_ROWS }),
  ]);

  return {
    workspaceName: workspace.name,
    callerRole: member.role,
    coveredCompanies: coverage.map((c) => ({ id: `company:${c.companyId}`, ticker: c.company.ticker, name: c.company.name, analystName: c.analyst.name })),
    openTasks: tasks.map((t) => ({
      id: `task:${t.id}`,
      title: t.title,
      ticker: t.company?.ticker ?? null,
      assignee: t.assignedUser?.name ?? t.assignedUser?.email ?? null,
      priority: t.priority,
      status: t.status,
      dueDate: t.dueDate?.toISOString() ?? null,
    })),
    reportsInReview: reviews.map((r) => ({ id: `review:${r.id}`, ticker: r.researchReport.company.ticker, version: r.researchReport.version, submittedAt: r.submittedAt.toISOString() })),
    openIntegrityIssues: issues.map((i) => ({ id: `issue:${i.id}`, ticker: i.company.ticker, category: i.category, severity: i.severity, description: i.description })),
    recentResearchChanges: events.map((e) => ({ id: `event:${e.id}`, ticker: e.company.ticker, title: e.title, materiality: e.materiality, eventDate: e.eventDate.toISOString() })),
    committeeSubmissions: committeeCases.map((c) => ({ id: `case:${c.id}`, ticker: c.company.ticker, ownerName: c.user.name, horizon: c.horizon })),
    callerOwnCases: ownCases.map((c) => ({ id: `case:${c.id}`, ticker: c.company.ticker, status: c.status, coreThesis: c.coreThesis.slice(0, 280) })),
  };
}

/** Every id that legitimately appears in a built context — the AI layer
 * checks its own citations against this set before ever showing them. */
export function collectValidWorkspaceContextIds(context: WorkspaceAssistantContext): Set<string> {
  const ids = new Set<string>();
  for (const row of context.coveredCompanies) ids.add(row.id);
  for (const row of context.openTasks) ids.add(row.id);
  for (const row of context.reportsInReview) ids.add(row.id);
  for (const row of context.openIntegrityIssues) ids.add(row.id);
  for (const row of context.recentResearchChanges) ids.add(row.id);
  for (const row of context.committeeSubmissions) ids.add(row.id);
  for (const row of context.callerOwnCases) ids.add(row.id);
  return ids;
}
