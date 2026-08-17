import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { createWorkspace, addWorkspaceMember, WorkspaceForbiddenError, WorkspaceNotFoundError } from './workspaceService';
import { assignCompanyCoverage, InvalidCompanyCoverageInputError, listCompanyCoverage, removeCompanyCoverage } from './companyCoverageService';

const TEST_EMAIL = 'zz-coverage-service-test@example.com';
const TICKER = 'ZZCOV1';

async function makeUser(suffix: string) {
  const passwordHash = await hashPassword('irrelevant');
  return db.user.create({ data: { email: `${suffix}-${TEST_EMAIL}`, passwordHash } });
}

async function cleanup() {
  await db.workspace.deleteMany({ where: { createdBy: { email: { contains: TEST_EMAIL } } } });
  await db.user.deleteMany({ where: { email: { contains: TEST_EMAIL } } });
  await db.company.deleteMany({ where: { ticker: TICKER } });
}

describe('companyCoverageService', () => {
  beforeAll(cleanup);
  afterAll(cleanup);
  afterEach(cleanup);

  it('assigns coverage of a real company to a workspace member', async () => {
    const owner = await makeUser('assign-owner');
    const analyst = await makeUser('assign-analyst');
    const workspace = await createWorkspace(owner.id, { name: 'Coverage Test WS' });
    await addWorkspaceMember(owner.id, workspace.id, { email: analyst.email, role: 'ANALYST' });
    await db.company.create({ data: { ticker: TICKER, name: 'Coverage Test Co.' } });

    const coverage = await assignCompanyCoverage(owner.id, workspace.id, TICKER, analyst.id);
    expect(coverage.analystUserId).toBe(analyst.id);

    const list = await listCompanyCoverage(owner.id, workspace.id);
    expect(list).toHaveLength(1);
    expect(list[0]!.company.ticker).toBe(TICKER);
    expect(list[0]!.analyst.id).toBe(analyst.id);
  });

  it('an ANALYST cannot assign coverage - only OWNER/ADMIN', async () => {
    const owner = await makeUser('perm-owner');
    const analyst = await makeUser('perm-analyst');
    const workspace = await createWorkspace(owner.id, { name: 'Coverage Perm Test' });
    await addWorkspaceMember(owner.id, workspace.id, { email: analyst.email, role: 'ANALYST' });
    await db.company.create({ data: { ticker: TICKER, name: 'Coverage Test Co.' } });

    await expect(assignCompanyCoverage(analyst.id, workspace.id, TICKER, analyst.id)).rejects.toThrow(WorkspaceForbiddenError);
  });

  it('rejects assigning coverage to a non-existent ticker, never creating a phantom company', async () => {
    const owner = await makeUser('phantom-owner');
    const workspace = await createWorkspace(owner.id, { name: 'Coverage Phantom Test' });
    await expect(assignCompanyCoverage(owner.id, workspace.id, TICKER, owner.id)).rejects.toThrow(InvalidCompanyCoverageInputError);
    expect(await db.company.findUnique({ where: { ticker: TICKER } })).toBeNull();
  });

  it('rejects assigning coverage to a non-member analyst', async () => {
    const owner = await makeUser('nonmember-owner');
    const outsider = await makeUser('nonmember-outsider');
    const workspace = await createWorkspace(owner.id, { name: 'Coverage Nonmember Test' });
    await db.company.create({ data: { ticker: TICKER, name: 'Coverage Test Co.' } });

    await expect(assignCompanyCoverage(owner.id, workspace.id, TICKER, outsider.id)).rejects.toThrow(WorkspaceNotFoundError);
  });

  it('reassigning coverage updates the existing row rather than creating a second one', async () => {
    const owner = await makeUser('reassign-owner');
    const analystA = await makeUser('reassign-a');
    const analystB = await makeUser('reassign-b');
    const workspace = await createWorkspace(owner.id, { name: 'Coverage Reassign Test' });
    await addWorkspaceMember(owner.id, workspace.id, { email: analystA.email, role: 'ANALYST' });
    await addWorkspaceMember(owner.id, workspace.id, { email: analystB.email, role: 'ANALYST' });
    await db.company.create({ data: { ticker: TICKER, name: 'Coverage Test Co.' } });

    await assignCompanyCoverage(owner.id, workspace.id, TICKER, analystA.id);
    await assignCompanyCoverage(owner.id, workspace.id, TICKER, analystB.id);

    const list = await listCompanyCoverage(owner.id, workspace.id);
    expect(list).toHaveLength(1);
    expect(list[0]!.analyst.id).toBe(analystB.id);
  });

  it('removeCompanyCoverage removes the assignment', async () => {
    const owner = await makeUser('remove-owner');
    const workspace = await createWorkspace(owner.id, { name: 'Coverage Remove Test' });
    await db.company.create({ data: { ticker: TICKER, name: 'Coverage Test Co.' } });
    await assignCompanyCoverage(owner.id, workspace.id, TICKER, owner.id);

    await removeCompanyCoverage(owner.id, workspace.id, TICKER);
    expect(await listCompanyCoverage(owner.id, workspace.id)).toHaveLength(0);
  });
});
