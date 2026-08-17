import { db } from '@/lib/db';

/**
 * A user's private bookmarks onto Milestone 9's shared, global
 * ResearchReport rows — see the SavedReport model's own doc comment in
 * schema.prisma. Ownership is enforced structurally: every read/write is
 * scoped by `userId` in the query itself (never a separate ownership
 * check), so a user can only ever see or unsave their own bookmarks —
 * deleteMany with a userId+researchReportId filter simply matches zero rows
 * for anyone else's bookmark, it can never delete it.
 */

export class SavedReportTargetNotFoundError extends Error {
  constructor(message = 'Research report not found.') {
    super(message);
    this.name = 'SavedReportTargetNotFoundError';
  }
}

export async function listSavedReports(userId: string) {
  return db.savedReport.findMany({
    where: { userId },
    include: { researchReport: { include: { company: true } } },
    orderBy: { savedAt: 'desc' },
  });
}

/** Idempotent — saving an already-saved report just returns the existing bookmark. */
export async function saveReport(userId: string, researchReportId: string) {
  const report = await db.researchReport.findUnique({ where: { id: researchReportId } });
  if (!report) throw new SavedReportTargetNotFoundError();

  const existing = await db.savedReport.findUnique({ where: { userId_researchReportId: { userId, researchReportId } } });
  if (existing) return existing;

  return db.savedReport.create({ data: { userId, researchReportId } });
}

export async function unsaveReport(userId: string, researchReportId: string): Promise<void> {
  await db.savedReport.deleteMany({ where: { userId, researchReportId } });
}

/** Which of the given report ids the user has already saved — used by the
 * report detail page to render "Save"/"Saved" correctly without an N+1 query. */
export async function getSavedReportIds(userId: string, researchReportIds: string[]): Promise<Set<string>> {
  if (researchReportIds.length === 0) return new Set();
  const rows = await db.savedReport.findMany({ where: { userId, researchReportId: { in: researchReportIds } }, select: { researchReportId: true } });
  return new Set(rows.map((r) => r.researchReportId));
}
