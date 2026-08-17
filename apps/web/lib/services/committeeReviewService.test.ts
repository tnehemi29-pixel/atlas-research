import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { createWorkspace, addWorkspaceMember } from './workspaceService';
import { createResearchProject } from './researchProjectService';
import { InvestmentCaseNotFoundError } from './investmentCaseService';
import {
  addCommitteeReaction,
  CommitteeReviewNotAvailableError,
  getCommitteeReviewDetail,
  listCommitteeSubmissions,
  submitCaseToCommitteeReview,
} from './committeeReviewService';

const TEST_EMAIL = 'zz-committee-service-test@example.com';
const TICKER = 'ZZCMTE1';

async function makeUser(suffix: string) {
  const passwordHash = await hashPassword('irrelevant');
  return db.user.create({ data: { email: `${suffix}-${TEST_EMAIL}`, passwordHash } });
}

async function cleanup() {
  await db.workspace.deleteMany({ where: { createdBy: { email: { contains: TEST_EMAIL } } } });
  await db.user.deleteMany({ where: { email: { contains: TEST_EMAIL } } });
  await db.company.deleteMany({ where: { ticker: TICKER } });
}

describe('committeeReviewService', () => {
  beforeAll(cleanup);
  afterAll(cleanup);
  afterEach(cleanup);

  it('rejects submitting a case with no linked project', async () => {
    const owner = await makeUser('noproj-owner');
    const company = await db.company.create({ data: { ticker: TICKER, name: 'Committee Test Co.' } });
    const investmentCase = await db.investmentCase.create({ data: { userId: owner.id, companyId: company.id, horizon: '3-5 years', coreThesis: 'A thesis.' } });

    await expect(submitCaseToCommitteeReview(owner.id, investmentCase.id)).rejects.toThrow(CommitteeReviewNotAvailableError);
  });

  it('only the owner can submit their case, and only once linked to a project', async () => {
    const owner = await makeUser('submit-owner');
    const outsider = await makeUser('submit-outsider');
    const workspace = await createWorkspace(owner.id, { name: 'Committee Test WS' });
    const project = await createResearchProject(owner.id, workspace.id, { name: 'Committee Project' });
    const company = await db.company.create({ data: { ticker: TICKER, name: 'Committee Test Co.' } });
    const investmentCase = await db.investmentCase.create({ data: { userId: owner.id, companyId: company.id, projectId: project.id, horizon: '3-5 years', coreThesis: 'A thesis.' } });

    await expect(submitCaseToCommitteeReview(outsider.id, investmentCase.id)).rejects.toThrow(InvestmentCaseNotFoundError);

    const submitted = await submitCaseToCommitteeReview(owner.id, investmentCase.id);
    expect(submitted.committeeReviewStatus).toBe('SUBMITTED');
    expect(submitted.committeeSubmittedAt).not.toBeNull();
  });

  it('a workspace peer cannot view the case before it is submitted, but can once it is', async () => {
    const owner = await makeUser('visibility-owner');
    const peer = await makeUser('visibility-peer');
    const workspace = await createWorkspace(owner.id, { name: 'Visibility Test WS' });
    await addWorkspaceMember(owner.id, workspace.id, { email: peer.email, role: 'ANALYST' });
    const project = await createResearchProject(owner.id, workspace.id, { name: 'Visibility Project' });
    const company = await db.company.create({ data: { ticker: TICKER, name: 'Committee Test Co.' } });
    const investmentCase = await db.investmentCase.create({ data: { userId: owner.id, companyId: company.id, projectId: project.id, horizon: '3-5 years', coreThesis: 'A thesis.' } });

    await expect(getCommitteeReviewDetail(peer.id, investmentCase.id)).rejects.toThrow(InvestmentCaseNotFoundError);

    await submitCaseToCommitteeReview(owner.id, investmentCase.id);
    const detail = await getCommitteeReviewDetail(peer.id, investmentCase.id);
    expect(detail.id).toBe(investmentCase.id);
  });

  it('a user outside the project workspace still cannot view the case even after submission', async () => {
    const owner = await makeUser('outside-owner');
    const outsider = await makeUser('outside-outsider');
    const workspace = await createWorkspace(owner.id, { name: 'Outside Test WS' });
    const project = await createResearchProject(owner.id, workspace.id, { name: 'Outside Project' });
    const company = await db.company.create({ data: { ticker: TICKER, name: 'Committee Test Co.' } });
    const investmentCase = await db.investmentCase.create({ data: { userId: owner.id, companyId: company.id, projectId: project.id, horizon: '3-5 years', coreThesis: 'A thesis.' } });
    await submitCaseToCommitteeReview(owner.id, investmentCase.id);

    // Denied either way (not a workspace member at all here) - the precise
    // error class differs depending on which check trips first, but access
    // is denied either way, which is the only thing that matters.
    await expect(getCommitteeReviewDetail(outsider.id, investmentCase.id)).rejects.toThrow();
  });

  it('reactions require the case to actually be submitted, and are never a decision field', async () => {
    const owner = await makeUser('react-owner');
    const peer = await makeUser('react-peer');
    const workspace = await createWorkspace(owner.id, { name: 'React Test WS' });
    await addWorkspaceMember(owner.id, workspace.id, { email: peer.email, role: 'VIEWER' });
    const project = await createResearchProject(owner.id, workspace.id, { name: 'React Project' });
    const company = await db.company.create({ data: { ticker: TICKER, name: 'Committee Test Co.' } });
    const investmentCase = await db.investmentCase.create({ data: { userId: owner.id, companyId: company.id, projectId: project.id, horizon: '3-5 years', coreThesis: 'A thesis.' } });

    // Not submitted yet - even the owner cannot add a reaction.
    await expect(addCommitteeReaction(owner.id, investmentCase.id, { reactionType: 'SUPPORT' })).rejects.toThrow(CommitteeReviewNotAvailableError);

    await submitCaseToCommitteeReview(owner.id, investmentCase.id);

    // A VIEWER can react - reactions are read/react, not edit.
    const reaction = await addCommitteeReaction(peer.id, investmentCase.id, { reactionType: 'CONCERN', content: 'What about regulatory risk?' });
    expect(reaction.reactionType).toBe('CONCERN');

    const detail = await getCommitteeReviewDetail(owner.id, investmentCase.id);
    expect(detail.committeeReactions).toHaveLength(1);
    // No decision/recommendation field exists anywhere on the case.
    expect((detail as unknown as Record<string, unknown>).decision).toBeUndefined();
  });

  it('listCommitteeSubmissions only returns cases submitted under this workspace', async () => {
    const ownerA = await makeUser('list-a');
    const ownerB = await makeUser('list-b');
    const workspaceA = await createWorkspace(ownerA.id, { name: 'List A' });
    const workspaceB = await createWorkspace(ownerB.id, { name: 'List B' });
    const projectA = await createResearchProject(ownerA.id, workspaceA.id, { name: 'Project A' });
    const company = await db.company.create({ data: { ticker: TICKER, name: 'Committee Test Co.' } });
    const caseA = await db.investmentCase.create({ data: { userId: ownerA.id, companyId: company.id, projectId: projectA.id, horizon: '3-5 years', coreThesis: 'A thesis.' } });
    await submitCaseToCommitteeReview(ownerA.id, caseA.id);

    const forA = await listCommitteeSubmissions(ownerA.id, workspaceA.id);
    expect(forA).toHaveLength(1);
    const forB = await listCommitteeSubmissions(ownerB.id, workspaceB.id);
    expect(forB).toHaveLength(0);
  });
});
