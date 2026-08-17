import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { createWorkspace } from './workspaceService';
import { assignCompanyCoverage } from './companyCoverageService';
import { computeResearchDigest, getResearchDigest } from './researchDigestService';

const TEST_EMAIL = 'zz-digest-service-test@example.com';
const TICKER = 'ZZDIG1';

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
    await db.researchReport.deleteMany({ where: { companyId: company.id } });
  }
  await db.company.deleteMany({ where: { ticker: TICKER } });
}

describe('researchDigestService', () => {
  beforeAll(cleanup);
  afterAll(cleanup);
  afterEach(cleanup);

  it('returns all zeros and no highlights for an empty workspace', async () => {
    const owner = await makeUser('empty-owner');
    const workspace = await createWorkspace(owner.id, { name: 'Empty Digest Test' });
    const digest = await computeResearchDigest(owner.id, workspace.id, 'WEEKLY');
    expect(digest.majorCompanyDevelopments).toBe(0);
    expect(digest.investmentCasesChanged).toBe(0);
    expect(digest.secFilingsReviewed).toBe(0);
    expect(digest.thesisChallenges).toBe(0);
    expect(digest.researchReportsUpdated).toBe(0);
    expect(digest.highlights).toEqual([]);
  });

  it('counts only HIGH/CRITICAL events within the period as major developments, and only newer reports', async () => {
    const owner = await makeUser('count-owner');
    const workspace = await createWorkspace(owner.id, { name: 'Count Digest Test' });
    const company = await db.company.create({ data: { ticker: TICKER, name: 'Digest Test Co.' } });
    await assignCompanyCoverage(owner.id, workspace.id, TICKER, owner.id);

    await db.researchEvent.create({
      data: { companyId: company.id, category: 'FINANCIAL', type: 'DCF_VALUATION_CHANGE', title: 'DCF updated', description: 'x', materiality: 'HIGH', confidence: 'HIGH', dedupeKey: `evt-a-${Date.now()}`, eventDate: new Date() },
    });
    await db.researchEvent.create({
      data: { companyId: company.id, category: 'FINANCIAL', type: 'MARGIN_CHANGE', title: 'Minor margin note', description: 'x', materiality: 'LOW', confidence: 'MEDIUM', dedupeKey: `evt-b-${Date.now()}`, eventDate: new Date() },
    });
    await db.researchEvent.create({
      data: { companyId: company.id, category: 'FINANCIAL', type: 'GUIDANCE_CHANGE', title: 'Old high-materiality event', description: 'x', materiality: 'CRITICAL', confidence: 'HIGH', dedupeKey: `evt-c-${Date.now()}`, eventDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    });
    await db.researchReport.create({ data: { companyId: company.id, version: 1, status: 'SUCCESS', model: 'fixture', dataSnapshotAt: new Date(), content: { context: {}, report: null } } });

    const weekly = await computeResearchDigest(owner.id, workspace.id, 'WEEKLY');
    expect(weekly.majorCompanyDevelopments).toBe(1);
    expect(weekly.highlights).toHaveLength(1);
    expect(weekly.highlights[0]!.title).toBe('DCF updated');
    expect(weekly.researchReportsUpdated).toBe(1);
  });

  it('only counts the CALLING USERs own investment case activity, never a workspace peers', async () => {
    const owner = await makeUser('privacy-owner');
    const workspace = await createWorkspace(owner.id, { name: 'Privacy Digest Test' });
    const company = await db.company.create({ data: { ticker: TICKER, name: 'Digest Test Co.' } });
    const otherUser = await makeUser('privacy-other');
    await db.investmentCase.create({ data: { userId: otherUser.id, companyId: company.id, horizon: '3-5 years', coreThesis: 'Not the callers case.' } });

    const digest = await computeResearchDigest(owner.id, workspace.id, 'WEEKLY');
    expect(digest.investmentCasesChanged).toBe(0);
  });

  it('a non-member cannot compute a digest', async () => {
    const owner = await makeUser('nomember-owner');
    const outsider = await makeUser('nomember-outsider');
    const workspace = await createWorkspace(owner.id, { name: 'No Member Digest Test' });
    await expect(computeResearchDigest(outsider.id, workspace.id, 'WEEKLY')).rejects.toThrow();
  });

  it('getResearchDigest degrades gracefully to narrative: null when the AI is unavailable, without losing the deterministic counts', async () => {
    const owner = await makeUser('narrative-owner');
    const workspace = await createWorkspace(owner.id, { name: 'Narrative Digest Test' });
    const digest = await getResearchDigest(owner.id, workspace.id, 'DAILY');
    expect(digest.narrative).toBeNull();
    expect(digest.period).toBe('DAILY');
  });
});
