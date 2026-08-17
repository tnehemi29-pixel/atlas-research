import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { createWorkspace, addWorkspaceMember } from './workspaceService';
import { createResearchNote } from './researchNoteService';
import { createResearchTask } from './researchTaskService';
import { createResearchComment, InvalidResearchCommentInputError, listResearchComments } from './researchCommentService';

const TEST_EMAIL = 'zz-comment-service-test@example.com';
const TICKER = 'ZZCMT1';

async function makeUser(suffix: string) {
  const passwordHash = await hashPassword('irrelevant');
  return db.user.create({ data: { email: `${suffix}-${TEST_EMAIL}`, passwordHash } });
}

async function cleanup() {
  await db.workspace.deleteMany({ where: { createdBy: { email: { contains: TEST_EMAIL } } } });
  await db.user.deleteMany({ where: { email: { contains: TEST_EMAIL } } });
  await db.company.deleteMany({ where: { ticker: TICKER } });
}

describe('researchCommentService', () => {
  beforeAll(cleanup);
  afterAll(cleanup);
  afterEach(cleanup);

  it('a VIEWER can comment on a research note, even though they cannot create one', async () => {
    const owner = await makeUser('viewer-owner');
    const viewer = await makeUser('viewer-viewer');
    const workspace = await createWorkspace(owner.id, { name: 'Comment Test WS' });
    await addWorkspaceMember(owner.id, workspace.id, { email: viewer.email, role: 'VIEWER' });
    const note = await createResearchNote(owner.id, workspace.id, { title: 'A note', content: 'Content.' });

    const comment = await createResearchComment(viewer.id, workspace.id, { parentType: 'RESEARCH_NOTE', parentId: note.id, content: 'Good catch.' });
    expect(comment.authorId).toBe(viewer.id);

    const comments = await listResearchComments(owner.id, workspace.id, 'RESEARCH_NOTE', note.id);
    expect(comments).toHaveLength(1);
  });

  it('rejects a comment on a note that belongs to a different workspace', async () => {
    const ownerA = await makeUser('cross-a');
    const ownerB = await makeUser('cross-b');
    const workspaceA = await createWorkspace(ownerA.id, { name: 'Cross A' });
    const workspaceB = await createWorkspace(ownerB.id, { name: 'Cross B' });
    const noteInA = await createResearchNote(ownerA.id, workspaceA.id, { title: 'A only', content: 'Content.' });

    await expect(createResearchComment(ownerB.id, workspaceB.id, { parentType: 'RESEARCH_NOTE', parentId: noteInA.id, content: 'Should fail.' })).rejects.toThrow(InvalidResearchCommentInputError);
  });

  it('rejects empty content', async () => {
    const owner = await makeUser('empty-owner');
    const workspace = await createWorkspace(owner.id, { name: 'Empty Comment Test' });
    const task = await createResearchTask(owner.id, workspace.id, { title: 'A task' });
    await expect(createResearchComment(owner.id, workspace.id, { parentType: 'RESEARCH_TASK', parentId: task.id, content: '   ' })).rejects.toThrow(InvalidResearchCommentInputError);
  });

  it('allows commenting on any existing research report - reports are global', async () => {
    const owner = await makeUser('report-owner');
    const workspace = await createWorkspace(owner.id, { name: 'Report Comment Test' });
    const company = await db.company.create({ data: { ticker: TICKER, name: 'Comment Test Co.' } });
    const report = await db.researchReport.create({
      data: { companyId: company.id, version: 1, status: 'SUCCESS', model: 'fixture', dataSnapshotAt: new Date(), content: { context: {}, report: null } },
    });

    const comment = await createResearchComment(owner.id, workspace.id, { parentType: 'RESEARCH_REPORT', parentId: report.id, content: 'Nice report.' });
    expect(comment.parentId).toBe(report.id);
  });

  it('rejects a comment on someone elses private, not-yet-committee-submitted investment case', async () => {
    const caseOwner = await makeUser('case-owner');
    const colleague = await makeUser('case-colleague');
    const workspace = await createWorkspace(caseOwner.id, { name: 'Case Comment Test' });
    await addWorkspaceMember(caseOwner.id, workspace.id, { email: colleague.email, role: 'ANALYST' });
    const company = await db.company.create({ data: { ticker: TICKER, name: 'Comment Test Co.' } });
    const investmentCase = await db.investmentCase.create({ data: { userId: caseOwner.id, companyId: company.id, horizon: '3-5 years', coreThesis: 'A thesis.' } });

    await expect(createResearchComment(colleague.id, workspace.id, { parentType: 'INVESTMENT_CASE', parentId: investmentCase.id, content: 'Interesting.' })).rejects.toThrow(InvalidResearchCommentInputError);

    // The owner themselves can always comment on their own case.
    const ownComment = await createResearchComment(caseOwner.id, workspace.id, { parentType: 'INVESTMENT_CASE', parentId: investmentCase.id, content: 'My own note.' });
    expect(ownComment.authorId).toBe(caseOwner.id);
  });

  it('allows commenting once the investment case has been submitted to committee review', async () => {
    const caseOwner = await makeUser('submitted-owner');
    const colleague = await makeUser('submitted-colleague');
    const workspace = await createWorkspace(caseOwner.id, { name: 'Submitted Case Comment Test' });
    await addWorkspaceMember(caseOwner.id, workspace.id, { email: colleague.email, role: 'ANALYST' });
    const company = await db.company.create({ data: { ticker: TICKER, name: 'Comment Test Co.' } });
    const investmentCase = await db.investmentCase.create({
      data: { userId: caseOwner.id, companyId: company.id, horizon: '3-5 years', coreThesis: 'A thesis.', committeeReviewStatus: 'SUBMITTED', committeeSubmittedAt: new Date() },
    });

    const comment = await createResearchComment(colleague.id, workspace.id, { parentType: 'INVESTMENT_CASE', parentId: investmentCase.id, content: 'Have you considered X?' });
    expect(comment.authorId).toBe(colleague.id);
  });
});
