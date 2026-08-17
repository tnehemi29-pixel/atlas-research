'use client';

import { useState } from 'react';
import { addWorkspaceMember, changeWorkspaceMemberRole, removeWorkspaceMember, type WorkspaceRoleValue } from '@/lib/api/workspace';
import { ApiError } from '@/lib/api/companies';
import { ROLE_LABELS, ROLE_STYLE } from '@/lib/utils/workspaceDisplay';
import { formatDate } from '@/lib/utils/format';

const ROLES: WorkspaceRoleValue[] = ['OWNER', 'ADMIN', 'ANALYST', 'VIEWER'];

interface MemberRow {
  userId: string;
  role: WorkspaceRoleValue;
  joinedAt: string;
  user: { id: string; name: string | null; email: string };
}

export function MembersWorkspace({ workspaceId, initialMembers, currentUserId, canManage }: { workspaceId: string; initialMembers: MemberRow[]; currentUserId: string; canManage: boolean }) {
  const [members, setMembers] = useState(initialMembers);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<WorkspaceRoleValue>('ANALYST');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    if (!email.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const member = await addWorkspaceMember(workspaceId, email.trim(), role);
      setMembers((prev) => [...prev, { userId: member.userId, role: member.role, joinedAt: member.joinedAt, user: member.user }]);
      setEmail('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add the member.');
    } finally {
      setAdding(false);
    }
  }

  async function handleRoleChange(userId: string, newRole: WorkspaceRoleValue) {
    setError(null);
    try {
      await changeWorkspaceMemberRole(workspaceId, userId, newRole);
      setMembers((prev) => prev.map((m) => (m.userId === userId ? { ...m, role: newRole } : m)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to change the role.');
    }
  }

  async function handleRemove(userId: string) {
    setError(null);
    try {
      await removeWorkspaceMember(workspaceId, userId);
      setMembers((prev) => prev.filter((m) => m.userId !== userId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove the member.');
    }
  }

  return (
    <div className="mt-6">
      {canManage && (
        <form onSubmit={handleAdd} className="border-ink/10 bg-paper mb-6 flex flex-wrap items-end gap-3 rounded-xl border p-4">
          <div>
            <label className="text-ink/60 text-xs font-medium">Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="analyst@example.com" className="border-ink/15 bg-paper text-ink mt-1 w-56 rounded-lg border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-ink/60 text-xs font-medium">Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value as WorkspaceRoleValue)} className="border-ink/15 bg-paper text-ink mt-1 rounded-lg border px-3 py-2 text-sm">
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" disabled={adding || !email.trim()} className="bg-accent rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {adding ? 'Adding…' : 'Add Member'}
          </button>
          {error && <p className="w-full text-sm text-red-700">{error}</p>}
        </form>
      )}

      <ul className="border-ink/10 divide-y divide-black/5 rounded-xl border">
        {members.map((member) => (
          <li key={member.userId} className="flex items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="text-ink text-sm font-medium">
                {member.user.name ?? member.user.email}
                {member.userId === currentUserId && <span className="text-ink/30 ml-1 text-xs">(you)</span>}
              </p>
              <p className="text-ink/40 text-xs">Joined {formatDate(member.joinedAt)}</p>
            </div>
            {canManage ? (
              <div className="flex items-center gap-2">
                <select value={member.role} onChange={(e) => handleRoleChange(member.userId, e.target.value as WorkspaceRoleValue)} className="border-ink/15 bg-paper text-ink rounded-lg border px-2 py-1 text-xs">
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={() => handleRemove(member.userId)} className="text-ink/30 hover:text-red-700 text-xs">
                  Remove
                </button>
              </div>
            ) : (
              <span className={`rounded border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${ROLE_STYLE[member.role]}`}>{ROLE_LABELS[member.role]}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
