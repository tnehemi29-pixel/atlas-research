import { Prisma, type InvestmentCaseReview, type ReviewOutcome, type ReviewType } from '@prisma/client';
import { db } from '@/lib/db';
import { getInvestmentCaseDetail, getOwnedInvestmentCase } from '@/lib/services/investmentCaseService';
import { getCompanyTimeline } from '@/lib/services/researchEventFeedService';
import { getQuickComps, getQuickDcfScenarios, getQuickFundamentals } from '@/lib/valuation/quickValuation';
import { runDcfForecastValidation } from '@/lib/services/backtestService';
import { getThesisChallenges } from '@/lib/services/investmentCaseChallengeService';
import type { ReviewSummary } from '@/lib/investmentCase/reviewTypes';

/**
 * Spec section 14 (Review Workflow), 15 (Research Change Integration — reuses
 * Milestone 11's own `getCompanyTimeline`, never a second detection pass),
 * and 16 (Historical Validation Integration — reuses Milestone 12's
 * `runDcfForecastValidation`, never a second backtest engine).
 *
 * `startReview` always creates the row up front with `outcome: null` — a
 * review that's been started but not yet confirmed is still durable, never
 * lost. `confirmReview` is the ONLY function that ever sets `outcome`,
 * and it's always an explicit call driven by the user checking one of the
 * four confirmation options; nothing in this file infers or defaults an
 * outcome on the user's behalf.
 */

export class InvestmentCaseReviewNotFoundError extends Error {
  constructor(message = 'Review not found.') {
    super(message);
    this.name = 'InvestmentCaseReviewNotFoundError';
  }
}

async function buildReviewSummary(userId: string, caseId: string): Promise<ReviewSummary> {
  const investmentCase = await getInvestmentCaseDetail(userId, caseId);
  const ticker = investmentCase.company.ticker;

  const previousReview = await db.investmentCaseReview.findFirst({ where: { investmentCaseId: caseId }, orderBy: { reviewedAt: 'desc' } });
  const sinceDate = previousReview?.reviewedAt ?? investmentCase.createdAt;

  const [timeline, challenges, dcfScenarios, comps, forecastValidation, openRisks, catalysts, evidence] = await Promise.all([
    getCompanyTimeline(ticker),
    getThesisChallenges(userId, caseId),
    getQuickDcfScenarios(ticker).catch(() => null),
    getQuickComps(ticker).catch(() => null),
    runDcfForecastValidation(ticker).catch(() => null),
    db.investmentCaseRisk.findMany({ where: { investmentCaseId: caseId, createdAt: { gt: sinceDate } } }),
    db.investmentCaseCatalyst.findMany({ where: { investmentCaseId: caseId, createdAt: { gt: sinceDate } } }),
    db.investmentCaseEvidence.findMany({ where: { investmentCaseId: caseId } }),
  ]);

  const newResearchEvents = timeline
    .filter((e) => new Date(e.eventDate) > sinceDate)
    .map((e) => ({ id: e.id, type: e.type, title: e.title, materiality: e.materiality, eventDate: e.eventDate }));

  return {
    sinceDate: previousReview ? previousReview.reviewedAt.toISOString() : null,
    newResearchEvents,
    assumptionChallenges: challenges.map((c) => ({
      metric: c.metric,
      label: c.label,
      thesisAssumption: c.thesisAssumption,
      currentValue: c.currentValue,
      unit: c.unit,
      difference: c.difference,
      differenceKind: c.differenceKind,
      trigger: c.trigger,
      affectedAreas: c.affectedAreas,
    })),
    newRisks: openRisks.map((r) => ({ id: r.id, risk: r.risk, impact: r.impact })),
    newCatalysts: catalysts.map((c) => ({ id: c.id, catalyst: c.catalyst, status: c.status })),
    valuation: {
      currentSharePrice: dcfScenarios?.base.currentSharePrice ?? null,
      dcfBase: dcfScenarios?.base.impliedSharePrice ?? null,
      dcfBull: dcfScenarios?.bull.impliedSharePrice ?? null,
      dcfBear: dcfScenarios?.bear.impliedSharePrice ?? null,
      compsImplied: comps?.impliedSharePrice ?? null,
    },
    historicalValidation: {
      available: forecastValidation !== null && forecastValidation.comparisons.length > 0,
      summary: forecastValidation && forecastValidation.comparisons.length > 0
        ? `Atlas's own historical DCF forecasts for ${ticker} have been scored against ${forecastValidation.comparisons.length} actual reported fiscal-year outcomes.`
        : 'No historical forecast-validation data is available yet for this company.',
      sampleSize: forecastValidation?.comparisons.length ?? null,
      methodology: forecastValidation?.methodology ?? [],
      limitations: ['Historical forecast accuracy and valuation relationships are not a guarantee of future performance — see /research-backtest/methodology.'],
    },
    evidenceMatrix: {
      supportsCount: evidence.filter((e) => e.direction === 'SUPPORTS').length,
      contradictsCount: evidence.filter((e) => e.direction === 'CONTRADICTS').length,
      neutralCount: evidence.filter((e) => e.direction === 'NEUTRAL').length,
    },
  };
}

export async function startReview(userId: string, caseId: string, type: ReviewType): Promise<InvestmentCaseReview> {
  const investmentCase = await getOwnedInvestmentCase(userId, caseId);
  const summary = await buildReviewSummary(userId, caseId);

  return db.investmentCaseReview.create({
    data: { investmentCaseId: investmentCase.id, type, summary: summary as unknown as Prisma.InputJsonValue },
  });
}

export async function listReviews(userId: string, caseId: string): Promise<InvestmentCaseReview[]> {
  const investmentCase = await getOwnedInvestmentCase(userId, caseId);
  return db.investmentCaseReview.findMany({ where: { investmentCaseId: investmentCase.id }, orderBy: { reviewedAt: 'desc' } });
}

export async function getReview(userId: string, caseId: string, reviewId: string): Promise<InvestmentCaseReview> {
  const investmentCase = await getOwnedInvestmentCase(userId, caseId);
  const review = await db.investmentCaseReview.findFirst({ where: { id: reviewId, investmentCaseId: investmentCase.id } });
  if (!review) throw new InvestmentCaseReviewNotFoundError();
  return review;
}

/** The confirmation step (spec section 14's checklist) — always an
 * explicit user action. Confirming INVALIDATED here still does NOT change
 * InvestmentCase.status by itself; the API layer surfaces the outcome and
 * leaves the actual status transition to the same explicit
 * `updateInvestmentCase` call every other status change goes through. */
export async function confirmReview(userId: string, caseId: string, reviewId: string, outcome: ReviewOutcome, notes?: string | null): Promise<InvestmentCaseReview> {
  await getReview(userId, caseId, reviewId);
  return db.investmentCaseReview.update({ where: { id: reviewId }, data: { outcome, notes: notes ?? null } });
}
