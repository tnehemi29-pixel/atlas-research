import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { createWorkspace, addWorkspaceMember, WorkspaceForbiddenError, WorkspaceNotFoundError } from './workspaceService';
import { createResearchProject } from './researchProjectService';
import {
  createResearchTask,
  getResearchTaskDetail,
  InvalidResearchTaskInputError,
  listResearchTasks,
  ResearchTaskNotFoundError,
  updateResearchTask,
} from './researchTaskService';

const TEST_EMAIL = 'zz-task-service-test@example.com';
const TICKER = 'ZZTASK1';

async function makeUser(suffix: string) {
  const passwordHash = await hashPassword('irrelevant');
  return db.user.create({ data: { email: `${suffix}-${TEST_EMAIL}`, passwordHash } });
}

async function cleanup() {
  await db.workspace.deleteMany({ where: { createdBy: { email: { contains: TEST_EMAIL } } } });
  await db.user.deleteMany({ where: { email: { contains: TEST_EMAIL } } });
  await db.company.deleteMany({ where: { ticker: TICKER } });
}

describe('researchTaskService', () => {
  beforeAll(cleanup);
  afterAll(cleanup);
  afterEach(cleanup);

  it('creates a task with defaults (MEDIUM priority, TODO status)', async () => {
    const owner = await makeUser('create-owner');
    const workspace = await createWorkspace(owner.id, { name: 'Task Test WS' });
    const task = await createResearchTask(owner.id, workspace.id, { title: 'Review latest 10-Q' });
    expect(task.priority).toBe('MEDIUM');
    expect(task.status).toBe('TODO');
  });

  it('a VIEWER cannot create a task', async () => {
    const owner = await makeUser('viewer-owner');
    const viewer = await makeUser('viewer-viewer');
    const workspace = await createWorkspace(owner.id, { name: 'Viewer Task Test' });
    await addWorkspaceMember(owner.id, workspace.id, { email: viewer.email, role: 'VIEWER' });
    await expect(createResearchTask(viewer.id, workspace.id, { title: 'Should fail' })).rejects.toThrow(WorkspaceForbiddenError);
  });

  it('resolves a real ticker but rejects a fake one - never creates a phantom company', async () => {
    const owner = await makeUser('ticker-owner');
    const workspace = await createWorkspace(owner.id, { name: 'Ticker Task Test' });
    await expect(createResearchTask(owner.id, workspace.id, { title: 'Update DCF assumptions', ticker: TICKER })).rejects.toThrow(InvalidResearchTaskInputError);

    await db.company.create({ data: { ticker: TICKER, name: 'Task Test Co.' } });
    const task = await createResearchTask(owner.id, workspace.id, { title: 'Update DCF assumptions', ticker: TICKER });
    const detail = await getResearchTaskDetail(owner.id, workspace.id, task.id);
    expect(detail.company?.ticker).toBe(TICKER);
  });

  it('a task tied to a project must belong to the same workspace', async () => {
    const ownerA = await makeUser('cross-a');
    const ownerB = await makeUser('cross-b');
    const workspaceA = await createWorkspace(ownerA.id, { name: 'Cross A' });
    const workspaceB = await createWorkspace(ownerB.id, { name: 'Cross B' });
    const projectInA = await createResearchProject(ownerA.id, workspaceA.id, { name: 'A Project' });

    await expect(createResearchTask(ownerB.id, workspaceB.id, { title: 'Cross workspace task', projectId: projectInA.id })).rejects.toThrow(InvalidResearchTaskInputError);
  });

  it('a task id from another workspace 404s', async () => {
    const ownerA = await makeUser('detail-a');
    const ownerB = await makeUser('detail-b');
    const workspaceA = await createWorkspace(ownerA.id, { name: 'Detail A' });
    const workspaceB = await createWorkspace(ownerB.id, { name: 'Detail B' });
    const task = await createResearchTask(ownerA.id, workspaceA.id, { title: 'A only task' });

    await expect(getResearchTaskDetail(ownerB.id, workspaceB.id, task.id)).rejects.toThrow(ResearchTaskNotFoundError);
  });

  it('the assignee can complete their own task even without ANALYST-level general edit rights elsewhere', async () => {
    const owner = await makeUser('assignee-owner');
    const viewer = await makeUser('assignee-viewer');
    const workspace = await createWorkspace(owner.id, { name: 'Assignee Test' });
    await addWorkspaceMember(owner.id, workspace.id, { email: viewer.email, role: 'VIEWER' });
    const task = await createResearchTask(owner.id, workspace.id, { title: 'Analyze margin compression', assignedUserId: viewer.id });

    // A viewer with no assignment still cannot edit.
    const otherTask = await createResearchTask(owner.id, workspace.id, { title: 'Unassigned task' });
    await expect(updateResearchTask(viewer.id, workspace.id, otherTask.id, { status: 'IN_PROGRESS' })).rejects.toThrow(WorkspaceForbiddenError);

    // But the viewer CAN complete their own assigned task.
    const updated = await updateResearchTask(viewer.id, workspace.id, task.id, { status: 'COMPLETED' });
    expect(updated.status).toBe('COMPLETED');
    expect(updated.completedAt).not.toBeNull();
  });

  it('listResearchTasks filters by status, priority, and assignee', async () => {
    const owner = await makeUser('list-owner');
    const analyst = await makeUser('list-analyst');
    const workspace = await createWorkspace(owner.id, { name: 'List Task Test' });
    await addWorkspaceMember(owner.id, workspace.id, { email: analyst.email, role: 'ANALYST' });
    await createResearchTask(owner.id, workspace.id, { title: 'Low priority task', priority: 'LOW' });
    const critical = await createResearchTask(owner.id, workspace.id, { title: 'Critical task', priority: 'CRITICAL', assignedUserId: analyst.id });

    const critOnly = await listResearchTasks(owner.id, workspace.id, { priority: 'CRITICAL' });
    expect(critOnly).toHaveLength(1);
    expect(critOnly[0]!.id).toBe(critical.id);

    const forAnalyst = await listResearchTasks(owner.id, workspace.id, { assignedUserId: analyst.id });
    expect(forAnalyst).toHaveLength(1);
  });
});
