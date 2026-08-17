import type { Metadata } from 'next';
import { redirect, notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { getInvestmentCaseDetail, InvestmentCaseNotFoundError } from '@/lib/services/investmentCaseService';
import { listAssumptions } from '@/lib/services/investmentCaseAssumptionService';
import { listEvidence } from '@/lib/services/investmentCaseEvidenceService';
import { listRisks } from '@/lib/services/investmentCaseRiskService';
import { listCatalysts } from '@/lib/services/investmentCaseCatalystService';
import { listInvalidationCriteria } from '@/lib/services/investmentCaseInvalidationCriterionService';
import { getInvalidationEvaluations, getThesisChallenges } from '@/lib/services/investmentCaseChallengeService';
import { listReviews } from '@/lib/services/investmentCaseReviewService';
import { listVersions } from '@/lib/services/investmentCaseVersionService';
import { listMemos } from '@/lib/services/investmentMemoService';
import { getQuickDcfScenarios, getQuickComps, getQuickFundamentals } from '@/lib/valuation/quickValuation';
import { CaseDetailWorkspace } from '@/components/investment-cases/detail/CaseDetailWorkspace';
import type {
  InvestmentCaseAssumptionResponse,
  InvestmentCaseCatalystResponse,
  InvestmentCaseEvidenceResponse,
  InvestmentCaseInvalidationCriterionResponse,
  InvestmentCaseReviewResponse,
  InvestmentCaseRiskResponse,
  InvestmentCaseVersionResponse,
  InvestmentMemoResponse,
} from '@/lib/api/investmentCases';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  return { title: 'Investment Case · Atlas Research' };
}

