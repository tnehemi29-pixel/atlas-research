import type { InvestmentCaseStatus } from '@prisma/client';
import type {
  CaseSnapshotAssumption,
  CaseSnapshotBusinessOverview,
  CaseSnapshotCatalyst,
  CaseSnapshotEvidence,
  CaseSnapshotFinancials,
  CaseSnapshotInvalidationCriterion,
  CaseSnapshotRisk,
  CaseSnapshotValuation,
} from './types';
import type { ContextResearchEvent } from './context';

/**
 * Spec section 21 — the 16-section Investment Memo. Every section maps
 * directly to a spec-required piece; only `executiveSummary`/`conclusion`
 * carry AI-written text (`text: null` means AI generation failed — see
 * lib/services/investmentMemoService.ts — every OTHER section is always
 * populated regardless, since it's assembled deterministically). Sections
 * 2-11 and 13, 15-16 come straight from the same frozen CaseSnapshot an
 * InvestmentCaseVersion stores, so the memo and its own version are always
 * in exact agreement.
 */

export interface MemoNarrativeSection {
  text: string | null;
  citedEvidenceIds: string[];
  citedResearchEventIds: string[];
}

export interface MemoHistoricalValidation {
  available: boolean;
  summary: string;
  sampleSize: number | null;
  methodology: string[];
  limitations: string[];
}

export interface InvestmentMemoContent {
  /** 1. Executive Summary */
  executiveSummary: MemoNarrativeSection;
  /** 2. Business Overview */
  businessOverview: { ticker: string; companyName: string } & CaseSnapshotBusinessOverview;
  /** 3. Investment Thesis */
  investmentThesis: { status: InvestmentCaseStatus; horizon: string; coreThesis: string; keyDrivers: string[] };
  /** 4. Financial Analysis */
  financialAnalysis: CaseSnapshotFinancials;
  /** 5. Valuation */
  valuation: CaseSnapshotValuation;
  /** 6. Bull/Base/Bear */
  bullBaseBear: { bullSummary: string | null; baseSummary: string | null; bearSummary: string | null; assumptions: CaseSnapshotAssumption[] };
  /** 7. Catalysts */
  catalysts: CaseSnapshotCatalyst[];
  /** 8. Risks */
  risks: CaseSnapshotRisk[];
  /** 9. Evidence For */
  evidenceFor: CaseSnapshotEvidence[];
  /** 10. Evidence Against */
  evidenceAgainst: CaseSnapshotEvidence[];
  /** 11. Key Assumptions */
  keyAssumptions: CaseSnapshotAssumption[];
  /** 12. What Would Change My Mind? */
  whatWouldChangeMyMind: { strengthen: string[]; weaken: string[]; invalidate: string[]; invalidationCriteria: CaseSnapshotInvalidationCriterion[] };
  /** 13. Historical Validation */
  historicalValidation: MemoHistoricalValidation;
  /** 14. Conclusion */
  conclusion: MemoNarrativeSection;
  /** 15. Sources */
  sources: { evidence: CaseSnapshotEvidence[]; researchEvents: ContextResearchEvent[] };
  /** 16. Methodology */
  methodology: string[];
}
