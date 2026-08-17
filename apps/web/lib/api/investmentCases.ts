import { ApiError } from './companies';

/**
 * Client-side fetchers for Milestone 13's Investment Committee Research &
 * Decision Framework. Response shapes mirror the underlying Prisma models
 * and lib/investmentCase/ pure types exactly, so the API route handlers
 * stay thin pass-throughs (same convention as lib/api/backtest.ts and
 * lib/api/researchEvents.ts).
 */

// ---------------------------------------------------------------------------
// Shared enum-like string unions
// ---------------------------------------------------------------------------

export type InvestmentCaseStatusValue = 'RESEARCHING' | 'WATCHLIST' | 'ACTIVE_THESIS' | 'UNDER_REVIEW' | 'THESIS_CHALLENGED' | 'THESIS_INVALIDATED' | 'ARCHIVED';
export type InvestmentScenarioValue = 'BULL' | 'BASE' | 'BEAR';
export type InvestmentAssumptionMetricValue = 'REVENUE_GROWTH' | 'REVENUE_CAGR' | 'OPERATING_MARGIN' | 'FCF_MARGIN' | 'WACC' | 'TERMINAL_GROWTH' | 'EXIT_MULTIPLE' | 'EPS_GROWTH' | 'DEBT' | 'SHARE_COUNT';
export type ContentOriginValue = 'USER' | 'AI';
export type EvidenceDirectionValue = 'SUPPORTS' | 'CONTRADICTS' | 'NEUTRAL';
export type EvidenceSourceTypeValue = 'TEN_K' | 'TEN_Q' | 'EIGHT_K' | 'EARNINGS_CALL' | 'FINANCIAL_STATEMENT' | 'DCF' | 'COMPS' | 'HISTORICAL_VALIDATION' | 'RESEARCH_EVENT';
export type CatalystStatusValue = 'UPCOMING' | 'IN_PROGRESS' | 'OCCURRED' | 'FAILED' | 'UNCERTAIN';
export type RiskStatusValue = 'MONITORING' | 'ESCALATING' | 'MITIGATED' | 'REALIZED';
export type InvalidationComparatorValue = 'LESS_THAN' | 'LESS_THAN_OR_EQUAL' | 'GREATER_THAN' | 'GREATER_THAN_OR_EQUAL';
export type InvalidationCriterionStatusValue = 'ACTIVE' | 'POTENTIALLY_MET' | 'RESOLVED';
export type ReviewTypeValue = 'QUARTERLY' | 'AD_HOC';
export type ReviewOutcomeValue = 'THESIS_VALID' | 'NEEDS_MODIFICATION' | 'INVALIDATED' | 'CONTINUE_MONITORING';
export type ConfidenceLevelValue = 'LOW' | 'MEDIUM' | 'HIGH';

async function parseOrThrow<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(body?.error ?? fallbackMessage, response.status);
  }
  return (await response.json()) as T;
}

// ---------------------------------------------------------------------------
// Investment Case (spec sections 2-3)
// ---------------------------------------------------------------------------

export interface InvestmentCaseResponse {
  id: string;
  userId: string;
  companyId: string;
  horizon: string;
  status: InvestmentCaseStatusValue;
  coreThesis: string;
  keyDrivers: string[];
  bullSummary: string | null;
  baseSummary: string | null;
  bearSummary: string | null;
  strengthenIndicators: string[];
  weakenIndicators: string[];
  invalidateIndicators: string[];
  createdAt: string;
  updatedAt: string;
}

export interface InvestmentCaseDetailResponse extends InvestmentCaseResponse {
  company: { id: string; ticker: string; name: string; exchange: string | null; sector: string | null; industry: string | null; country: string | null; marketCap: number | null };
}

export interface CreateInvestmentCaseInput {
  ticker: string;
  horizon: string;
  coreThesis: string;
  keyDrivers?: string[];
  status?: InvestmentCaseStatusValue;
}

export interface UpdateInvestmentCaseInput {
  horizon?: string;
  coreThesis?: string;
  keyDrivers?: string[];
  status?: InvestmentCaseStatusValue;
  bullSummary?: string | null;
  baseSummary?: string | null;
  bearSummary?: string | null;
  strengthenIndicators?: string[];
  weakenIndicators?: string[];
  invalidateIndicators?: string[];
}

