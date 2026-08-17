import type { InvestmentCaseStatus } from '@prisma/client';
import { buildCaseSnapshot } from '@/lib/services/investmentCaseVersionService';
import { getInvalidationEvaluations, getThesisChallenges } from '@/lib/services/investmentCaseChallengeService';
import { getCompanyTimeline } from '@/lib/services/researchEventFeedService';
import type { ThesisChallenge } from './thesisChallengeEngine';
import type { InvalidationEvaluation } from './invalidationMonitor';
import type { CaseSnapshotAssumption, CaseSnapshotBusinessOverview, CaseSnapshotCatalyst, CaseSnapshotEvidence, CaseSnapshotFinancials, CaseSnapshotInvalidationCriterion, CaseSnapshotRisk, CaseSnapshotValuation } from './types';

/**
 * The one shared context builder both the AI Thesis Assistant (spec section
 * 9) and the Investment Memo generator (spec section 21) call — mirrors the
 * role lib/research/aggregateResearchContext.ts plays for Milestone 9's
 * report generator: gather everything once, from services that already
 * exist, never re-derive the same numbers twice for two different AI
 * features. Built on top of `buildCaseSnapshot` (the case's own structured
 * state) plus the live challenge/invalidation reads and a slice of the
 * company's Milestone 11 research timeline.
 */

const RECENT_RESEARCH_EVENTS_LIMIT = 15;

export interface ContextResearchEvent {
  id: string;
  type: string;
  title: string;
  materiality: string;
  eventDate: string;
}

export interface InvestmentCaseContext {
  caseId: string;
  ticker: string;
  companyName: string;
  businessOverview: CaseSnapshotBusinessOverview;
  status: InvestmentCaseStatus;
  horizon: string;
  coreThesis: string;
  keyDrivers: string[];
  bullSummary: string | null;
  baseSummary: string | null;
  bearSummary: string | null;
  strengthenIndicators: string[];
  weakenIndicators: string[];
  invalidateIndicators: string[];
  assumptions: CaseSnapshotAssumption[];
  evidence: CaseSnapshotEvidence[];
  risks: CaseSnapshotRisk[];
  catalysts: CaseSnapshotCatalyst[];
  invalidationCriteria: CaseSnapshotInvalidationCriterion[];
  financials: CaseSnapshotFinancials;
  valuation: CaseSnapshotValuation;
  challenges: ThesisChallenge[];
  invalidationEvaluations: InvalidationEvaluation[];
  recentResearchEvents: ContextResearchEvent[];
  generatedAt: string;
}

export async function buildInvestmentCaseContext(userId: string, caseId: string): Promise<InvestmentCaseContext> {
  const snapshot = await buildCaseSnapshot(userId, caseId);

  const [challenges, invalidationEvaluations, timeline] = await Promise.all([
    getThesisChallenges(userId, caseId).catch(() => []),
    getInvalidationEvaluations(userId, caseId).catch(() => []),
    getCompanyTimeline(snapshot.ticker).catch(() => []),
  ]);

  const recentResearchEvents: ContextResearchEvent[] = timeline
    .slice(0, RECENT_RESEARCH_EVENTS_LIMIT)
    .map((e) => ({ id: e.id, type: e.type, title: e.title, materiality: e.materiality, eventDate: e.eventDate }));

  return {
    caseId,
    ticker: snapshot.ticker,
    companyName: snapshot.companyName,
    businessOverview: snapshot.businessOverview,
    status: snapshot.status,
    horizon: snapshot.horizon,
    coreThesis: snapshot.coreThesis,
    keyDrivers: snapshot.keyDrivers,
    bullSummary: snapshot.bullSummary,
    baseSummary: snapshot.baseSummary,
    bearSummary: snapshot.bearSummary,
    strengthenIndicators: snapshot.strengthenIndicators,
    weakenIndicators: snapshot.weakenIndicators,
    invalidateIndicators: snapshot.invalidateIndicators,
    assumptions: snapshot.assumptions,
    evidence: snapshot.evidence,
    risks: snapshot.risks,
    catalysts: snapshot.catalysts,
    invalidationCriteria: snapshot.invalidationCriteria,
    financials: snapshot.financials,
    valuation: snapshot.valuation,
    challenges,
    invalidationEvaluations,
    recentResearchEvents,
    generatedAt: new Date().toISOString(),
  };
}

/** Every real, citable id in this context — evidence rows and research
 * events, the only two things this milestone lets the AI point back to.
 * The AI orchestrator strips any citation not in this set before the
 * response is ever shown to a user, the same "backend-enforced, not just
 * prompt-enforced" discipline Milestone 9's `sanitizeReportPayload` uses. */
export function collectValidCitationIds(context: InvestmentCaseContext): Set<string> {
  return new Set<string>([...context.evidence.map((e) => e.id), ...context.recentResearchEvents.map((e) => e.id)]);
}
