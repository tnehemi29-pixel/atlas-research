import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { createWorkspace, addWorkspaceMember, WorkspaceForbiddenError } from './workspaceService';
import {
  addMeetingActionItem,
  addResearchMeetingDecision,
  createResearchMeeting,
  getResearchMeetingDetail,
  InvalidResearchMeetingInputError,
  listResearchMeetings,
} from './researchMeetingService';

const TEST_EMAIL = 'zz-meeting-service-test@example.com';
const TICKER = 'ZZMTG1';

async function makeUser(suffix: string) {
  const passwordHash = await hashPassword('irrelevant');
  return db.user.create({ data: { email: `${suffix}-${TEST_EMAIL}`, passwordHash } });
}

async function cleanup() {
  await db.workspace.deleteMany({ where: { createdBy: { email: { contains: TEST_EMAIL } } } });
  await db.user.deleteMany({ where: { email: { contains: TEST_EMAIL } } });
  await db.company.deleteMany({ where: { ticker: TICKER } });
}

describe('researchMeetingService', () => {
  beforeAll(cleanup);
  afterAll(cleanup);
  afterEach(cleanup);

  it('creates a meeting with the creator auto-included as a participant', async () => {
    const owner = await makeUser('create-owner');
    const workspace = await createWorkspace(owner.id, { name: 'Meeting Test WS' });
    const meeting = await createResearchMeeting(owner.id, workspace.id, { title: 'NVDA Earnings Review', date: new Date() });

    const detail = await getResearchMeetingDetail(owner.id, workspace.id, meeting.id);
    expect(detail.participants.some((p) => p.userId === owner.id)).toBe(true);
  });

  it('a VIEWER cannot create a meeting', async () => {
    const owner = await makeUser('viewer-owner');
    const viewer = await makeUser('viewer-viewer');
    const workspace = await createWorkspace(owner.id, { name: 'Viewer Meeting Test' });
    await addWorkspaceMember(owner.id, workspace.id, { email: viewer.email, role: 'VIEWER' });
    await expect(createResearchMeeting(viewer.id, workspace.id, { title: 'X', date: new Date() })).rejects.toThrow(WorkspaceForbiddenError);
  });

  it('resolves discussed companies by ticker and rejects a fake one', async () => {
    const owner = await makeUser('company-owner');
    const workspace = await createWorkspace(owner.id, { name: 'Company Meeting Test' });
    await expect(createResearchMeeting(owner.id, workspace.id, { title: 'X', date: new Date(), tickers: [TICKER] })).rejects.toThrow(InvalidResearchMeetingInputError);

    await db.company.create({ data: { ticker: TICKER, name: 'Meeting Test Co.' } });
    const meeting = await createResearchMeeting(owner.id, workspace.id, { title: 'X', date: new Date(), tickers: [TICKER] });
    const detail = await getResearchMeetingDetail(owner.id, workspace.id, meeting.id);
    expect(detail.companies[0]!.company.ticker).toBe(TICKER);
  });

  it('appends decisions without overwriting prior ones', async () => {
    const owner = await makeUser('decision-owner');
    const workspace = await createWorkspace(owner.id, { name: 'Decision Meeting Test' });
    const meeting = await createResearchMeeting(owner.id, workspace.id, { title: 'X', date: new Date() });

    await addResearchMeetingDecision(owner.id, workspace.id, meeting.id, 'Update DCF');
    const updated = await addResearchMeetingDecision(owner.id, workspace.id, meeting.id, 'Review capex assumptions');
    expect(updated.decisions).toEqual(['Update DCF', 'Review capex assumptions']);
  });

  it('addMeetingActionItem with createTask:true auto-creates a linked research task', async () => {
    const owner = await makeUser('action-owner');
    const analyst = await makeUser('action-analyst');
    const workspace = await createWorkspace(owner.id, { name: 'Action Meeting Test' });
    await addWorkspaceMember(owner.id, workspace.id, { email: analyst.email, role: 'ANALYST' });
    const meeting = await createResearchMeeting(owner.id, workspace.id, { title: 'X', date: new Date() });

    const actionItem = await addMeetingActionItem(owner.id, workspace.id, meeting.id, { description: 'Update DCF assumptions', assignedUserId: analyst.id, createTask: true, priority: 'HIGH' });
    expect(actionItem.taskId).not.toBeNull();

    const task = await db.researchTask.findUniqueOrThrow({ where: { id: actionItem.taskId! } });
    expect(task.title).toBe('Update DCF assumptions');
    expect(task.assignedUserId).toBe(analyst.id);
    expect(task.priority).toBe('HIGH');
  });

  it('addMeetingActionItem without createTask leaves it task-less', async () => {
    const owner = await makeUser('notask-owner');
    const workspace = await createWorkspace(owner.id, { name: 'No Task Meeting Test' });
    const meeting = await createResearchMeeting(owner.id, workspace.id, { title: 'X', date: new Date() });

    const actionItem = await addMeetingActionItem(owner.id, workspace.id, meeting.id, { description: 'Monitor gross margin' });
    expect(actionItem.taskId).toBeNull();
  });

  it('listResearchMeetings only returns meetings for the calling workspace', async () => {
    const ownerA = await makeUser('list-a');
    const ownerB = await makeUser('list-b');
    const workspaceA = await createWorkspace(ownerA.id, { name: 'List A' });
    const workspaceB = await createWorkspace(ownerB.id, { name: 'List B' });
    await createResearchMeeting(ownerA.id, workspaceA.id, { title: 'A meeting', date: new Date() });
    await createResearchMeeting(ownerB.id, workspaceB.id, { title: 'B meeting', date: new Date() });

    const forA = await listResearchMeetings(ownerA.id, workspaceA.id);
    expect(forA).toHaveLength(1);
    expect(forA[0]!.title).toBe('A meeting');
  });
});
