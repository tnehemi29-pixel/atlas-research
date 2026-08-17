import { Prisma, type IntegrityDatasetType, type IntegrityIssueCategory, type IntegrityIssueSeverity, type IntegritySnapshot } from '@prisma/client';
import { db } from '@/lib/db';
import { runDataQualityChecks, type DataQualityCheckOutcome } from '@/lib/services/dataQualityService';
import { runDcfModelAudit, runCompsModelAudit } from '@/lib/services/modelAuditService';
import { syncIssuesFromFindings, type FindingForIssueSync } from '@/lib/services/integrityIssueService';
import { writeAuditLogEntry } from '@/lib/services/auditLogService';
import { computeIntegrityStatus, type ResearchIntegrityStatusValue } from '@/lib/integrity/integrityStatus';
import type { IntegrityFinding } from '@/lib/integrity/types';

/**
 * Milestone 14 spec sections 18-20, 29 — the top-level orchestrator: runs
 * every check/audit this milestone defines for one company, turns failing
 * results into tracked issues (via integrityIssueService's dedupe/auto-
 * resolve discipline), computes the company's overall status (via
 * integrityStatus.ts's explainable aggregation), and caches the result as
 * one upserted IntegritySnapshot row rather than recomputing on every page
 * load. `getCompanyIntegritySnapshot` serves the cached row when it's
 * recent enough and only recomputes on a cache miss or explicit refresh —
 * the same TTL-cache discipline Milestone 3's financialDataService already
 * established, applied here instead of a background job queue (which this
 * codebase has never had, by design).
 */

const DEFAULT_SNAPSHOT_MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes

export type DimensionStatusValue = 'OK' | 'NEEDS_REVIEW' | 'ERROR' | 'UNKNOWN';

export interface DimensionSummary {
  status: DimensionStatusValue;
  detail: string;
}

export interface IntegritySnapshotDimensions {
  marketData: DimensionSummary;
  financialStatements: DimensionSummary;
  secFilings: DimensionSummary;
  earnings: DimensionSummary;
  dcf: DimensionSummary;
  comps: DimensionSummary;
  investmentCase: DimensionSummary;
}

function dataQualityIssueCategory(outcome: DataQualityCheckOutcome): IntegrityIssueCategory {
  if (outcome.dimension === 'FRESHNESS') return 'DATA_FRESHNESS';
  if (outcome.dimension === 'COMPLETENESS') return 'DATA_COMPLETENESS';
  return outcome.datasetType === 'MARKET_DATA' ? 'MARKET_DATA_INTEGRITY' : 'FINANCIAL_RECONCILIATION';
}

function dataQualityIssueSeverity(outcome: DataQualityCheckOutcome): IntegrityIssueSeverity {
  if (outcome.dimension === 'FRESHNESS') return outcome.freshnessStatus === 'UNKNOWN' ? 'LOW' : 'MEDIUM';
  if (outcome.dimension === 'COMPLETENESS') return 'MEDIUM';
  return 'HIGH';
}

function dataQualityDedupeKey(outcome: DataQualityCheckOutcome): string {
  const checkName = typeof outcome.metadata?.checkName === 'string' ? outcome.metadata.checkName : outcome.detail.split(':')[0];
  return `dq:${outcome.datasetType}:${outcome.dimension}:${checkName}`;
}

function modelFindingToIssue(modelType: 'DCF_MODEL' | 'COMPS_MODEL', finding: IntegrityFinding): FindingForIssueSync {
  return {
    category: modelType === 'DCF_MODEL' ? 'DCF_MODEL_ERROR' : 'COMPS_MODEL_ERROR',
    severity: finding.severity === 'INFO' ? 'LOW' : finding.severity,
    datasetType: modelType,
    description: finding.message,
    source: modelType === 'DCF_MODEL' ? 'modelAuditService:dcf' : 'modelAuditService:comps',
    dedupeKey: `${modelType === 'DCF_MODEL' ? 'dcf' : 'comps'}:${finding.check}`,
    passed: finding.passed,
  };
}

