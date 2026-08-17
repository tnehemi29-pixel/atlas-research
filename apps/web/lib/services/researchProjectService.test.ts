import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { createWorkspace, addWorkspaceMember } from './workspaceService';
import {
  addResearchProjectCompany,
  addResearchProjectMember,
  createResearchProject,
  getResearchProjectDetail,
  InvalidResearchProjectInputError,
  listResearchProjects,
  removeResearchProjectCompany,
  removeResearchProjectMember,
  ResearchProjectNotFoundError,
  updateResearchProject,
} from './researchProjectService';
import { WorkspaceForbiddenError, WorkspaceNotFoundError } from './workspaceService';

const TEST_EMAIL = 'zz-project-service-test@example.com';
const TICKER = 'ZZPROJ1';

async function makeUser(suffix: string) {
  const passwordHash = await hashPassword('irrelevant');
  return db.user.create({ data: { email: `${suffix}-${TEST_EMAIL}`, passwordHash } });
}

async function cleanup() {
  await db.workspace.deleteMany({ where: { createdBy: { email: { contains: TEST_EMAIL } } } });
  await db.user.deleteMany({ where: { email: { contains: TEST_EMAIL } } });
  await db.company.deleteMany({ where: { ticker: TICKER } });
}

describe('researchProjectService', () => {
  beforeAll(cleanup);
  afterAll(cleanup);
  afterEach(cleanup);

  it('creates a project with the creator as default owner and PLANNED status', async () => {
    const owner = await makeUser('create-owner');
    const workspace = await createWorkspace(owner.id, { name: 'Project Test WS' });

    const project = await createResearchProject(owner.id, workspace.id, { name: 'Cloud Software Sector Review' });
    expect(project.status).toBe('PLANNED');
    expect(project.ownerUserId).toBe(owner.id);
  });

  it('a VIEWER cannot create a project', async () => {
    const owner = await makeUser('viewer-owner');
    const viewer = await makeUser('viewer-viewer');
    const workspace = await createWorkspace(owner.id, { name: 'Viewer Project Test' });
    await addWorkspaceMember(owner.id, workspace.id, { email: viewer.email, role: 'VIEWER' });

    await expect(createResearchProject(viewer.id, workspace.id, { name: 'Should Fail' })).rejects.toThrow(WorkspaceForbiddenError);
  });

  it('a project id from another workspace 404s, never leaking cross-workspace existence', async () => {
    const ownerA = await makeUser('cross-a');
    const ownerB = await makeUser('cross-b');
    const workspaceA = await createWorkspace(ownerA.id, { name: 'Cross Workspace A' });
    const workspaceB = await createWorkspace(ownerB.id, { name: 'Cross Workspace B' });
    const projectInA = await createResearchProject(ownerA.id, workspaceA.id, { name: 'A Only Project' });

    await expect(getResearchProjectDetail(ownerB.id, workspaceB.id, projectInA.id)).rejects.toThrow(ResearchProjectNotFoundError);
  });

  it('updateResearchProject requires ANALYST+ and updates status', async () => {
    const owner = await makeUser('update-owner');
    const workspace = await createWorkspace(owner.id, { name: 'Update Project Test' });
    const project = await createResearchProject(owner.id, workspace.id, { name: 'Semiconductor Industry Research' });

    const updated = await updateResearchProject(owner.id, workspace.id, project.id, { status: 'ACTIVE' });
    expect(updated.status).toBe('ACTIVE');
  });

  it('listResearchProjects filters by status and only returns the calling workspace', async () => {
    const owner = await makeUser('list-owner');
    const workspace = await createWorkspace(owner.id, { name: 'List Project Test' });
    await createResearchProject(owner.id, workspace.id, { name: 'Planned One' });
    const active = await createResearchProject(owner.id, workspace.id, { name: 'Active One', status: 'ACTIVE' });

    const activeOnly = await listResearchProjects(owner.id, workspace.id, { status: 'ACTIVE' });
    expect(activeOnly).toHaveLength(1);
    expect(activeOnly[0]!.id).toBe(active.id);
  });

  it('addResearchProjectMember requires the target user to already be a workspace member', async () => {
    const owner = await makeUser('member-owner');
    const outsider = await makeUser('member-outsider');
    const workspace = await createWorkspace(owner.id, { name: 'Member Project Test' });
    const project = await createResearchProject(owner.id, workspace.id, { name: 'Member Test Project' });

    await expect(addResearchProjectMember(owner.id, workspace.id, project.id, outsider.id)).rejects.toThrow(WorkspaceNotFoundError);

    const analyst = await makeUser('member-analyst');
    await addWorkspaceMember(owner.id, workspace.id, { email: analyst.email, role: 'ANALYST' });
    await addResearchProjectMember(owner.id, workspace.id, project.id, analyst.id);

    const detail = await getResearchProjectDetail(owner.id, workspace.id, project.id);
    expect(detail.members.some((m) => m.userId === analyst.id)).toBe(true);

    await removeResearchProjectMember(owner.id, workspace.id, project.id, analyst.id);
    const afterRemoval = await getResearchProjectDetail(owner.id, workspace.id, project.id);
    expect(afterRemoval.members.some((m) => m.userId === analyst.id)).toBe(false);
  });

  it('addResearchProjectCompany looks up a real ticker and never creates a phantom company', async () => {
    const owner = await makeUser('company-owner');
    const workspace = await createWorkspace(owner.id, { name: 'Company Project Test' });
    const project = await createResearchProject(owner.id, workspace.id, { name: 'Company Test Project' });

    await expect(addResearchProjectCompany(owner.id, workspace.id, project.id, TICKER)).rejects.toThrow(InvalidResearchProjectInputError);

    await db.company.create({ data: { ticker: TICKER, name: 'Coverage Test Co.' } });
    await addResearchProjectCompany(owner.id, workspace.id, project.id, TICKER);

    const detail = await getResearchProjectDetail(owner.id, workspace.id, project.id);
    expect(detail.companies.some((c) => c.company.ticker === TICKER)).toBe(true);

    await removeResearchProjectCompany(owner.id, workspace.id, project.id, detail.companies[0]!.company.id);
    const afterRemoval = await getResearchProjectDetail(owner.id, workspace.id, project.id);
    expect(afterRemoval.companies).toHaveLength(0);
  });
});
