/**
 * The shape stored in InvestmentCaseReview.summary — assembled once, at
 * review-start time, from Milestone 11 (research events) and Milestone 12
 * (historical validation) reads plus a live valuation snapshot and the
 * deterministic thesis-challenge engine. Never re-derived after the fact;
 * a completed review's summary is frozen exactly like a version snapshot.
 */

export interface ReviewSummaryResearchEvent {
  id: string;
  type: string;
  title: string;
  materiality: string;
  eventDate: string;
}

export interface ReviewSummaryChallenge {
  metric: string;
  label: string;
  thesisAssumption: number;
  currentValue: number;
  unit: string;
  difference: number;
  differenceKind: string;
  trigger: string;
  affectedAreas: string[];
}

export interface ReviewSummaryValuation {
  currentSharePrice: number | null;
  dcfBase: number | null;
  dcfBull: number | null;
  dcfBear: number | null;
  compsImplied: number | null;
}

export interface ReviewSummaryHistoricalValidation {
  available: boolean;
  summary: string;
  sampleSize: number | null;
  methodology: string[];
  limitations: string[];
}

export interface ReviewSummaryEvidenceMatrix {
  supportsCount: number;
  contradictsCount: number;
  neutralCount: number;
}

export interface ReviewSummary {
  /** ISO date of the previous review, or null when this is the case's
   * first-ever review (in which case "new" means "since the case was
   * created"). */
  sinceDate: string | null;
  newResearchEvents: ReviewSummaryResearchEvent[];
  assumptionChallenges: ReviewSummaryChallenge[];
  newRisks: { id: string; risk: string; impact: string }[];
  newCatalysts: { id: string; catalyst: string; status: string }[];
  valuation: ReviewSummaryValuation;
  historicalValidation: ReviewSummaryHistoricalValidation;
  evidenceMatrix: ReviewSummaryEvidenceMatrix;
}
