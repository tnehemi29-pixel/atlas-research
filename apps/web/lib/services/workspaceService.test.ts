import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import {
  addWorkspaceMember,
  changeWorkspaceMemberRole,
  createWorkspace,
  getWorkspaceDetail,
  InvalidWorkspaceInputError,
  listUserWorkspaces,
  listWorkspaceMembers,
  removeWorkspaceMember,
  requireWorkspaceMember,
  requireWorkspaceRole,
  WorkspaceForbiddenError,
  WorkspaceMemberNotFoundError,
  WorkspaceNotFoundError,
} from './workspaceService';

const TEST_EMAIL = 'zz-workspace-service-test@example.com';

async function makeUser(suffix: string) {
  const passwordHash = await hashPassword('irrelevant');
  return db.user.create({ data: { email: `${suffix}-${TEST_EMAIL}`, passwordHash } });
}

async function cleanup() {
  await db.workspace.deleteMany({ where: { createdBy: { email: { contains: TEST_EMAIL } } } });
  await db.user.deleteMany({ where: { email: { contains: TEST_EMAIL } } });
}

describe('workspaceService', () => {
  beforeAll(cleanup);
  afterAll(cleanup);
  afterEach(cleanup);

  it('createWorkspace makes the creator the first OWNER', async () => {
    const user = await makeUser('create');
    const workspace = await createWorkspace(user.id, { name: 'Atlas Investment Research' });
    expect(workspace.slug).toBe('atlas-investment-research');

    const member = await requireWorkspaceMember(user.id, workspace.id);
    expect(member.role).toBe('OWNER');
  });

  it('rejects a duplicate slug', async () => {
    const user = await makeUser('dup-slug');
    await createWorkspace(user.id, { name: 'Dup Test', slug: 'dup-test' });
    await expect(createWorkspace(user.id, { name: 'Another Name', slug: 'dup-test' })).rejects.toThrow(InvalidWorkspaceInputError);
  });

  it('requireWorkspaceMember throws WorkspaceNotFoundError for a non-member - never leaks existence', async () => {
    const owner = await makeUser('owner-a');
    const outsider = await makeUser('outsider-a');
    const workspace = await createWorkspace(owner.id, { name: 'Private Workspace A' });

    await expect(requireWorkspaceMember(outsider.id, workspace.id)).rejects.toThrow(WorkspaceNotFoundError);
    await expect(requireWorkspaceMember(outsider.id, 'does-not-exist-at-all')).rejects.toThrow(WorkspaceNotFoundError);
  });

  it('listUserWorkspaces only returns workspaces the user is a member of, with their role attached', async () => {
    const userA = await makeUser('list-a');
    const userB = await makeUser('list-b');
    await createWorkspace(userA.id, { name: 'List Test A' });
    await createWorkspace(userB.id, { name: 'List Test B' });

    const workspacesForA = await listUserWorkspaces(userA.id);
    expect(workspacesForA).toHaveLength(1);
    expect(workspacesForA[0]!.name).toBe('List Test A');
    expect(workspacesForA[0]!.role).toBe('OWNER');
  });

  it('addWorkspaceMember requires ADMIN or OWNER, and rejects a non-existent email', async () => {
    const owner = await makeUser('add-owner');
    const analyst = await makeUser('add-analyst');
    const newcomer = await makeUser('add-newcomer');
    const workspace = await createWorkspace(owner.id, { name: 'Add Member Test' });
    await addWorkspaceMember(owner.id, workspace.id, { email: analyst.email, role: 'ANALYST' });

    // An ANALYST cannot add members.
    await expect(addWorkspaceMember(analyst.id, workspace.id, { email: newcomer.email })).rejects.toThrow(WorkspaceForbiddenError);

    // The owner can, and it defaults to ANALYST.
    const added = await addWorkspaceMember(owner.id, workspace.id, { email: newcomer.email });
    expect(added.role).toBe('ANALYST');

    await expect(addWorkspaceMember(owner.id, workspace.id, { email: 'nobody-real@example.com' })).rejects.toThrow(InvalidWorkspaceInputError);
    await expect(addWorkspaceMember(owner.id, workspace.id, { email: newcomer.email })).rejects.toThrow(InvalidWorkspaceInputError);
  });

  it('cannot remove or demote the last owner', async () => {
    const owner = await makeUser('last-owner');
    const workspace = await createWorkspace(owner.id, { name: 'Last Owner Test' });

    await expect(removeWorkspaceMember(owner.id, workspace.id, owner.id)).rejects.toThrow(InvalidWorkspaceInputError);
    await expect(changeWorkspaceMemberRole(owner.id, workspace.id, owner.id, 'ADMIN')).rejects.toThrow(InvalidWorkspaceInputError);
  });

  it('a second owner CAN be removed/demoted once there are two', async () => {
    const ownerA = await makeUser('two-owners-a');
    const ownerB = await makeUser('two-owners-b');
    const workspace = await createWorkspace(ownerA.id, { name: 'Two Owners Test' });
    await addWorkspaceMember(ownerA.id, workspace.id, { email: ownerB.email, role: 'OWNER' });

    const demoted = await changeWorkspaceMemberRole(ownerA.id, workspace.id, ownerB.id, 'ADMIN');
    expect(demoted.role).toBe('ADMIN');
  });

  it('removeWorkspaceMember on a non-member throws WorkspaceMemberNotFoundError', async () => {
    const owner = await makeUser('remove-nonmember');
    const outsider = await makeUser('remove-nonmember-outsider');
    const workspace = await createWorkspace(owner.id, { name: 'Remove Non-Member Test' });
    await expect(removeWorkspaceMember(owner.id, workspace.id, outsider.id)).rejects.toThrow(WorkspaceMemberNotFoundError);
  });

  it('listWorkspaceMembers and getWorkspaceDetail require membership', async () => {
    const owner = await makeUser('detail-owner');
    const outsider = await makeUser('detail-outsider');
    const workspace = await createWorkspace(owner.id, { name: 'Detail Test' });

    const detail = await getWorkspaceDetail(owner.id, workspace.id);
    expect(detail.myRole).toBe('OWNER');

    const members = await listWorkspaceMembers(owner.id, workspace.id);
    expect(members).toHaveLength(1);

    await expect(getWorkspaceDetail(outsider.id, workspace.id)).rejects.toThrow(WorkspaceNotFoundError);
    await expect(listWorkspaceMembers(outsider.id, workspace.id)).rejects.toThrow(WorkspaceNotFoundError);
  });

  it('requireWorkspaceRole enforces a role predicate and distinguishes membership from permission', async () => {
    const owner = await makeUser('role-owner');
    const viewer = await makeUser('role-viewer');
    const outsider = await makeUser('role-outsider');
    const workspace = await createWorkspace(owner.id, { name: 'Role Predicate Test' });
    await addWorkspaceMember(owner.id, workspace.id, { email: viewer.email, role: 'VIEWER' });

    await expect(requireWorkspaceRole(viewer.id, workspace.id, () => false)).rejects.toThrow(WorkspaceForbiddenError);
    await expect(requireWorkspaceRole(outsider.id, workspace.id, () => true)).rejects.toThrow(WorkspaceNotFoundError);

    const member = await requireWorkspaceRole(owner.id, workspace.id, () => true);
    expect(member.role).toBe('OWNER');
  });
});
