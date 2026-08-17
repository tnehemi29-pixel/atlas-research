import type { AnalysisStatus as PrismaAnalysisStatus, Prisma, ResearchReport as PrismaResearchReport } from '@prisma/client';
import { db } from '@/lib/db';
import { ensureCompanyByTicker } from '@/lib/services/companyService';
import { aggregateResearchContext } from '@/lib/research/aggregateResearchContext';
import type { ResearchContext } from '@/lib/research/types';
import { generateResearchReport } from '@/lib/ai/generateResearchReport';
import type { ResearchReportAiPayload } from '@/lib/ai/reportSchema';
import { AiNotConfiguredError, AiRequestError } from '@/lib/ai/anthropicClient';

/**
 * The versioning orchestrator for Milestone 9's research reports — the only
 * module that decides when to re-aggregate + re-generate vs. simply read a
 * stored report. Mirrors secFilingService.ts's role, with one deliberate
 * difference: "Do not overwrite the previous report automatically" means
 * every call to createReport() inserts a NEW row (a new `version`), never an
 * upsert onto an existing one — a persistent, browsable history rather than
 * a single mutable cache entry.
 */

export class ResearchReportNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResearchReportNotFoundError';
  }
}

/** What `content` (the Json column) actually stores: the full deterministic
 * research context (every number, every source, in its final display form)
 * plus the AI's narrative payload, already sanitized against real source
 * IDs. Re-rendering a stored report never needs to touch the AI or the
 * calculation engines again. */
export interface ResearchReportContent {
  context: ResearchContext;
  report: ResearchReportAiPayload | null;
}

async function nextVersion(companyId: string): Promise<number> {
  const latest = await db.researchReport.findFirst({
    where: { companyId },
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  return (latest?.version ?? 0) + 1;
}

/**
 * Aggregates the current research context and generates a new report
 * version. A failure to generate the AI narrative (no API key configured,
 * or a request/validation failure after the corrective retry) is not
 * swallowed as an exception — it is stored as its own FAILED version, same
 * "cache the failure, don't retry on every view" discipline as Milestones
 * 7/8, so a user can see that a generation was attempted and why it didn't
 * produce a report, and can explicitly try again.
 */
export async function createReport(rawTicker: string): Promise<PrismaResearchReport> {
  const ticker = rawTicker.trim().toUpperCase();
  const context = await aggregateResearchContext(ticker);
  const company = await ensureCompanyByTicker(ticker);
  const version = await nextVersion(company.id);
  const dataSnapshotAt = new Date(context.dataSnapshotAt);

  try {
    const result = await generateResearchReport(context);
    const content: ResearchReportContent = { context, report: result.payload };

    return db.researchReport.create({
      data: {
        companyId: company.id,
        version,
        status: 'SUCCESS' as PrismaAnalysisStatus,
        model: result.model,
        dataSnapshotAt,
        content: content as unknown as Prisma.InputJsonValue,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      },
    });
  } catch (error) {
    if (!(error instanceof AiNotConfiguredError) && !(error instanceof AiRequestError)) throw error;

    const content: ResearchReportContent = { context, report: null };
    return db.researchReport.create({
      data: {
        companyId: company.id,
        version,
        status: 'FAILED' as PrismaAnalysisStatus,
        model: 'none',
        error: error.message,
        dataSnapshotAt,
        content: content as unknown as Prisma.InputJsonValue,
      },
    });
  }
}

/** All versions for a company, most recent first — the version history the
 * spec asks for ("allow users to compare research reports over time"). */
export async function listReports(rawTicker: string): Promise<PrismaResearchReport[]> {
  const ticker = rawTicker.trim().toUpperCase();
  const company = await db.company.findUnique({ where: { ticker } });
  if (!company) return [];
  return db.researchReport.findMany({ where: { companyId: company.id }, orderBy: { version: 'desc' } });
}

export async function getReport(reportId: string): Promise<PrismaResearchReport> {
  const report = await db.researchReport.findUnique({ where: { id: reportId } });
  if (!report) throw new ResearchReportNotFoundError(`No research report found for id "${reportId}".`);
  return report;
}

/** Read-only — never generates. Used by Server Components so opening a
 * company's Research Report tab is always free. */
export async function getLatestReport(rawTicker: string): Promise<PrismaResearchReport | null> {
  const ticker = rawTicker.trim().toUpperCase();
  const company = await db.company.findUnique({ where: { ticker } });
  if (!company) return null;
  return db.researchReport.findFirst({ where: { companyId: company.id }, orderBy: { version: 'desc' } });
}
