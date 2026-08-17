import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { createWorkspace } from './workspaceService';
import { createResearchTask } from './researchTaskService';
import { createResearchMeeting } from './researchMeetingService';
import { getWorkspaceCalendar } from './researchCalendarService';

const TEST_EMAIL = 'zz-calendar-service-test@example.com';
const TICKER = 'ZZCAL1';

async function makeUser(suffix: string) {
  const passwordHash = await hashPassword('irrelevant');
  return db.user.create({ data: { email: `${suffix}-${TEST_EMAIL}`, passwordHash } });
}

async function cleanup() {
  await db.workspace.deleteMany({ where: { createdBy: { email: { contains: TEST_EMAIL } } } });
  await db.user.deleteMany({ where: { email: { contains: TEST_EMAIL } } });
  await db.company.deleteMany({ where: { ticker: TICKER } });
}

describe('researchCalendarService', () => {
  beforeAll(cleanup);
  afterAll(cleanup);
  afterEach(cleanup);

  it('merges task due dates and meeting dates, sorted chronologically', async () => {
    const owner = await makeUser('merge-owner');
    const workspace = await createWorkspace(owner.id, { name: 'Calendar Test WS' });

    const laterDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const soonerDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    await createResearchTask(owner.id, workspace.id, { title: 'Later task', dueDate: laterDate });
    await createResearchMeeting(owner.id, workspace.id, { title: 'Sooner meeting', date: soonerDate });

    const calendar = await getWorkspaceCalendar(owner.id, workspace.id);
    expect(calendar).toHaveLength(2);
    expect(calendar[0]!.type).toBe('MEETING');
    expect(calendar[0]!.title).toBe('Sooner meeting');
    expect(calendar[1]!.type).toBe('TASK_DUE');
    expect(calendar[1]!.title).toBe('Later task');
  });

  it('excludes completed tasks and tasks with no due date', async () => {
    const owner = await makeUser('exclude-owner');
    const workspace = await createWorkspace(owner.id, { name: 'Calendar Exclude Test' });
    await createResearchTask(owner.id, workspace.id, { title: 'No due date' });
    const withDueDate = await createResearchTask(owner.id, workspace.id, { title: 'Has due date', dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000) });
    await db.researchTask.update({ where: { id: withDueDate.id }, data: { status: 'COMPLETED' } });

    const calendar = await getWorkspaceCalendar(owner.id, workspace.id);
    expect(calendar).toHaveLength(0);
  });

  it('a non-member cannot read the calendar', async () => {
    const owner = await makeUser('priv-owner');
    const outsider = await makeUser('priv-outsider');
    const workspace = await createWorkspace(owner.id, { name: 'Calendar Privacy Test' });
    await expect(getWorkspaceCalendar(outsider.id, workspace.id)).rejects.toThrow();
  });
});
