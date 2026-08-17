import { ApiError } from './companies';

/**
 * Client-side fetchers for Milestone 14's Data Quality, Model Audit &
 * Research Integrity Engine — mirrors the response shapes built by
 * lib/services/integritySnapshotService.ts, integrityIssueService.ts,
 * researchClaimService.ts, and auditLogService.ts exactly, so the API route
 * handlers stay thin pass-throughs (same convention as lib/api/investmentCases.ts).
 */

export type ResearchIntegrityStatusValue = 'VERIFIED' | 'MINOR_ISSUES' | 'REVIEW_REQUIRED' | 'SIGNIFICANT_ISSUES' | 'CRITICAL';
export type DimensionStatusValue = 'OK' | 'NEEDS_REVIEW' | 'ERROR' | 'UNKNOWN';
export type IntegrityIssueCategoryValue =
  | 'DATA_COMPLETENESS' | 'DATA_FRESHNESS' | 'DATA_DISCREPANCY' | 'FINANCIAL_RECONCILIATION' | 'MARKET_DATA_INTEGRITY'
  | 'DCF_MODEL_ERROR' | 'DCF_STALE' | 'COMPS_MODEL_ERROR' | 'RESEARCH_REPORT_MISMATCH' | 'AI_CLAIM_REJECTED'
  | 'RESEARCH_CONTRADICTION' | 'THESIS_ASSUMPTION_CONFLICT' | 'HISTORICAL_VALIDATION_LIMITATION' | 'SOURCE_UNVERIFIED';
export type IntegrityIssueSeverityValue = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type IntegrityIssueStatusValue = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'IGNORED';
export type IntegrityDatasetTypeValue = 'MARKET_DATA' | 'FINANCIAL_STATEMENTS' | 'SEC_FILINGS' | 'EARNINGS' | 'DCF_MODEL' | 'COMPS_MODEL' | 'HISTORICAL_VALIDATION' | 'RESEARCH_REPORT' | 'INVESTMENT_CASE';
export type ClaimValidationStatusValue = 'VERIFIED' | 'UNVERIFIED' | 'CONTRADICTED' | 'STALE' | 'REJECTED';
export type SourceTierValue = 'TIER_1' | 'TIER_2' | 'TIER_3' | 'TIER_4';
export type AuditLogActionValue = 'CHECK_RUN' | 'ISSUE_CREATED' | 'ISSUE_ACKNOWLEDGED' | 'ISSUE_RESOLVED' | 'ISSUE_IGNORED' | 'ISSUE_AUTO_RESOLVED' | 'CLAIM_CREATED' | 'CLAIM_VALIDATED' | 'MODEL_AUDIT_RUN' | 'SNAPSHOT_COMPUTED';

async function parseOrThrow<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(body?.error ?? fallbackMessage, response.status);
  }
  return (await response.json()) as T;
}

// ---------------------------------------------------------------------------
// Global dashboard
// ---------------------------------------------------------------------------

export interface GlobalIntegrityDashboardRowResponse {
  companyId: string;
  ticker: string;
  name: string;
  status: ResearchIntegrityStatusValue;
  dimensions: IntegritySnapshotDimensionsResponse;
  openIssueCount: number;
  criticalIssueCount: number;
  computedAt: string;
}

export async function fetchGlobalIntegrityDashboard(signal?: AbortSignal): Promise<GlobalIntegrityDashboardRowResponse[]> {
  const response = await fetch('/api/integrity', { signal });
  return parseOrThrow<GlobalIntegrityDashboardRowResponse[]>(response, 'Failed to load the integrity dashboard.');
}

// ---------------------------------------------------------------------------
// Company snapshot
// ---------------------------------------------------------------------------

export interface DimensionSummaryResponse {
  status: DimensionStatusValue;
  detail: string;
}

export interface IntegritySnapshotDimensionsResponse {
  marketData: DimensionSummaryResponse;
  financialStatements: DimensionSummaryResponse;
  secFilings: DimensionSummaryResponse;
  earnings: DimensionSummaryResponse;
  dcf: DimensionSummaryResponse;
  comps: DimensionSummaryResponse;
  investmentCase: DimensionSummaryResponse;
}

export interface CompanyIntegritySnapshotResponse {
  id: string;
  companyId: string;
  ticker: string;
  companyName: string;
  status: ResearchIntegrityStatusValue;
  reasons: string[];
  dimensions: IntegritySnapshotDimensionsResponse;
  openIssueCount: number;
  criticalIssueCount: number;
  computedAt: string;
}