function dimensionFromOutcomes(datasetType: IntegrityDatasetType, outcomes: DataQualityCheckOutcome[]): DimensionSummary {
  const relevant = outcomes.filter((o) => o.datasetType === datasetType);
  if (relevant.length === 0) return { status: 'UNKNOWN', detail: 'No checks have been run for this dataset yet.' };

  const failing = relevant.filter((o) => !o.passed);
  if (failing.length === 0) return { status: 'OK', detail: relevant.map((o) => o.detail).join(' ') };

  const hasHighSeverity = failing.some((o) => o.dimension === 'CALCULATION_INTEGRITY');
  return { status: hasHighSeverity ? 'ERROR' : 'NEEDS_REVIEW', detail: failing.map((o) => o.detail).join(' ') };
}

function dimensionFromModelFindings(findings: IntegrityFinding[] | null): DimensionSummary {
  if (findings === null) return { status: 'UNKNOWN', detail: 'Not enough data was available to audit this model.' };
  const failing = findings.filter((f) => !f.passed);
  if (failing.length === 0) return { status: 'OK', detail: 'No issues detected.' };
  const hasCriticalOrHigh = failing.some((f) => f.severity === 'CRITICAL' || f.severity === 'HIGH');
  return { status: hasCriticalOrHigh ? 'ERROR' : 'NEEDS_REVIEW', detail: failing.map((f) => f.message).join(' ') };
}

export interface ComputeSnapshotResult {
  status: ResearchIntegrityStatusValue;
  reasons: string[];
  dimensions: IntegritySnapshotDimensions;
  openIssueCount: number;
  criticalIssueCount: number;
}

export async function computeIntegritySnapshot(companyId: string): Promise<ComputeSnapshotResult> {
  const [dataQualityOutcomes, dcfAudit, compsAudit, investmentCaseCount] = await Promise.all([
    runDataQualityChecks(companyId),
    runDcfModelAudit(companyId),
    runCompsModelAudit(companyId),
    db.investmentCase.count({ where: { companyId } }),
  ]);

  const findings: FindingForIssueSync[] = [
    ...dataQualityOutcomes.map((o): FindingForIssueSync => ({
      category: dataQualityIssueCategory(o),
      severity: dataQualityIssueSeverity(o),
      datasetType: o.datasetType,
      description: o.detail,
      source: 'dataQualityService',
      dedupeKey: dataQualityDedupeKey(o),
      passed: o.passed,
    })),
    ...(dcfAudit?.findings.map((f) => modelFindingToIssue('DCF_MODEL', f)) ?? []),
    ...(compsAudit?.findings.map((f) => modelFindingToIssue('COMPS_MODEL', f)) ?? []),
  ];

  await syncIssuesFromFindings(companyId, findings);

  const [openIssues, criticalIssues] = await Promise.all([
    db.researchIntegrityIssue.count({ where: { companyId, status: { in: ['OPEN', 'ACKNOWLEDGED'] } } }),
    db.researchIntegrityIssue.count({ where: { companyId, status: { in: ['OPEN', 'ACKNOWLEDGED'] }, severity: 'CRITICAL' } }),
  ]);

  const openFindingsBySeverity = findings.filter((f) => !f.passed);
  const statusInput = {
    criticalFindingCount: openFindingsBySeverity.filter((f) => f.severity === 'CRITICAL').length,
    highFindingCount: openFindingsBySeverity.filter((f) => f.severity === 'HIGH').length,
    mediumFindingCount: openFindingsBySeverity.filter((f) => f.severity === 'MEDIUM').length,
    lowFindingCount: openFindingsBySeverity.filter((f) => f.severity === 'LOW').length,
    staleDatasetCount: dataQualityOutcomes.filter((o) => o.dimension === 'FRESHNESS' && o.freshnessStatus === 'STALE').length,
  };
  const { status, reasons } = computeIntegrityStatus(statusInput);

  const dimensions: IntegritySnapshotDimensions = {
    marketData: dimensionFromOutcomes('MARKET_DATA', dataQualityOutcomes),
    financialStatements: dimensionFromOutcomes('FINANCIAL_STATEMENTS', dataQualityOutcomes),
    secFilings: dimensionFromOutcomes('SEC_FILINGS', dataQualityOutcomes),
    earnings: dimensionFromOutcomes('EARNINGS', dataQualityOutcomes),
    dcf: dimensionFromModelFindings(dcfAudit?.findings ?? null),
    comps: dimensionFromModelFindings(compsAudit?.findings ?? null),
    investmentCase:
      investmentCaseCount > 0
        ? { status: 'OK', detail: `${investmentCaseCount} investment case(s) tracked for this company. Thesis-vs-guidance conflicts are checked per-case by each case's own owner.` }
        : { status: 'UNKNOWN', detail: 'No investment case has been created for this company yet.' },
  };

  await db.integritySnapshot.upsert({
    where: { companyId },
    create: { companyId, status, reasons: reasons as unknown as Prisma.InputJsonValue, dimensions: dimensions as unknown as Prisma.InputJsonValue, openIssueCount: openIssues, criticalIssueCount: criticalIssues },
    update: { status, reasons: reasons as unknown as Prisma.InputJsonValue, dimensions: dimensions as unknown as Prisma.InputJsonValue, openIssueCount: openIssues, criticalIssueCount: criticalIssues, computedAt: new Date() },
  });

  await writeAuditLogEntry({ companyId, entityType: 'IntegritySnapshot', action: 'SNAPSHOT_COMPUTED', detail: { status, openIssueCount: openIssues, criticalIssueCount: criticalIssues } });

  return { status, reasons, dimensions, openIssueCount: openIssues, criticalIssueCount: criticalIssues };
}

