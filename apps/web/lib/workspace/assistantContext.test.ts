import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { createWorkspace, addWorkspaceMember, WorkspaceNotFoundError } from '@/lib/services/workspaceService';
import { createResearchProject } from '@/lib/services/researchProjectService';
import { assignCompanyCoverage } from '@/lib/services/companyCoverageService';
import { createResearchTask } from '@/lib/services/researchTaskService';
import { buildWorkspaceAssistantContext, collectValidWorkspaceContextIds } from './assistantContext';

const TEST_EMAIL = 'zz-assistant-context-test@example.com';
const TICKER = 'ZZAI1';

async function makeUser(suffix: string) {
  const passwordHash = await hashPassword('irrelevant');
  return db.user.create({ data: { email: `${suffix}-${TEST_EMAIL}`, passwordHash } });
}

async function cleanup() {
  await db.workspace.deleteMany({ where: { createdBy: { email: { contains: TEST_EMAIL } } } });
  await db.user.deleteMany({ where: { email: { contains: TEST_EMAIL } } });
  await db.company.deleteMany({ where: { ticker: TICKER } });
}

describe('buildWorkspaceAssistantContext', () => {
  beforeAll(cleanup);
  afterAll(cleanup);
  afterEach(cleanup);

  it('rejects a non-member - the assistant can never be asked about a workspace you cannot access', async () => {
    const owner = await makeUser('priv-owner');
    const outsider = await makeUser('priv-outsider');
    const workspace = await createWorkspace(owner.id, { name: 'Assistant Privacy Test' });
    await expect(buildWorkspaceAssistantContext(outsider.id, workspace.id)).rejects.toThrow(WorkspaceNotFoundError);
  });

  it('includes covered companies and open tasks, every row carrying a citable id', async () => {
    const owner = await makeUser('build-owner');
    const workspace = await createWorkspace(owner.id, { name: 'Assistant Build Test' });
    await db.company.create({ data: { ticker: TICKER, name: 'Assistant Test Co.' } });
    await assignCompanyCoverage(owner.id, workspace.id, TICKER, owner.id);
    await createResearchTask(owner.id, workspace.id, { title: 'Review latest 10-Q', ticker: TICKER, priority: 'HIGH' });

    const context = await buildWorkspaceAssistantContext(owner.id, workspace.id);
    expect(context.coveredCompanies).toHaveLength(1);
    expect(context.coveredCompanies[0]!.ticker).toBe(TICKER);
    expect(context.openTasks).toHaveLength(1);

    const validIds = collectValidWorkspaceContextIds(context);
    expect(validIds.has(context.coveredCompanies[0]!.id)).toBe(true);
    expect(validIds.has(context.openTasks[0]!.id)).toBe(true);
  });

  it("never includes another user's investment case unless it has been submitted to committee review", async () => {
    const owner = await makeUser('privacy-owner');
    const peer = await makeUser('privacy-peer');
    const workspace = await createWorkspace(owner.id, { name: 'Assistant Case Privacy Test' });
    await addWorkspaceMember(owner.id, workspace.id, { email: peer.email, role: 'ANALYST' });
    const project = await createResearchProject(owner.id, workspace.id, { name: 'Case Privacy Project' });
    const company = await db.company.create({ data: { ticker: TICKER, name: 'Assistant Test Co.' } });

    const privateCase = await db.investmentCase.create({ data: { userId: peer.id, companyId: company.id, projectId: project.id, horizon: '3-5 years', coreThesis: 'Private thesis.' } });

    const contextForOwner = await buildWorkspaceAssistantContext(owner.id, workspace.id);
    expect(contextForOwner.callerOwnCases).toHaveLength(0);
    expect(contextForOwner.committeeSubmissions).toHaveLength(0);

    await db.investmentCase.update({ where: { id: privateCase.id }, data: { committeeReviewStatus: 'SUBMITTED', committeeSubmittedAt: new Date() } });

    const contextAfterSubmit = await buildWorkspaceAssistantContext(owner.id, workspace.id);
    expect(contextAfterSubmit.committeeSubmissions).toHaveLength(1);
    expect(contextAfterSubmit.committeeSubmissions[0]!.ticker).toBe(TICKER);
    // Still never shown as the OWNER's "own" case - it belongs to the peer.
    expect(contextAfterSubmit.callerOwnCases).toHaveLength(0);
  });
});
