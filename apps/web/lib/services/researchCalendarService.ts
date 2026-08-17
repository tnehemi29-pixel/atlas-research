import { db } from '@/lib/db';
import { requireWorkspaceMember } from '@/lib/services/workspaceService';
import { estimateEarningsCalendarEntry } from '@/lib/services/earningsCalendarService';

/**
 * Milestone 15 spec section 15 — a lightweight research calendar merging
 * task deadlines, meeting dates, and earnings dates for the workspace's
 * covered companies. Deliberately not a general-purpose calendar: no
 * recurring events, no external calendar sync, no invitations. Earnings
 * dates reuse Milestone 10's own estimation logic unchanged
 * (estimateEarningsCalendarEntry) — "integrate with the existing earnings
 * calendar," never a second estimator.
 */

export type CalendarEntryType = 'TASK_DUE' | 'MEETING' | 'EARNINGS_ESTIMATE';

export interface WorkspaceCalendarEntry {
  type: CalendarEntryType;
  date: string;
  title: string;
  ticker: string | null;
  isEstimate: boolean;
  detail: string | null;
}

export async function getWorkspaceCalendar(userId: string, workspaceId: string): Promise<WorkspaceCalendarEntry[]> {
  await requireWorkspaceMember(userId, workspaceId);

  const [tasks, meetings, coverage] = await Promise.all([
    db.researchTask.findMany({ where: { workspaceId, dueDate: { not: null }, status: { not: 'COMPLETED' } }, include: { company: { select: { ticker: true } } } }),
    db.researchMeeting.findMany({ where: { workspaceId }, include: { companies: { include: { company: { select: { ticker: true } } } } } }),
    db.companyCoverage.findMany({ where: { workspaceId }, include: { company: { select: { ticker: true, name: true } } } }),
  ]);

  const entries: WorkspaceCalendarEntry[] = [];

  for (const task of tasks) {
    entries.push({ type: 'TASK_DUE', date: task.dueDate!.toISOString(), title: task.title, ticker: task.company?.ticker ?? null, isEstimate: false, detail: `Priority: ${task.priority}` });
  }

  for (const meeting of meetings) {
    const tickers = meeting.companies.map((c) => c.company.ticker);
    entries.push({ type: 'MEETING', date: meeting.date.toISOString(), title: meeting.title, ticker: tickers[0] ?? null, isEstimate: false, detail: tickers.length > 1 ? `Also: ${tickers.slice(1).join(', ')}` : null });
  }

  const earningsEntries = await Promise.all(coverage.map((c) => estimateEarningsCalendarEntry(c.company.ticker, c.company.name, [])));
  for (const entry of earningsEntries) {
    if (!entry.expectedDate) continue;
    entries.push({ type: 'EARNINGS_ESTIMATE', date: entry.expectedDate, title: `${entry.name} earnings (est.)`, ticker: entry.ticker, isEstimate: true, detail: entry.basis });
  }

  return entries.sort((a, b) => a.date.localeCompare(b.date));
}
