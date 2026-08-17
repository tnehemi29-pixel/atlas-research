import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { createWorkspace, addWorkspaceMember } from './workspaceService';
import { createResearchProject } from './researchProjectService';
import { assignCompanyCoverage } from './companyCoverageService';
import { submitReportForReview } from './researchReviewService';
import { getWorkspaceDashboard } from './workspaceDashboardService';

const TEST_EMAIL = 'zz-workspace-dashboard-test@example.com';
const TICKER = 'ZZWDASH';

async function makeUser(suffix: string) {
  const passwordHash = await hashPassword('irrelevant');
  return db.user.create({ data: { email: `${suffix}-${TEST_EMAIL}`, passwordHash } });
}

async function cleanup() {
  await db.workspace.deleteMany({ where: { createdBy: { email: { contains: TEST_EMAIL } } } });
  await db.user.deleteMany({ where: { email: { contains: TEST_EMAIL } } });
  const company = await db.company.findUnique({ where: { ticker: TICKER } });
  if (company) {
    await db.researchEvent.deleteMany({ where: { companyId: company.id } });
    await db.researchIntegrityIssue.deleteMany({ where: { companyId: company.id } });
    await db.researchReport.deleteMany({ where: { companyId: company.id } });
  }
  await db.company.deleteMany({ where: { ticker: TICKER } });
}

describe('workspaceDashboardService', () => {
  beforeAll(cleanup);
  afterAll(cleanup);
  afterEach(cleanup);

  it('reports zeros for a brand-new, empty workspace', async () => {
    const owner = await makeUser('empty-owner');
    const workspace = await createWorkspace(owner.id, { name: 'Empty Dashboard Test' });
    const dashboard = await getWorkspaceDashboard(owner.id, workspace.id);
    expect(dashboard).toEqual({ companiesCovered: 0, activeProjects: 0, reportsInReview: 0, openIntegrityIssues: 0, overdueTasks: 0, recentResearchChanges: [] });
  });

  it('aggregates coverage, active projects, reports in review, open integrity issues, overdue tasks, and recent changes', async () => {
    const owner = await makeUser('full-owner');
    const workspace = await createWorkspace(owner.id, { name: 'Full Dashboard Test' });
    const company = await db.company.create({ data: { ticker: TICKER, name: 'Dashboard Test Co.' } });

    await assignCompanyCoverage(owner.id, workspace.id, TICKER, owner.id);
    await createResearchProject(owner.id, workspace.id, { name: 'Active Project', status: 'ACTIVE' });
    await createResearchProject(owner.id, workspace.id, { name: 'Planned Project' });

    const report = await db.researchReport.create({
      data: { companyId: company.id, version: 1, status: 'SUCCESS', model: 'fixture', dataSnapshotAt: new Date(), content: { context: {}, report: null } },
    });
    await submitReportForReview(owner.id, workspace.id, report.id);

    await db.researchIntegrityIssue.create({
      data: { companyId: company.id, category: 'DATA_FRESHNESS', severity: 'MEDIUM', description: 'Stale data.', source: 'test', dedupeKey: `dq-test-${Date.now()}` },
    });

    await db.researchTask.create({
      data: { workspaceId: workspace.id, title: 'Overdue task', createdByUserId: owner.id, dueDate: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });

    await db.researchEvent.create({
      data: { companyId: company.id, category: 'FINANCIAL', type: 'DCF_VALUATION_CHANGE', title: 'DCF updated', description: 'The DCF valuation changed.', materiality: 'HIGH', confidence: 'HIGH', dedupeKey: `evt-test-${Date.now()}`, eventDate: new Date() },
    });

    const dashboard = await getWorkspaceDashboard(owner.id, workspace.id);
    expect(dashboard.companiesCovered).toBe(1);
    expect(dashboard.activeProjects).toBe(1);
    expect(dashboard.reportsInReview).toBe(1);
    expect(dashboard.openIntegrityIssues).toBe(1);
    expect(dashboard.overdueTasks).toBe(1);
    expect(dashboard.recentResearchChanges).toHaveLength(1);
    expect(dashboard.recentResearchChanges[0]!.ticker).toBe(TICKER);
    expect(dashboard.recentResearchChanges[0]!.materiality).toBe('HIGH');
  });

  it('a non-member cannot read the dashboard', async () => {
    const owner = await makeUser('priv-owner');
    const outsider = await makeUser('priv-outsider');
    const workspace = await createWorkspace(owner.id, { name: 'Private Dashboard Test' });
    await expect(getWorkspaceDashboard(outsider.id, workspace.id)).rejects.toThrow();
  });
});