export default async function InvestmentCaseDetailPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  let detail;
  try {
    detail = await getInvestmentCaseDetail(user.id, params.id);
  } catch (error) {
    if (error instanceof InvestmentCaseNotFoundError) notFound();
    throw error;
  }

  const [assumptions, evidence, risks, catalysts, invalidationCriteria, challenges, invalidationEvaluations, reviews, versions, memos, dcfScenarios, comps, fundamentals] = await Promise.all([
    listAssumptions(user.id, detail.id),
    listEvidence(user.id, detail.id),
    listRisks(user.id, detail.id),
    listCatalysts(user.id, detail.id),
    listInvalidationCriteria(user.id, detail.id),
    getThesisChallenges(user.id, detail.id),
    getInvalidationEvaluations(user.id, detail.id),
    listReviews(user.id, detail.id),
    listVersions(user.id, detail.id),
    listMemos(user.id, detail.id),
    getQuickDcfScenarios(detail.company.ticker).catch(() => null),
    getQuickComps(detail.company.ticker).catch(() => null),
    getQuickFundamentals(detail.company.ticker).catch(() => null),
  ]);

  const caseDetail = {
    id: detail.id,
    userId: detail.userId,
    companyId: detail.companyId,
    horizon: detail.horizon,
    status: detail.status,
    coreThesis: detail.coreThesis,
    keyDrivers: detail.keyDrivers,
    bullSummary: detail.bullSummary,
    baseSummary: detail.baseSummary,
    bearSummary: detail.bearSummary,
    strengthenIndicators: detail.strengthenIndicators,
    weakenIndicators: detail.weakenIndicators,
    invalidateIndicators: detail.invalidateIndicators,
    createdAt: detail.createdAt.toISOString(),
    updatedAt: detail.updatedAt.toISOString(),
    company: {
      id: detail.company.id,
      ticker: detail.company.ticker,
      name: detail.company.name,
      exchange: detail.company.exchange,
      sector: detail.company.sector,
      industry: detail.company.industry,
      country: detail.company.country,
      marketCap: detail.company.marketCap,
    },
  };

  const initialAssumptions: InvestmentCaseAssumptionResponse[] = assumptions.map((a) => ({
    id: a.id, investmentCaseId: a.investmentCaseId, metric: a.metric, scenario: a.scenario, value: a.value, unit: a.unit,
    asOfDate: a.asOfDate.toISOString(), source: a.source, model: a.model, confidence: a.confidence, origin: a.origin,
    notes: a.notes, createdAt: a.createdAt.toISOString(), updatedAt: a.updatedAt.toISOString(),
  }));

  const initialEvidence: InvestmentCaseEvidenceResponse[] = evidence.map((e) => ({
    id: e.id, investmentCaseId: e.investmentCaseId, claim: e.claim, evidence: e.evidence, date: e.date.toISOString(),
    category: e.category, direction: e.direction, strength: e.strength, sourceType: e.sourceType, sourceLabel: e.sourceLabel,
    secFilingId: e.secFilingId, earningsCallId: e.earningsCallId, researchEventId: e.researchEventId, origin: e.origin,
    createdAt: e.createdAt.toISOString(),
  }));

  const initialRisks: InvestmentCaseRiskResponse[] = risks.map((r) => ({
    id: r.id, investmentCaseId: r.investmentCaseId, risk: r.risk, probability: r.probability, impact: r.impact,
    evidence: r.evidence, status: r.status, mitigation: r.mitigation, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
  }));

  const initialCatalysts: InvestmentCaseCatalystResponse[] = catalysts.map((c) => ({
    id: c.id, investmentCaseId: c.investmentCaseId, catalyst: c.catalyst, timeframe: c.timeframe, evidence: c.evidence,
    potentialImpact: c.potentialImpact, status: c.status, createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString(),
  }));

  const initialInvalidationCriteria: InvestmentCaseInvalidationCriterionResponse[] = invalidationCriteria.map((c) => ({
    id: c.id, investmentCaseId: c.investmentCaseId, description: c.description, metric: c.metric, comparator: c.comparator,
    thresholdValue: c.thresholdValue, thresholdUnit: c.thresholdUnit, consecutivePeriods: c.consecutivePeriods, status: c.status,
    createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString(),
  }));

  const initialReviews: InvestmentCaseReviewResponse[] = reviews.map((r) => ({
    id: r.id, investmentCaseId: r.investmentCaseId, type: r.type, summary: r.summary as never, outcome: r.outcome,
    notes: r.notes, reviewedAt: r.reviewedAt.toISOString(),
  }));

  const initialVersions: InvestmentCaseVersionResponse[] = versions.map((v) => ({
    id: v.id, investmentCaseId: v.investmentCaseId, version: v.version, snapshot: v.snapshot as never, createdAt: v.createdAt.toISOString(),
  }));

  const initialMemos: InvestmentMemoResponse[] = memos.map((m) => ({
    id: m.id, investmentCaseId: m.investmentCaseId, versionId: m.versionId, status: m.status as 'SUCCESS' | 'FAILED',
    model: m.model, error: m.error, content: m.content as never, inputTokens: m.inputTokens, outputTokens: m.outputTokens,
    createdAt: m.createdAt.toISOString(),
  }));

  const valuation = {
    currentSharePrice: fundamentals?.price ?? dcfScenarios?.base.currentSharePrice ?? null,
    dcfBear: dcfScenarios?.bear ?? null,
    dcfBase: dcfScenarios?.base ?? null,
    dcfBull: dcfScenarios?.bull ?? null,
    compsImplied: comps?.impliedSharePrice ?? null,
    evToEbitda: fundamentals?.evToEbitda ?? null,
    peRatio: fundamentals?.peRatio ?? null,
  };

  return (
    <CaseDetailWorkspace
      initialCase={caseDetail}
      initialAssumptions={initialAssumptions}
      initialEvidence={initialEvidence}
      initialRisks={initialRisks}
      initialCatalysts={initialCatalysts}
      initialInvalidationCriteria={initialInvalidationCriteria}
      initialChallenges={challenges}
      initialInvalidationEvaluations={invalidationEvaluations}
      initialReviews={initialReviews}
      initialVersions={initialVersions}
      initialMemos={initialMemos}
      initialValuation={valuation}
    />
  );
}
