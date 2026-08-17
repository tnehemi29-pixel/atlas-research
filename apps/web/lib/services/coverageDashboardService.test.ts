import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { createWorkspace, addWorkspaceMember } from './workspaceService';
import { assignCompanyCoverage } from './companyCoverageService';
import { getAnalystCoverageSummary, getCoverageTable } from './coverageDashboardService';

const TEST_EMAIL = 'zz-coverage-dashboard-test@example.com';
const TICKER = 'ZZCDASH';

async function makeUser(suffix: string) {
  const passwordHash = await hashPassword('irrelevant');
  return db.user.create({ data: { email: `${suffix}-${TEST_EMAIL}`, passwordHash } });
}

async function cleanup() {
  await db.workspace.deleteMany({ where: { createdBy: { email: { contains: TEST_EMAIL } } } });
  await db.user.deleteMany({ where: { email: { contains: TEST_EMAIL } } });
  const company = await db.company.findUnique({ where: { ticker: TICKER } });
  if (company) await db.researchReport.deleteMany({ where: { companyId: company.id } });
  await db.company.deleteMany({ where: { ticker: TICKER } });
}

describe('coverageDashboardService', () => {
  beforeAll(cleanup);
  afterAll(cleanup);
  afterEach(cleanup);

  it('getCoverageTable shows the assigned analyst, open tasks, and open integrity issues per covered company', async () => {
    const owner = await makeUser('table-owner');
    const analyst = await makeUser('table-analyst');
    const workspace = await createWorkspace(owner.id, { name: 'Coverage Table Test' });
    await addWorkspaceMember(owner.id, workspace.id, { email: analyst.email, role: 'ANALYST' });
    await db.company.create({ data: { ticker: TICKER, name: 'Coverage Table Co.', sector: 'Technology' } });
    await assignCompanyCoverage(owner.id, workspace.id, TICKER, analyst.id);

    const rows = await getCoverageTable(owner.id, workspace.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.ticker).toBe(TICKER);
    expect(rows[0]!.sector).toBe('Technology');
    expect(rows[0]!.analyst?.id).toBe(analyst.id);
    expect(rows[0]!.openTasks).toBe(0);
    expect(rows[0]!.openIntegrityIssues).toBe(0);
  });

  it('getAnalystCoverageSummary counts companies/reports/open tasks per workspace member, never a performance score', async () => {
    const owner = await makeUser('summary-owner');
    const analyst = await makeUser('summary-analyst');
    const workspace = await createWorkspace(owner.id, { name: 'Coverage Summary Test' });
    await addWorkspaceMember(owner.id, workspace.id, { email: analyst.email, role: 'ANALYST' });
    const company = await db.company.create({ data: { ticker: TICKER, name: 'Coverage Summary Co.' } });
    await assignCompanyCoverage(owner.id, workspace.id, TICKER, analyst.id);
    await db.researchReport.create({ data: { companyId: company.id, version: 1, status: 'SUCCESS', model: 'fixture', dataSnapshotAt: new Date(), content: { context: {}, report: null } } });
    await db.researchTask.create({ data: { workspaceId: workspace.id, title: 'Assigned task', createdByUserId: owner.id, assignedUserId: analyst.id } });

    const summary = await getAnalystCoverageSummary(owner.id, workspace.id);
    const analystRow = summary.find((r) => r.analyst.id === analyst.id);
    expect(analystRow?.companies).toBe(1);
    expect(analystRow?.reports).toBe(1);
    expect(analystRow?.openTasks).toBe(1);
    // No performance/ranking field exists anywhere on the row.
    expect((analystRow as unknown as Record<string, unknown>).performance).toBeUndefined();
    expect((analystRow as unknown as Record<string, unknown>).returns).toBeUndefined();
  });
});
