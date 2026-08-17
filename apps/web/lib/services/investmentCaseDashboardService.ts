import { db } from '@/lib/db';
import { listInvestmentCases } from '@/lib/services/investmentCaseService';
import { buildInvestmentCaseContext, type ContextResearchEvent } from '@/lib/investmentCase/context';
import { computeThesisHealth, type ThesisHealthResult } from '@/lib/investmentCase/thesisHealth';
import type { InvestmentCaseStatus } from '@prisma/client';

/**
 * Spec section 12 (Monitoring Dashboard) and 13 (Thesis Health) — one row
 * per case, deliberately with NO simplistic buy/sell indicator anywhere:
 * `thesisHealth` is always accompanied by its own `reasons` array (never a
 * bare color), and `valuation` is a plain DCF read, not a recommendation.
 * Reuses `buildInvestmentCaseContext` (the same function the AI assistant
 * and memo generator call) so the dashboard never re-derives challenges,
 * invalidation evaluations, or the research timeline with a second code
 * path — one case failing to build a context (e.g. a ticker with no
 * fundamentals yet) degrades that one row gracefully rather than failing
 * the whole dashboard.
 */

/** ~1 quarter plus a two-week grace period — a plain, documented number
 * (never hidden inside computeThesisHealth itself, which takes it as an
 * input precisely so it stays visible and adjustable here). */
export const REVIEW_OVERDUE_DAYS = 104;

export interface InvestmentCaseDashboardRow {
  id: string;
  ticker: string;
  companyName: string;
  status: InvestmentCaseStatus;
  horizon: string;
  updatedAt: string;
  valuation: { currentSharePrice: number | null; dcfBase: number | null };
  thesisHealth: ThesisHealthResult;
  mostRecentResearchEvent: ContextResearchEvent | null;
  lastReviewedAt: string | null;
  nextReviewDueAt: string | null;
  contextUnavailable: boolean;
}

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

export async function getInvestmentCaseDashboard(userId: string): Promise<InvestmentCaseDashboardRow[]> {
  const cases = await listInvestmentCases(userId);
  const now = new Date();

  return Promise.all(
    cases.map(async (investmentCase): Promise<InvestmentCaseDashboardRow> => {
      const [context, lastReview] = await Promise.all([
        buildInvestmentCaseContext(userId, investmentCase.id).catch(() => null),
        db.investmentCaseReview.findFirst({ where: { investmentCaseId: investmentCase.id }, orderBy: { reviewedAt: 'desc' } }),
      ]);

      const daysSinceLastReview = lastReview ? daysBetween(lastReview.reviewedAt, now) : null;
      const nextReviewDueAt = lastReview ? new Date(lastReview.reviewedAt.getTime() + REVIEW_OVERDUE_DAYS * 24 * 60 * 60 * 1000).toISOString() : null;

      if (!context) {
        return {
          id: investmentCase.id,
          ticker: investmentCase.company.ticker,
          companyName: investmentCase.company.name,
          status: investmentCase.status,
          horizon: investmentCase.horizon,
          updatedAt: investmentCase.updatedAt.toISOString(),
          valuation: { currentSharePrice: null, dcfBase: null },
          thesisHealth: computeThesisHealth({
            challengeCount: 0,
            potentiallyMetInvalidationCount: 0,
            highImpactOpenRiskCount: 0,
            failedCatalystCount: 0,
            daysSinceLastReview,
            reviewOverdueDays: REVIEW_OVERDUE_DAYS,
          }),
          mostRecentResearchEvent: null,
          lastReviewedAt: lastReview?.reviewedAt.toISOString() ?? null,
          nextReviewDueAt,
          contextUnavailable: true,
        };
      }

      const highImpactOpenRiskCount = context.risks.filter((r) => r.impact === 'HIGH' && r.status !== 'MITIGATED').length;
      const failedCatalystCount = context.catalysts.filter((c) => c.status === 'FAILED').length;
      const potentiallyMetInvalidationCount = context.invalidationEvaluations.filter((e) => e.potentiallyMet).length;

      const thesisHealth = computeThesisHealth({
        challengeCount: context.challenges.length,
        potentiallyMetInvalidationCount,
        highImpactOpenRiskCount,
        failedCatalystCount,
        daysSinceLastReview,
        reviewOverdueDays: REVIEW_OVERDUE_DAYS,
      });

      return {
        id: investmentCase.id,
        ticker: context.ticker,
        companyName: context.companyName,
        status: context.status,
        horizon: context.horizon,
        updatedAt: investmentCase.updatedAt.toISOString(),
        valuation: { currentSharePrice: context.valuation.currentSharePrice, dcfBase: context.valuation.dcfBase },
        thesisHealth,
        mostRecentResearchEvent: context.recentResearchEvents[0] ?? null,
        lastReviewedAt: lastReview?.reviewedAt.toISOString() ?? null,
        nextReviewDueAt,
        contextUnavailable: false,
      };
    }),
  );
}
