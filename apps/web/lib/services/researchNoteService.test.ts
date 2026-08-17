import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { createWorkspace, addWorkspaceMember, WorkspaceForbiddenError } from './workspaceService';
import {
  createResearchNote,
  getResearchNoteDetail,
  InvalidResearchNoteInputError,
  listResearchNotes,
  ResearchNoteNotFoundError,
  updateResearchNote,
} from './researchNoteService';

const TEST_EMAIL = 'zz-note-service-test@example.com';
const TICKER = 'ZZNOTE1';
const OTHER_TICKER = 'ZZNOTE2';

async function makeUser(suffix: string) {
  const passwordHash = await hashPassword('irrelevant');
  return db.user.create({ data: { email: `${suffix}-${TEST_EMAIL}`, passwordHash } });
}

async function cleanup() {
  await db.workspace.deleteMany({ where: { createdBy: { email: { contains: TEST_EMAIL } } } });
  await db.user.deleteMany({ where: { email: { contains: TEST_EMAIL } } });
  await db.company.deleteMany({ where: { ticker: { in: [TICKER, OTHER_TICKER] } } });
}

describe('researchNoteService', () => {
  beforeAll(cleanup);
  afterAll(cleanup);
  afterEach(cleanup);

  it('creates a note with no sources', async () => {
    const owner = await makeUser('create-owner');
    const workspace = await createWorkspace(owner.id, { name: 'Note Test WS' });
    const note = await createResearchNote(owner.id, workspace.id, { title: 'Competitive positioning', content: 'Some notes here.' });
    expect(note.title).toBe('Competitive positioning');
  });

  it('a VIEWER cannot create a note', async () => {
    const owner = await makeUser('viewer-owner');
    const viewer = await makeUser('viewer-viewer');
    const workspace = await createWorkspace(owner.id, { name: 'Viewer Note Test' });
    await addWorkspaceMember(owner.id, workspace.id, { email: viewer.email, role: 'VIEWER' });
    await expect(createResearchNote(viewer.id, workspace.id, { title: 'X', content: 'Y' })).rejects.toThrow(WorkspaceForbiddenError);
  });

  it('accepts a non-row-backed source with only a label', async () => {
    const owner = await makeUser('label-owner');
    const workspace = await createWorkspace(owner.id, { name: 'Label Note Test' });
    const note = await createResearchNote(owner.id, workspace.id, {
      title: 'Margin pressure',
      content: 'Notes on margin pressure.',
      sources: [{ sourceType: 'FINANCIAL_STATEMENT', sourceLabel: 'Q3 2026 fundamentals' }],
    });
    const detail = await getResearchNoteDetail(owner.id, workspace.id, note.id);
    expect(detail.sources).toHaveLength(1);
    expect(detail.sources[0]!.sourceLabel).toBe('Q3 2026 fundamentals');
  });

  it('rejects a row-backed source with a fake id - no fake source IDs', async () => {
    const owner = await makeUser('fake-owner');
    const workspace = await createWorkspace(owner.id, { name: 'Fake Source Note Test' });
    await expect(
      createResearchNote(owner.id, workspace.id, {
        title: 'Bad source',
        content: 'This should fail.',
        sources: [{ sourceType: 'TEN_Q', sourceId: 'totally-made-up-id', sourceLabel: 'Q3 2026 10-Q' }],
      }),
    ).rejects.toThrow(InvalidResearchNoteInputError);
  });

  it('accepts a row-backed source that is real and belongs to the notes own company', async () => {
    const owner = await makeUser('real-owner');
    const workspace = await createWorkspace(owner.id, { name: 'Real Source Note Test' });
    const company = await db.company.create({ data: { ticker: TICKER, name: 'Note Test Co.' } });
    const filing = await db.secFiling.create({
      data: { companyId: company.id, filingType: 'TEN_Q', formType: '10-Q', filingDate: new Date(), accessionNumber: '0000000000-26-000001', primaryDocument: 'doc.htm', secUrl: 'https://sec.gov/doc.htm' },
    });

    const note = await createResearchNote(owner.id, workspace.id, {
      title: 'Management commentary on pricing',
      content: 'Management expects margin expansion as infrastructure costs normalize.',
      ticker: TICKER,
      sources: [{ sourceType: 'TEN_Q', sourceId: filing.id, sourceLabel: 'Q3 2026 10-Q' }],
    });
    const detail = await getResearchNoteDetail(owner.id, workspace.id, note.id);
    expect(detail.sources[0]!.sourceId).toBe(filing.id);
  });

  it('rejects a real filing that belongs to a DIFFERENT company than the note', async () => {
    const owner = await makeUser('mismatch-owner');
    const workspace = await createWorkspace(owner.id, { name: 'Mismatch Source Note Test' });
    const noteCompany = await db.company.create({ data: { ticker: TICKER, name: 'Note Test Co.' } });
    const otherCompany = await db.company.create({ data: { ticker: OTHER_TICKER, name: 'Other Test Co.' } });
    const filing = await db.secFiling.create({
      data: { companyId: otherCompany.id, filingType: 'TEN_Q', formType: '10-Q', filingDate: new Date(), accessionNumber: '0000000000-26-000002', primaryDocument: 'doc.htm', secUrl: 'https://sec.gov/doc.htm' },
    });

    await expect(
      createResearchNote(owner.id, workspace.id, {
        title: 'Wrong company source',
        content: 'This should fail.',
        ticker: TICKER,
        sources: [{ sourceType: 'TEN_Q', sourceId: filing.id, sourceLabel: 'Q3 2026 10-Q' }],
      }),
    ).rejects.toThrow(InvalidResearchNoteInputError);
    void noteCompany;
  });

  it('a note id from another workspace 404s', async () => {
    const ownerA = await makeUser('cross-a');
    const ownerB = await makeUser('cross-b');
    const workspaceA = await createWorkspace(ownerA.id, { name: 'Cross A' });
    const workspaceB = await createWorkspace(ownerB.id, { name: 'Cross B' });
    const note = await createResearchNote(ownerA.id, workspaceA.id, { title: 'A only note', content: 'Content.' });
    await expect(getResearchNoteDetail(ownerB.id, workspaceB.id, note.id)).rejects.toThrow(ResearchNoteNotFoundError);
  });

  it('only the author or an OWNER/ADMIN can edit a note', async () => {
    const owner = await makeUser('edit-owner');
    const analyst = await makeUser('edit-analyst');
    const otherAnalyst = await makeUser('edit-other-analyst');
    const workspace = await createWorkspace(owner.id, { name: 'Edit Note Test' });
    await addWorkspaceMember(owner.id, workspace.id, { email: analyst.email, role: 'ANALYST' });
    await addWorkspaceMember(owner.id, workspace.id, { email: otherAnalyst.email, role: 'ANALYST' });
    const note = await createResearchNote(analyst.id, workspace.id, { title: 'Analysts note', content: 'Content.' });

    await expect(updateResearchNote(otherAnalyst.id, workspace.id, note.id, { title: 'Hijacked' })).rejects.toThrow(WorkspaceForbiddenError);

    const byAuthor = await updateResearchNote(analyst.id, workspace.id, note.id, { title: 'Updated by author' });
    expect(byAuthor.title).toBe('Updated by author');

    const byOwner = await updateResearchNote(owner.id, workspace.id, note.id, { title: 'Updated by owner' });
    expect(byOwner.title).toBe('Updated by owner');
  });

  it('listResearchNotes filters by tag', async () => {
    const owner = await makeUser('tag-owner');
    const workspace = await createWorkspace(owner.id, { name: 'Tag Note Test' });
    await createResearchNote(owner.id, workspace.id, { title: 'Tagged', content: 'C', tags: ['pricing', 'margins'] });
    await createResearchNote(owner.id, workspace.id, { title: 'Untagged', content: 'C' });

    const tagged = await listResearchNotes(owner.id, workspace.id, { tag: 'margins' });
    expect(tagged).toHaveLength(1);
    expect(tagged[0]!.title).toBe('Tagged');
  });
});
