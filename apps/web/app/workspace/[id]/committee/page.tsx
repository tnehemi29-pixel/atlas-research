import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth/session';
import { getWorkspaceDetail, WorkspaceNotFoundError } from '@/lib/services/workspaceService';
import { listCommitteeSubmissions } from '@/lib/services/committeeReviewService';
import { WorkspaceNav } from '@/components/workspace/WorkspaceNav';
import { formatUpdatedAt } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Investment Committee · Atlas Research' };

/** Spec section 20 — Investment Committee Review, the workspace-wide queue. */
export default async function CommitteePage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  try {
    await getWorkspaceDetail(user.id, params.id);
  } catch (error) {
    if (error instanceof WorkspaceNotFoundError) redirect('/workspace');
    throw error;
  }

  const submissions = await listCommitteeSubmissions(user.id, params.id);

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <WorkspaceNav workspaceId={params.id} active="committee" />
      <header className="border-ink/10 border-b pb-6">
        <h1 className="text-ink font-serif text-2xl font-semibold">Investment Committee</h1>
        <p className="text-ink/50 mt-2 text-sm">Cases submitted for committee review — reactions are internal review signals, never an automatic recommendation.</p>
      </header>

      {submissions.length === 0 ? (
        <p className="text-ink/40 mt-8 text-sm">No investment cases are currently submitted for committee review in this workspace.</p>
      ) : (
        <ul className="border-ink/10 mt-6 divide-y divide-black/5 rounded-xl border">
          {submissions.map((c) => (
            <li key={c.id}>
              <Link href={`/workspace/${params.id}/committee/${c.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-black/[0.02]">
                <div>
                  <span className="text-accent text-sm font-medium">{c.company.ticker}</span>
                  <span className="text-ink/70 ml-2 text-sm">{c.company.name}</span>
                  <p className="text-ink/40 mt-0.5 text-xs">
                    Owner: {c.user.name ?? c.user.email} · {c.horizon} · {c._count.committeeReactions} reaction(s)
                  </p>
                </div>
                <span className="text-ink/30 text-xs">{c.committeeSubmittedAt ? formatUpdatedAt(c.committeeSubmittedAt.toISOString()) : ''}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