export async function fetchInvestmentCases(signal?: AbortSignal): Promise<InvestmentCaseResponse[]> {
  const response = await fetch('/api/investment-cases', { signal });
  return parseOrThrow<InvestmentCaseResponse[]>(response, 'Failed to load investment cases.');
}

export async function fetchInvestmentCase(caseId: string, signal?: AbortSignal): Promise<InvestmentCaseDetailResponse> {
  const response = await fetch(`/api/investment-cases/${encodeURIComponent(caseId)}`, { signal });
  return parseOrThrow<InvestmentCaseDetailResponse>(response, 'Failed to load the investment case.');
}

export async function createInvestmentCase(input: CreateInvestmentCaseInput): Promise<InvestmentCaseResponse> {
  const response = await fetch('/api/investment-cases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  return parseOrThrow<InvestmentCaseResponse>(response, 'Failed to create the investment case.');
}

export async function updateInvestmentCase(caseId: string, input: UpdateInvestmentCaseInput): Promise<InvestmentCaseResponse> {
  const response = await fetch(`/api/investment-cases/${encodeURIComponent(caseId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  return parseOrThrow<InvestmentCaseResponse>(response, 'Failed to update the investment case.');
}

export async function deleteInvestmentCase(caseId: string): Promise<void> {
  const response = await fetch(`/api/investment-cases/${encodeURIComponent(caseId)}`, { method: 'DELETE' });
  await parseOrThrow<{ ok: true }>(response, 'Failed to delete the investment case.');
}

// ---------------------------------------------------------------------------
// Assumptions (spec sections 4-6)
// ---------------------------------------------------------------------------

export interface InvestmentCaseAssumptionResponse {
  id: string;
  investmentCaseId: string;
  metric: InvestmentAssumptionMetricValue;
  scenario: InvestmentScenarioValue;
  value: number;
  unit: string;
  asOfDate: string;
  source: string;
  model: string | null;
  confidence: ConfidenceLevelValue;
  origin: ContentOriginValue;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SetInvestmentCaseAssumptionInput {
  metric: InvestmentAssumptionMetricValue;
  scenario?: InvestmentScenarioValue;
  value: number;
  unit: string;
  asOfDate: string;
  source: string;
  model?: string | null;
  confidence?: ConfidenceLevelValue;
  origin?: ContentOriginValue;
  notes?: string | null;
}

export async function fetchInvestmentCaseAssumptions(caseId: string, signal?: AbortSignal): Promise<InvestmentCaseAssumptionResponse[]> {
  const response = await fetch(`/api/investment-cases/${encodeURIComponent(caseId)}/assumptions`, { signal });
  return parseOrThrow<InvestmentCaseAssumptionResponse[]>(response, 'Failed to load assumptions.');
}

export async function setInvestmentCaseAssumption(caseId: string, input: SetInvestmentCaseAssumptionInput): Promise<InvestmentCaseAssumptionResponse> {
  const response = await fetch(`/api/investment-cases/${encodeURIComponent(caseId)}/assumptions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  return parseOrThrow<InvestmentCaseAssumptionResponse>(response, 'Failed to save the assumption.');
}

export async function deleteInvestmentCaseAssumption(caseId: string, assumptionId: string): Promise<void> {
  const response = await fetch(`/api/investment-cases/${encodeURIComponent(caseId)}/assumptions/${encodeURIComponent(assumptionId)}`, { method: 'DELETE' });
  await parseOrThrow<{ ok: true }>(response, 'Failed to delete the assumption.');
}

// ---------------------------------------------------------------------------
// Evidence Matrix (spec sections 7-9)
// ---------------------------------------------------------------------------

export interface InvestmentCaseEvidenceResponse {
  id: string;
  investmentCaseId: string;
  claim: string;
  evidence: string;
  date: string;
  category: string;
  direction: EvidenceDirectionValue;
  strength: ConfidenceLevelValue;
  sourceType: EvidenceSourceTypeValue;
  sourceLabel: string;
  secFilingId: string | null;
  earningsCallId: string | null;
  researchEventId: string | null;
  origin: ContentOriginValue;
  createdAt: string;
}

export interface CreateInvestmentCaseEvidenceInput {
  claim: string;
  evidence: string;
  date: string;
  category: string;
  direction: EvidenceDirectionValue;
  strength: ConfidenceLevelValue;
  sourceType: EvidenceSourceTypeValue;
  sourceLabel: string;
  secFilingId?: string | null;
  earningsCallId?: string | null;
  researchEventId?: string | null;
  origin?: ContentOriginValue;
}

export async function fetchInvestmentCaseEvidence(caseId: string, signal?: AbortSignal): Promise<InvestmentCaseEvidenceResponse[]> {
  const response = await fetch(`/api/investment-cases/${encodeURIComponent(caseId)}/evidence`, { signal });
  return parseOrThrow<InvestmentCaseEvidenceResponse[]>(response, 'Failed to load evidence.');
}

/** Throws ApiError(400) when the source doesn't resolve to a real,
 * company-scoped Atlas record — surface `error.message` directly to the
 * user rather than a generic failure message. */
export async function createInvestmentCaseEvidence(caseId: string, input: CreateInvestmentCaseEvidenceInput): Promise<InvestmentCaseEvidenceResponse> {
  const response = await fetch(`/api/investment-cases/${encodeURIComponent(caseId)}/evidence`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  return parseOrThrow<InvestmentCaseEvidenceResponse>(response, 'Failed to add the evidence item.');
}

export async function deleteInvestmentCaseEvidence(caseId: string, evidenceId: string): Promise<void> {
  const response = await fetch(`/api/investment-cases/${encodeURIComponent(caseId)}/evidence/${encodeURIComponent(evidenceId)}`, { method: 'DELETE' });
  await parseOrThrow<{ ok: true }>(response, 'Failed to delete the evidence item.');
}

// ---------------------------------------------------------------------------
// Risks (spec section 19)
// ---------------------------------------------------------------------------

export interface InvestmentCaseRiskResponse {
  id: string;
  investmentCaseId: string;
  risk: string;
  probability: ConfidenceLevelValue | null;
  impact: ConfidenceLevelValue;
  evidence: string | null;
  status: RiskStatusValue;
  mitigation: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateInvestmentCaseRiskInput {
  risk: string;
  probability?: ConfidenceLevelValue | null;
  impact: ConfidenceLevelValue;
  evidence?: string | null;
  status?: RiskStatusValue;
  mitigation?: string | null;
}

export type UpdateInvestmentCaseRiskInput = Partial<CreateInvestmentCaseRiskInput>;

export async function fetchInvestmentCaseRisks(caseId: string, signal?: AbortSignal): Promise<InvestmentCaseRiskResponse[]> {
  const response = await fetch(`/api/investment-cases/${encodeURIComponent(caseId)}/risks`, { signal });
  return parseOrThrow<InvestmentCaseRiskResponse[]>(response, 'Failed to load risks.');
}

export async function createInvestmentCaseRisk(caseId: string, input: CreateInvestmentCaseRiskInput): Promise<InvestmentCaseRiskResponse> {
  const response = await fetch(`/api/investment-cases/${encodeURIComponent(caseId)}/risks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  return parseOrThrow<InvestmentCaseRiskResponse>(response, 'Failed to add the risk.');
}

export async function updateInvestmentCaseRisk(caseId: string, riskId: string, input: UpdateInvestmentCaseRiskInput): Promise<InvestmentCaseRiskResponse> {
  const response = await fetch(`/api/investment-cases/${encodeURIComponent(caseId)}/risks/${encodeURIComponent(riskId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  return parseOrThrow<InvestmentCaseRiskResponse>(response, 'Failed to update the risk.');
}

export async function deleteInvestmentCaseRisk(caseId: string, riskId: string): Promise<void> {
  const response = await fetch(`/api/investment-cases/${encodeURIComponent(caseId)}/risks/${encodeURIComponent(riskId)}`, { method: 'DELETE' });
  await parseOrThrow<{ ok: true }>(response, 'Failed to delete the risk.');
}

// ---------------------------------------------------------------------------
// Catalysts (spec section 18)
// ---------------------------------------------------------------------------

export interface InvestmentCaseCatalystResponse {
  id: string;
  investmentCaseId: string;
  catalyst: string;
  timeframe: string;
  evidence: string | null;
  potentialImpact: ConfidenceLevelValue;
  status: CatalystStatusValue;
  createdAt: string;
  updatedAt: string;
}

export interface CreateInvestmentCaseCatalystInput {
  catalyst: string;
  timeframe: string;
  evidence?: string | null;
  potentialImpact: ConfidenceLevelValue;
  status?: CatalystStatusValue;
}

export type UpdateInvestmentCaseCatalystInput = Partial<CreateInvestmentCaseCatalystInput>;

export async function fetchInvestmentCaseCatalysts(caseId: string, signal?: AbortSignal): Promise<InvestmentCaseCatalystResponse[]> {
  const response = await fetch(`/api/investment-cases/${encodeURIComponent(caseId)}/catalysts`, { signal });
  return parseOrThrow<InvestmentCaseCatalystResponse[]>(response, 'Failed to load catalysts.');
}

export async function createInvestmentCaseCatalyst(caseId: string, input: CreateInvestmentCaseCatalystInput): Promise<InvestmentCaseCatalystResponse> {
  const response = await fetch(`/api/investment-cases/${encodeURIComponent(caseId)}/catalysts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  return parseOrThrow<InvestmentCaseCatalystResponse>(response, 'Failed to add the catalyst.');
}

export async function updateInvestmentCaseCatalyst(caseId: string, catalystId: string, input: UpdateInvestmentCaseCatalystInput): Promise<InvestmentCaseCatalystResponse> {
  const response = await fetch(`/api/investment-cases/${encodeURIComponent(caseId)}/catalysts/${encodeURIComponent(catalystId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  return parseOrThrow<InvestmentCaseCatalystResponse>(response, 'Failed to update the catalyst.');
}

export async function deleteInvestmentCaseCatalyst(caseId: string, catalystId: string): Promise<void> {
  const response = await fetch(`/api/investment-cases/${encodeURIComponent(caseId)}/catalysts/${encodeURIComponent(catalystId)}`, { method: 'DELETE' });
  await parseOrThrow<{ ok: true }>(response, 'Failed to delete the catalyst.');
}

// ---------------------------------------------------------------------------
// Invalidation Criteria (spec section 11)
// ---------------------------------------------------------------------------

export interface InvestmentCaseInvalidationCriterionResponse {
  id: string;
  investmentCaseId: string;
  description: string;
  metric: InvestmentAssumptionMetricValue | null;
  comparator: InvalidationComparatorValue | null;
  thresholdValue: number | null;
  thresholdUnit: string | null;
  consecutivePeriods: number | null;
  status: InvalidationCriterionStatusValue;
  createdAt: string;
  updatedAt: string;
}

export interface CreateInvalidationCriterionInput {
  description: string;
  metric?: InvestmentAssumptionMetricValue | null;
  comparator?: InvalidationComparatorValue | null;
  thresholdValue?: number | null;
  thresholdUnit?: string | null;
  consecutivePeriods?: number | null;
}

export interface UpdateInvalidationCriterionInput extends Partial<CreateInvalidationCriterionInput> {
  status?: InvalidationCriterionStatusValue;
}

export async function fetchInvestmentCaseInvalidationCriteria(caseId: string, signal?: AbortSignal): Promise<InvestmentCaseInvalidationCriterionResponse[]> {
  const response = await fetch(`/api/investment-cases/${encodeURIComponent(caseId)}/invalidation-criteria`, { signal });
  return parseOrThrow<InvestmentCaseInvalidationCriterionResponse[]>(response, 'Failed to load invalidation criteria.');
}

export async function createInvestmentCaseInvalidationCriterion(caseId: string, input: CreateInvalidationCriterionInput): Promise<InvestmentCaseInvalidationCriterionResponse> {
  const response = await fetch(`/api/investment-cases/${encodeURIComponent(caseId)}/invalidation-criteria`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  return parseOrThrow<InvestmentCaseInvalidationCriterionResponse>(response, 'Failed to add the invalidation criterion.');
}

export async function updateInvestmentCaseInvalidationCriterion(caseId: string, criterionId: string, input: UpdateInvalidationCriterionInput): Promise<InvestmentCaseInvalidationCriterionResponse> {
  const response = await fetch(`/api/investment-cases/${encodeURIComponent(caseId)}/invalidation-criteria/${encodeURIComponent(criterionId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  return parseOrThrow<InvestmentCaseInvalidationCriterionResponse>(response, 'Failed to update the invalidation criterion.');
}

export async function deleteInvestmentCaseInvalidationCriterion(caseId: string, criterionId: string): Promise<void> {
  const response = await fetch(`/api/investment-cases/${encodeURIComponent(caseId)}/invalidation-criteria/${encodeURIComponent(criterionId)}`, { method: 'DELETE' });
  await parseOrThrow<{ ok: true }>(response, 'Failed to delete the invalidation criterion.');
}

// ---------------------------------------------------------------------------
// Thesis Challenge Engine + Invalidation Evaluations (spec sections 10-11, live/read-only)
// ---------------------------------------------------------------------------

export type ChallengeDifferenceKindValue = 'PERCENTAGE_POINTS' | 'RELATIVE_PERCENT';

export interface ThesisChallengeResponse {
  trigger: string;
  metric: InvestmentAssumptionMetricValue;
  label: string;
  thesisAssumption: number;
  currentValue: number;
  unit: string;
  difference: number;
  differenceKind: ChallengeDifferenceKindValue;
  affectedAreas: string[];
  source: string;
}

export interface InvalidationEvaluationResponse {
  criterionId: string;
  description: string;
  checkable: boolean;
  potentiallyMet: boolean;
  latestValue: number | null;
  thresholdValue: number | null;
  comparator: InvalidationComparatorValue | null;
  reason: string;
}

export async function fetchThesisChallenges(caseId: string, signal?: AbortSignal): Promise<ThesisChallengeResponse[]> {
  const response = await fetch(`/api/investment-cases/${encodeURIComponent(caseId)}/challenges`, { signal });
  return parseOrThrow<ThesisChallengeResponse[]>(response, 'Failed to load thesis challenges.');
}

export async function fetchInvalidationEvaluations(caseId: string, signal?: AbortSignal): Promise<InvalidationEvaluationResponse[]> {
  const response = await fetch(`/api/investment-cases/${encodeURIComponent(caseId)}/invalidation-evaluations`, { signal });
  return parseOrThrow<InvalidationEvaluationResponse[]>(response, 'Failed to load invalidation evaluations.');
}

// ---------------------------------------------------------------------------
// Review Workflow (spec sections 14-16)
// ---------------------------------------------------------------------------

export interface ReviewSummaryResponse {
  sinceDate: string | null;
  newResearchEvents: { id: string; type: string; title: string; materiality: string; eventDate: string }[];
  assumptionChallenges: { metric: string; label: string; thesisAssumption: number; currentValue: number; unit: string; difference: number; differenceKind: string; trigger: string; affectedAreas: string[] }[];
  newRisks: { id: string; risk: string; impact: string }[];
  newCatalysts: { id: string; catalyst: string; status: string }[];
  valuation: { currentSharePrice: number | null; dcfBase: number | null; dcfBull: number | null; dcfBear: number | null; compsImplied: number | null };
  historicalValidation: { available: boolean; summary: string; sampleSize: number | null; methodology: string[]; limitations: string[] };
  evidenceMatrix: { supportsCount: number; contradictsCount: number; neutralCount: number };
}

export interface InvestmentCaseReviewResponse {
  id: string;
  investmentCaseId: string;
  type: ReviewTypeValue;
  summary: ReviewSummaryResponse;
  outcome: ReviewOutcomeValue | null;
  notes: string | null;
  reviewedAt: string;
}

export async function fetchInvestmentCaseReviews(caseId: string, signal?: AbortSignal): Promise<InvestmentCaseReviewResponse[]> {
  const response = await fetch(`/api/investment-cases/${encodeURIComponent(caseId)}/reviews`, { signal });
  return parseOrThrow<InvestmentCaseReviewResponse[]>(response, 'Failed to load reviews.');
}

export async function fetchInvestmentCaseReview(caseId: string, reviewId: string, signal?: AbortSignal): Promise<InvestmentCaseReviewResponse> {
  const response = await fetch(`/api/investment-cases/${encodeURIComponent(caseId)}/reviews/${encodeURIComponent(reviewId)}`, { signal });
  return parseOrThrow<InvestmentCaseReviewResponse>(response, 'Failed to load the review.');
}

export async function startInvestmentCaseReview(caseId: string, type: ReviewTypeValue): Promise<InvestmentCaseReviewResponse> {
  const response = await fetch(`/api/investment-cases/${encodeURIComponent(caseId)}/reviews`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type }) });
  return parseOrThrow<InvestmentCaseReviewResponse>(response, 'Failed to start the review.');
}

/** The ONE call that ever sets a review's outcome — always an explicit,
 * separate user confirmation. Does not itself change the case's decision
 * status; call updateInvestmentCase separately for that. */
export async function confirmInvestmentCaseReview(caseId: string, reviewId: string, outcome: ReviewOutcomeValue, notes?: string | null): Promise<InvestmentCaseReviewResponse> {
  const response = await fetch(`/api/investment-cases/${encodeURIComponent(caseId)}/reviews/${encodeURIComponent(reviewId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ outcome, notes }) });
  return parseOrThrow<InvestmentCaseReviewResponse>(response, 'Failed to confirm the review.');
}

// ---------------------------------------------------------------------------
// Versions + Diff (spec section 22)
// ---------------------------------------------------------------------------

export interface CaseSnapshotAssumptionResponse {
  metric: InvestmentAssumptionMetricValue;
  scenario: InvestmentScenarioValue;
  label: string;
  value: number;
  unit: string;
  confidence: ConfidenceLevelValue;
}

export interface CaseSnapshotEvidenceResponse {
  id: string;
  claim: string;
  evidence: string;
  date: string;
  category: string;
  direction: EvidenceDirectionValue;
  strength: ConfidenceLevelValue;
  sourceType: EvidenceSourceTypeValue;
  sourceLabel: string;
}

export interface CaseSnapshotRiskResponse {
  id: string;
  risk: string;
  probability: ConfidenceLevelValue | null;
  impact: ConfidenceLevelValue;
  status: RiskStatusValue;
}

export interface CaseSnapshotCatalystResponse {
  id: string;
  catalyst: string;
  timeframe: string;
  potentialImpact: ConfidenceLevelValue;
  status: CatalystStatusValue;
}

export interface CaseSnapshotInvalidationCriterionResponse {
  id: string;
  description: string;
}

export interface CaseSnapshotValuationResponse {
  currentSharePrice: number | null;
  dcfBase: number | null;
  dcfBull: number | null;
  dcfBear: number | null;
  compsImplied: number | null;
  evToEbitda: number | null;
  peRatio: number | null;
}

export interface CaseSnapshotResponse {
  ticker: string;
  companyName: string;
  businessOverview: { exchange: string | null; sector: string | null; industry: string | null; country: string | null; marketCap: number | null };
  status: InvestmentCaseStatusValue;
  horizon: string;
  coreThesis: string;
  keyDrivers: string[];
  bullSummary: string | null;
  baseSummary: string | null;
  bearSummary: string | null;
  strengthenIndicators: string[];
  weakenIndicators: string[];
  invalidateIndicators: string[];
  assumptions: CaseSnapshotAssumptionResponse[];
  evidence: CaseSnapshotEvidenceResponse[];
  risks: CaseSnapshotRiskResponse[];
  catalysts: CaseSnapshotCatalystResponse[];
  invalidationCriteria: CaseSnapshotInvalidationCriterionResponse[];
  financials: { revenue: number | null; revenueGrowth: number | null; operatingMargin: number | null; freeCashFlow: number | null };
  valuation: CaseSnapshotValuationResponse;
  capturedAt: string;
}

export interface InvestmentCaseVersionResponse {
  id: string;
  investmentCaseId: string;
  version: number;
  snapshot: CaseSnapshotResponse;
  createdAt: string;
}

export interface VersionDiffResponse {
  thesisChanges: string[];
  assumptionChanges: { metric: InvestmentAssumptionMetricValue; scenario: InvestmentScenarioValue; label: string; previousValue: number | null; newValue: number | null }[];
  addedEvidence: CaseSnapshotEvidenceResponse[];
  removedEvidence: CaseSnapshotEvidenceResponse[];
  valuationChanges: { label: string; previousValue: number | null; newValue: number | null }[];
}

export async function fetchInvestmentCaseVersions(caseId: string, signal?: AbortSignal): Promise<InvestmentCaseVersionResponse[]> {
  const response = await fetch(`/api/investment-cases/${encodeURIComponent(caseId)}/versions`, { signal });
  return parseOrThrow<InvestmentCaseVersionResponse[]>(response, 'Failed to load versions.');
}

export async function createInvestmentCaseVersion(caseId: string): Promise<InvestmentCaseVersionResponse> {
  const response = await fetch(`/api/investment-cases/${encodeURIComponent(caseId)}/versions`, { method: 'POST' });
  return parseOrThrow<InvestmentCaseVersionResponse>(response, 'Failed to create a new version.');
}

export async function compareInvestmentCaseVersions(caseId: string, from: number, to: number, signal?: AbortSignal): Promise<VersionDiffResponse> {
  const response = await fetch(`/api/investment-cases/${encodeURIComponent(caseId)}/versions/compare?from=${from}&to=${to}`, { signal });
  return parseOrThrow<VersionDiffResponse>(response, 'Failed to compare versions.');
}

// ---------------------------------------------------------------------------
// Investment Memo (spec sections 21-22)
// ---------------------------------------------------------------------------

export interface MemoNarrativeSectionResponse {
  text: string | null;
  citedEvidenceIds: string[];
  citedResearchEventIds: string[];
}

export interface MemoHistoricalValidationResponse {
  available: boolean;
  summary: string;
  sampleSize: number | null;
  methodology: string[];
  limitations: string[];
}

export interface InvestmentMemoContentResponse {
  executiveSummary: MemoNarrativeSectionResponse;
  businessOverview: { ticker: string; companyName: string } & CaseSnapshotResponse['businessOverview'];
  investmentThesis: { status: InvestmentCaseStatusValue; horizon: string; coreThesis: string; keyDrivers: string[] };
  financialAnalysis: CaseSnapshotResponse['financials'];
  valuation: CaseSnapshotValuationResponse;
  bullBaseBear: { bullSummary: string | null; baseSummary: string | null; bearSummary: string | null; assumptions: CaseSnapshotAssumptionResponse[] };
  catalysts: CaseSnapshotCatalystResponse[];
  risks: CaseSnapshotRiskResponse[];
  evidenceFor: CaseSnapshotEvidenceResponse[];
  evidenceAgainst: CaseSnapshotEvidenceResponse[];
  keyAssumptions: CaseSnapshotAssumptionResponse[];
  whatWouldChangeMyMind: { strengthen: string[]; weaken: string[]; invalidate: string[]; invalidationCriteria: CaseSnapshotInvalidationCriterionResponse[] };
  historicalValidation: MemoHistoricalValidationResponse;
  conclusion: MemoNarrativeSectionResponse;
  sources: { evidence: CaseSnapshotEvidenceResponse[]; researchEvents: { id: string; type: string; title: string; materiality: string; eventDate: string }[] };
  methodology: string[];
}

export interface InvestmentMemoResponse {
  id: string;
  investmentCaseId: string;
  versionId: string;
  status: 'SUCCESS' | 'FAILED';
  model: string | null;
  error: string | null;
  content: InvestmentMemoContentResponse;
  inputTokens: number | null;
  outputTokens: number | null;
  createdAt: string;
}

export async function fetchInvestmentMemos(caseId: string, signal?: AbortSignal): Promise<InvestmentMemoResponse[]> {
  const response = await fetch(`/api/investment-cases/${encodeURIComponent(caseId)}/memo`, { signal });
  return parseOrThrow<InvestmentMemoResponse[]>(response, 'Failed to load memos.');
}

export async function fetchInvestmentMemo(caseId: string, memoId: string, signal?: AbortSignal): Promise<InvestmentMemoResponse> {
  const response = await fetch(`/api/investment-cases/${encodeURIComponent(caseId)}/memo/${encodeURIComponent(memoId)}`, { signal });
  return parseOrThrow<InvestmentMemoResponse>(response, 'Failed to load the memo.');
}

export async function generateInvestmentMemo(caseId: string): Promise<InvestmentMemoResponse> {
  const response = await fetch(`/api/investment-cases/${encodeURIComponent(caseId)}/memo`, { method: 'POST' });
  return parseOrThrow<InvestmentMemoResponse>(response, 'Failed to generate the memo.');
}

// ---------------------------------------------------------------------------
// AI Thesis Assistant (spec section 9)
// ---------------------------------------------------------------------------

export interface InvestmentThesisAssistantResponse {
  payload: { answer: string; cited_evidence_ids: string[]; cited_research_event_ids: string[]; caveats: string[] };
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export async function askInvestmentThesisAssistant(caseId: string, question: string): Promise<InvestmentThesisAssistantResponse> {
  const response = await fetch(`/api/investment-cases/${encodeURIComponent(caseId)}/assistant`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question }) });
  return parseOrThrow<InvestmentThesisAssistantResponse>(response, 'Failed to ask the thesis assistant.');
}