/** Serves the cached snapshot when it's recent enough; recomputes on a
 * cache miss or when the cached row is older than `maxAgeMs`. This is the
 * "incremental, don't recompute the whole research stack on every page
 * load" discipline spec section 29 asks for — there is no background job
 * queue in this codebase (by design, matching every prior milestone), so
 * "incremental" here means TTL-cached-and-recomputed-on-demand, not
 * continuously re-evaluated. */
export type IntegritySnapshotWithParsedJson = Omit<IntegritySnapshot, 'dimensions' | 'reasons'> & { dimensions: IntegritySnapshotDimensions; reasons: string[] };

export async function getCompanyIntegritySnapshot(companyId: string, options: { maxAgeMs?: number; forceRefresh?: boolean } = {}): Promise<IntegritySnapshotWithParsedJson> {
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_SNAPSHOT_MAX_AGE_MS;

  if (!options.forceRefresh) {
    const existing = await db.integritySnapshot.findUnique({ where: { companyId } });
    if (existing && Date.now() - existing.computedAt.getTime() < maxAgeMs) {
      return { ...existing, dimensions: existing.dimensions as unknown as IntegritySnapshotDimensions, reasons: existing.reasons as unknown as string[] };
    }
  }

  await computeIntegritySnapshot(companyId);
  const fresh = await db.integritySnapshot.findUniqueOrThrow({ where: { companyId } });
  return { ...fresh, dimensions: fresh.dimensions as unknown as IntegritySnapshotDimensions, reasons: fresh.reasons as unknown as string[] };
}

export interface GlobalIntegrityDashboardRow {
  companyId: string;
  ticker: string;
  name: string;
  status: ResearchIntegrityStatusValue;
  dimensions: IntegritySnapshotDimensions;
  openIssueCount: number;
  criticalIssueCount: number;
  computedAt: Date;
}

/** Reads only ALREADY-COMPUTED snapshots — the global dashboard never
 * triggers a full recompute of every company in Atlas on load (spec
 * section 29's own "do not fully recompute every company's entire research
 * stack every time a user opens the dashboard"). A company only appears
 * here once its own page (or an explicit refresh) has computed a snapshot
 * for it at least once. Includes each company's per-dimension breakdown so
 * the dashboard UI (spec section 20) can filter by category (Data/DCF/
 * Comps/SEC/Earnings/Investment Cases) without a separate query per
 * category — there are few enough companies with a computed snapshot that
 * filtering this list client-side is simpler than a server-side query for
 * each category. */
export async function getGlobalIntegrityDashboard(): Promise<GlobalIntegrityDashboardRow[]> {
  const snapshots = await db.integritySnapshot.findMany({
    include: { company: { select: { ticker: true, name: true } } },
    orderBy: [{ status: 'desc' }, { computedAt: 'desc' }],
  });

  return snapshots.map((s) => ({
    companyId: s.companyId,
    ticker: s.company.ticker,
    name: s.company.name,
    status: s.status as ResearchIntegrityStatusValue,
    dimensions: s.dimensions as unknown as IntegritySnapshotDimensions,
    openIssueCount: s.openIssueCount,
    criticalIssueCount: s.criticalIssueCount,
    computedAt: s.computedAt,
  }));
}
