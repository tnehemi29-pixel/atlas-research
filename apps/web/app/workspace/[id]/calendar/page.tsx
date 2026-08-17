import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth/session';
import { getWorkspaceDetail, WorkspaceNotFoundError } from '@/lib/services/workspaceService';
import { getWorkspaceCalendar } from '@/lib/services/researchCalendarService';
import { WorkspaceNav } from '@/components/workspace/WorkspaceNav';
import { formatDate } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Research Calendar · Atlas Research' };

const TYPE_LABELS: Record<string, string> = { TASK_DUE: 'Task Due', MEETING: 'Meeting', EARNINGS_ESTIMATE: 'Earnings (est.)' };
const TYPE_STYLE: Record<string, string> = {
  TASK_DUE: 'border-orange-300 bg-orange-50 text-orange-800',
  MEETING: 'border-accent bg-accent-soft text-accent',
  EARNINGS_ESTIMATE: 'border-ink/15 bg-ink/5 text-ink/60',
};

/** Spec section 15 — a lightweight research calendar (task deadlines,
 * meeting dates, earnings estimates) integrating Milestone 10's existing
 * earnings calendar rather than rebuilding one. */
export default async function CalendarPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  try {
    await getWorkspaceDetail(user.id, params.id);
  } catch (error) {
    if (error instanceof WorkspaceNotFoundError) redirect('/workspace');
    throw error;
  }

  const entries = await getWorkspaceCalendar(user.id, params.id);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <WorkspaceNav workspaceId={params.id} active="calendar" />
      <header className="border-ink/10 border-b pb-6">
        <h1 className="text-ink font-serif text-2xl font-semibold">Research Calendar</h1>
      </header>

      {entries.length === 0 ? (
        <p className="text-ink/40 mt-8 text-sm">Nothing upcoming — no open task deadlines, scheduled meetings, or estimated earnings dates for covered companies.</p>
      ) : (
        <ul className="border-ink/10 mt-6 divide-y divide-black/5 rounded-xl border">
          {entries.map((entry, i) => (
            <li key={i} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${TYPE_STYLE[entry.type]}`}>{TYPE_LABELS[entry.type]}</span>
                {entry.ticker && (
                  <Link href={`/company/${entry.ticker}`} className="text-accent text-xs font-medium hover:underline">
                    {entry.ticker}
                  </Link>
                )}
                <span className="text-ink text-sm">{entry.title}</span>
                {entry.isEstimate && <span className="text-ink/30 text-xs">(estimate)</span>}
              </div>
              <span className="text-ink/40 text-xs">{formatDate(entry.date)}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
