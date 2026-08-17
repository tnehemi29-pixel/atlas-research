import { db } from '@/lib/db';
import { requireWorkspaceMember } from '@/lib/services/workspaceService';
import { buildWorkspaceAssistantContext, collectValidWorkspaceContextIds } from '@/lib/workspace/assistantContext';
import { answerWorkspaceQuestion } from '@/lib/ai/answerWorkspaceQuestion';
import { AiNotConfiguredError } from '@/lib/ai/anthropicClient';

/**
 * Milestone 15 spec section 23 — the Daily/Weekly Research Digest. Every
 * count is deterministic, computed directly from Atlas's own existing
 * tables (never re-derived or duplicated): major developments and thesis
 * challenges from Milestone 11's ResearchEvent/AssumptionComparison, SEC
 * filings reviewed from Milestone 7's FilingAnalysis, reports updated from
 * Milestone 9's ResearchReport, investment cases changed scoped to the
 * CALLING USER'S OWN cases only (Milestone 13's privacy boundary — a digest
 * never surfaces another member's private case activity). The narrative
 * paragraph is optional and reuses the workspace AI assistant's own
 * context/citation machinery directly (lib/ai/answerWorkspaceQuestion.ts)
 * rather than a second AI pipeline; if the AI call fails or
 * ANTHROPIC_API_KEY isn't configured, the digest still returns with
 * `narrative: null` — the deterministic counts never depend on the AI call
 * succeeding.
 */

export type DigestPeriod = 'DAILY' | 'WEEKLY';

export interface ResearchDigestHighlight {
  ticker: string;
  title: string;
  materiality: string;
  eventDate: string;
}

export interface ResearchDigestSummary {
  period: DigestPeriod;
  periodStart: string;
  periodEnd: string;
  majorCompanyDevelopments: number;
  investmentCasesChanged: number;
  secFilingsReviewed: number;
  thesisChallenges: number;
  researchReportsUpdated: number;
  highlights: ResearchDigestHighlight[];
  narrative: string | null;
}

const PERIOD_DAYS: Record<DigestPeriod, number> = { DAILY: 1, WEEKLY: 7 };
const MAX_HIGHLIGHTS = 8;

export async function computeResearchDigest(userId: string, workspaceId: string, period: DigestPeriod): Promise<Omit<ResearchDigestSummary, 'narrative'>> {
  await requireWorkspaceMember(userId, workspaceId);

  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - PERIOD_DAYS[period] * 24 * 60 * 60 * 1000);

  const coverage = await db.companyCoverage.findMany({ where: { workspaceId }, select: { companyId: true } });
  const companyIds = coverage.map((c) => c.companyId);

  const [majorEvents, investmentCasesChanged, secFilingsReviewed, thesisChallenges, researchReportsUpdated] = await Promise.all([
    companyIds.length > 0
      ? db.researchEvent.findMany({
          where: { companyId: { in: companyIds }, eventDate: { gte: periodStart }, materiality: { in: ['HIGH', 'CRITICAL'] } },
          include: { company: { select: { ticker: true } } },
          orderBy: { eventDate: 'desc' },
          take: MAX_HIGHLIGHTS,
        })
      : [],
    db.investmentCase.count({ where: { userId, project: { workspaceId }, updatedAt: { gte: periodStart } } }),
    companyIds.length > 0 ? db.filingAnalysis.count({ where: { filing: { companyId: { in: companyIds } }, generatedAt: { gte: periodStart } } }) : 0,
    companyIds.length > 0 ? db.assumptionComparison.count({ where: { flagged: true, createdAt: { gte: periodStart }, assumption: { researchReport: { companyId: { in: companyIds } } } } }) : 0,
    companyIds.length > 0 ? db.researchReport.count({ where: { companyId: { in: companyIds }, createdAt: { gte: periodStart } } }) : 0,
  ]);

  return {
    period,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    majorCompanyDevelopments: majorEvents.length,
    investmentCasesChanged,
    secFilingsReviewed,
    thesisChallenges,
    researchReportsUpdated,
    highlights: majorEvents.map((e) => ({ ticker: e.company.ticker, title: e.title, materiality: e.materiality, eventDate: e.eventDate.toISOString() })),
  };
}

/** Best-effort AI narrative over the same authorized context the workspace
 * assistant uses — never blocks the deterministic digest above. */
export async function generateResearchDigestNarrative(userId: string, workspaceId: string, digest: Omit<ResearchDigestSummary, 'narrative'>): Promise<string | null> {
  try {
    const context = await buildWorkspaceAssistantContext(userId, workspaceId);
    const validIds = collectValidWorkspaceContextIds(context);
    const periodLabel = digest.period === 'DAILY' ? 'the last day' : 'the last week';
    const question = `Write a short (3-5 sentence) research digest narrative summarizing the most important research developments over ${periodLabel} for a portfolio manager, based on the recent research changes, open integrity issues, and reports in review in the context above.`;
    const result = await answerWorkspaceQuestion({ context, question }, validIds);
    return result.payload.answer;
  } catch (error) {
    if (error instanceof AiNotConfiguredError) return null;
    return null;
  }
}

export async function getResearchDigest(userId: string, workspaceId: string, period: DigestPeriod): Promise<ResearchDigestSummary> {
  const digest = await computeResearchDigest(userId, workspaceId, period);
  const narrative = await generateResearchDigestNarrative(userId, workspaceId, digest);
  return { ...digest, narrative };
}