export async function fetchCompanyIntegritySnapshot(ticker: string, options: { refresh?: boolean; signal?: AbortSignal } = {}): Promise<CompanyIntegritySnapshotResponse> {
  const query = options.refresh ? '?refresh=true' : '';
  const response = await fetch(`/api/integrity/${encodeURIComponent(ticker)}${query}`, { signal: options.signal });
  return parseOrThrow<CompanyIntegritySnapshotResponse>(response, 'Failed to load the integrity snapshot.');
}

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------

export interface IntegrityIssueResponse {
  id: string;
  companyId: string;
  category: IntegrityIssueCategoryValue;
  severity: IntegrityIssueSeverityValue;
  datasetType: IntegrityDatasetTypeValue | null;
  description: string;
  source: string;
  detail: unknown;
  dedupeKey: string;
  status: IntegrityIssueStatusValue;
  acknowledgedByUserId: string | null;
  acknowledgedAt: string | null;
  resolution: string | null;
  resolvedByUserId: string | null;
  resolvedAt: string | null;
  ignoreReason: string | null;
  detectedAt: string;
  updatedAt: string;
}

export interface IntegrityIssueFilterParams {
  status?: IntegrityIssueStatusValue;
  category?: IntegrityIssueCategoryValue;
  severity?: IntegrityIssueSeverityValue;
  datasetType?: IntegrityDatasetTypeValue;
}

export async function fetchIntegrityIssues(ticker: string, filters: IntegrityIssueFilterParams = {}, signal?: AbortSignal): Promise<IntegrityIssueResponse[]> {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.category) params.set('category', filters.category);
  if (filters.severity) params.set('severity', filters.severity);
  if (filters.datasetType) params.set('datasetType', filters.datasetType);
  const query = params.toString();
  const response = await fetch(`/api/integrity/${encodeURIComponent(ticker)}/issues${query ? `?${query}` : ''}`, { signal });
  return parseOrThrow<IntegrityIssueResponse[]>(response, 'Failed to load integrity issues.');
}

export async function acknowledgeIntegrityIssue(issueId: string): Promise<IntegrityIssueResponse> {
  const response = await fetch(`/api/integrity/issues/${encodeURIComponent(issueId)}/acknowledge`, { method: 'POST' });
  return parseOrThrow<IntegrityIssueResponse>(response, 'Failed to acknowledge the issue.');
}

export async function resolveIntegrityIssue(issueId: string, resolution: string): Promise<IntegrityIssueResponse> {
  const response = await fetch(`/api/integrity/issues/${encodeURIComponent(issueId)}/resolve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resolution }) });
  return parseOrThrow<IntegrityIssueResponse>(response, 'Failed to resolve the issue.');
}

export async function ignoreIntegrityIssue(issueId: string, reason: string): Promise<IntegrityIssueResponse> {
  const response = await fetch(`/api/integrity/issues/${encodeURIComponent(issueId)}/ignore`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) });
  return parseOrThrow<IntegrityIssueResponse>(response, 'Failed to ignore the issue.');
}

// ---------------------------------------------------------------------------
// Research claims
// ---------------------------------------------------------------------------

export interface ClaimSourceResponse {
  id: string;
  claimId: string;
  sourceType: string;
  sourceId: string | null;
  sourceLabel: string;
  sourceTier: SourceTierValue;
  createdAt: string;
}

export interface ResearchClaimResponse {
  id: string;
  companyId: string;
  claim: string;
  metric: string | null;
  statedValue: number | null;
  sourceValue: number | null;
  unit: string | null;
  claimSourceType: string;
  claimSourceId: string | null;
  dataSnapshotAt: string | null;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  validationStatus: ClaimValidationStatusValue;
  validationDetail: string | null;
  sources: ClaimSourceResponse[];
  createdAt: string;
  updatedAt: string;
}

export async function fetchResearchClaims(ticker: string, validationStatus?: ClaimValidationStatusValue, signal?: AbortSignal): Promise<ResearchClaimResponse[]> {
  const query = validationStatus ? `?validationStatus=${validationStatus}` : '';
  const response = await fetch(`/api/integrity/${encodeURIComponent(ticker)}/claims${query}`, { signal });
  return parseOrThrow<ResearchClaimResponse[]>(response, 'Failed to load research claims.');
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export interface AuditLogEntryResponse {
  id: string;
  companyId: string | null;
  entityType: string;
  entityId: string | null;
  action: AuditLogActionValue;
  actorUserId: string | null;
  detail: unknown;
  createdAt: string;
}

export async function fetchAuditLog(ticker: string, signal?: AbortSignal): Promise<AuditLogEntryResponse[]> {
  const response = await fetch(`/api/integrity/${encodeURIComponent(ticker)}/audit-log`, { signal });
  return parseOrThrow<AuditLogEntryResponse[]>(response, 'Failed to load the audit log.');
}
