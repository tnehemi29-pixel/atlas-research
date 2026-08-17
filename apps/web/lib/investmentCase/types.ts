import type {
  CatalystStatus,
  ConfidenceLevel,
  EvidenceDirection,
  EvidenceSourceType,
  InvestmentAssumptionMetric,
  InvestmentCaseStatus,
  InvestmentScenario,
  RiskStatus,
} from '@prisma/client';

/**
 * Shared structural types for Milestone 13 (Investment Committee Research &
 * Decision Framework). `CaseSnapshot` is the one frozen shape both
 * InvestmentCaseVersion.snapshot and the memo generator's input are built
 * from — a single definition means "what a version captured" and "what a
 * memo was generated from" can never silently drift apart from each other.
 */

export interface CaseSnapshotAssumption {
  metric: InvestmentAssumptionMetric;
  scenario: InvestmentScenario;
  label: string;
  value: number;
  unit: string;
  confidence: ConfidenceLevel;
}

export interface CaseSnapshotEvidence {
  id: string;
  claim: string;
  evidence: string;
  date: string;
  category: string;
  direction: EvidenceDirection;
  strength: ConfidenceLevel;
  sourceType: EvidenceSourceType;
  sourceLabel: string;
}

export interface CaseSnapshotRisk {
  id: string;
  risk: string;
  probability: ConfidenceLevel | null;
  impact: ConfidenceLevel;
  status: RiskStatus;
}

export interface CaseSnapshotCatalyst {
  id: string;
  catalyst: string;
  timeframe: string;
  potentialImpact: ConfidenceLevel;
  status: CatalystStatus;
}

export interface CaseSnapshotInvalidationCriterion {
  id: string;
  description: string;
}

export interface CaseSnapshotBusinessOverview {
  exchange: string | null;
  sector: string | null;
  industry: string | null;
  country: string | null;
  marketCap: number | null;
}

export interface CaseSnapshotFinancials {
  revenue: number | null;
  revenueGrowth: number | null;
  operatingMargin: number | null;
  freeCashFlow: number | null;
}

export interface CaseSnapshotValuation {
  currentSharePrice: number | null;
  dcfBase: number | null;
  dcfBull: number | null;
  dcfBear: number | null;
  compsImplied: number | null;
  evToEbitda: number | null;
  peRatio: number | null;
}

/** Everything a memo or a version-to-version diff needs, frozen at one
 * point in time — never re-derived after the fact once new evidence or a
 * later review supersedes it. */
export interface CaseSnapshot {
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
  capturedAt: string;
}
