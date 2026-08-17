import type {
  ClaimValidationStatusValue,
  DimensionStatusValue,
  IntegrityIssueSeverityValue,
  ResearchIntegrityStatusValue,
} from '@/lib/api/integrity';

/**
 * Shared badge styling + labels for Milestone 14's integrity statuses —
 * mirrors lib/utils/researchEventDisplay.ts's MATERIALITY_STYLE convention
 * so a status never gets styled three different ways across the company
 * panel and the global dashboard (M14 task #179).
 */

export const RESEARCH_INTEGRITY_STATUS_STYLE: Record<ResearchIntegrityStatusValue, string> = {
  VERIFIED: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  MINOR_ISSUES: 'border-ink/15 bg-ink/5 text-ink/60',
  REVIEW_REQUIRED: 'border-amber-300 bg-amber-50 text-amber-800',
  SIGNIFICANT_ISSUES: 'border-orange-300 bg-orange-50 text-orange-800',
  CRITICAL: 'border-red-300 bg-red-50 text-red-700',
};

export const RESEARCH_INTEGRITY_STATUS_LABELS: Record<ResearchIntegrityStatusValue, string> = {
  VERIFIED: 'Verified',
  MINOR_ISSUES: 'Minor Issues',
  REVIEW_REQUIRED: 'Review Required',
  SIGNIFICANT_ISSUES: 'Significant Issues',
  CRITICAL: 'Critical',
};

export const DIMENSION_STATUS_STYLE: Record<DimensionStatusValue, string> = {
  OK: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  NEEDS_REVIEW: 'border-amber-300 bg-amber-50 text-amber-800',
  ERROR: 'border-red-300 bg-red-50 text-red-700',
  UNKNOWN: 'border-ink/15 bg-ink/5 text-ink/50',
};

export const DIMENSION_STATUS_ICON: Record<DimensionStatusValue, string> = {
  OK: '✓',
  NEEDS_REVIEW: '⚠',
  ERROR: '✕',
  UNKNOWN: '–',
};

/** The 7 dimensions computeIntegritySnapshot builds (spec section 19's
 * worked example groups "Data" into Market Data + Financial Statements,
 * covered here by their own tiles; research-report-level mismatches surface
 * as AI_CLAIM_REJECTED / RESEARCH_REPORT_MISMATCH issues in the Research
 * Claims registry below rather than as an eighth top-level tile). */
export const DIMENSION_LABELS = {
  marketData: 'Market Data',
  financialStatements: 'Financial Statements',
  secFilings: 'SEC Filings',
  earnings: 'Earnings',
  dcf: 'DCF Model',
  comps: 'Comparable Companies',
  investmentCase: 'Investment Cases',
} as const;

export const DIMENSION_DATASET_TYPE = {
  marketData: 'MARKET_DATA',
  financialStatements: 'FINANCIAL_STATEMENTS',
  secFilings: 'SEC_FILINGS',
  earnings: 'EARNINGS',
  dcf: 'DCF_MODEL',
  comps: 'COMPS_MODEL',
  investmentCase: 'INVESTMENT_CASE',
} as const;

export const ISSUE_SEVERITY_STYLE: Record<IntegrityIssueSeverityValue, string> = {
  LOW: 'border-ink/15 bg-ink/5 text-ink/50',
  MEDIUM: 'border-amber-300 bg-amber-50 text-amber-800',
  HIGH: 'border-orange-300 bg-orange-50 text-orange-800',
  CRITICAL: 'border-red-300 bg-red-50 text-red-700',
};

export const CLAIM_VALIDATION_STATUS_STYLE: Record<ClaimValidationStatusValue, string> = {
  VERIFIED: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  UNVERIFIED: 'border-ink/15 bg-ink/5 text-ink/50',
  CONTRADICTED: 'border-red-300 bg-red-50 text-red-700',
  STALE: 'border-amber-300 bg-amber-50 text-amber-800',
  REJECTED: 'border-red-300 bg-red-50 text-red-700',
};
