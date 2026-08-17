import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { listSavedReports, saveReport, SavedReportTargetNotFoundError, unsaveReport } from './savedReportService';

const TEST_EMAIL = 'zz-saved-report-test@example.com';
const TICKER = 'ZZSAVEDREPORT';

async function makeUser(suffix: string) {
  const passwordHash = await hashPassword('irrelevant');
  return db.user.create({ data: { email: `${suffix}-${TEST_EMAIL}`, passwordHash } });
}

async function makeReport() {
  const company = await db.company.upsert({ where: { ticker: TICKER }, create: { ticker: TICKER, name: 'Saved Report Co.' }, update: {} });
  const latest = await db.researchReport.findFirst({ where: { companyId: company.id }, orderBy: { version: 'desc' } });
  return db.researchReport.create({
    data: {
      companyId: company.id,
      version: (latest?.version ?? 0) + 1,
      status: 'SUCCESS',
      model: 'manual-fixture',
      dataSnapshotAt: new Date(),
      content: { context: {}, report: null },
    },
  });
}

async function cleanup() {
  await db.user.deleteMany({ where: { email: { contains: TEST_EMAIL } } });
  await db.company.deleteMany({ where: { ticker: TICKER } });
}

describe('savedReportService', () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  it('saves, lists, and unsaves a report', async () => {
    const user = await makeUser('crud');
    const report = await makeReport();

    await saveReport(user.id, report.id);
    const saved = await listSavedReports(user.id);
    expect(saved).toHaveLength(1);
    expect(saved[0]?.researchReport.id).toBe(report.id);

    await unsaveReport(user.id, report.id);
    expect(await listSavedReports(user.id)).toHaveLength(0);
  });

  it('is idempotent — saving the same report twice does not error or duplicate', async () => {
    const user = await makeUser('idempotent');
    const report = await makeReport();

    await saveReport(user.id, report.id);
    await saveReport(user.id, report.id);

    expect(await listSavedReports(user.id)).toHaveLength(1);
  });

  it('throws for a nonexistent report id', async () => {
    const user = await makeUser('missing');
    await expect(saveReport(user.id, 'does-not-exist')).rejects.toBeInstanceOf(SavedReportTargetNotFoundError);
  });

  it("never lets User B unsave User A's bookmark", async () => {
    const userA = await makeUser('secure-a');
    const userB = await makeUser('secure-b');
    const report = await makeReport();

    await saveReport(userA.id, report.id);
    await unsaveReport(userB.id, report.id);

    // Still there for A — B's call matched zero rows.
    expect(await listSavedReports(userA.id)).toHaveLength(1);
  });

  it("never shows User A's saved reports to User B", async () => {
    const userA = await makeUser('list-a');
    const userB = await makeUser('list-b');
    const report = await makeReport();

    await saveReport(userA.id, report.id);
    expect(await listSavedReports(userB.id)).toHaveLength(0);
  });
});
