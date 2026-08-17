-- CreateEnum
CREATE TYPE "DataQualityDimension" AS ENUM ('COMPLETENESS', 'ACCURACY', 'FRESHNESS', 'CONSISTENCY', 'SOURCE_QUALITY', 'TRACEABILITY', 'TIMELINESS', 'CALCULATION_INTEGRITY');

-- CreateEnum
CREATE TYPE "FreshnessStatus" AS ENUM ('CURRENT', 'AGING', 'STALE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "SourceTier" AS ENUM ('TIER_1', 'TIER_2', 'TIER_3', 'TIER_4');

-- CreateEnum
CREATE TYPE "IntegrityDatasetType" AS ENUM ('MARKET_DATA', 'FINANCIAL_STATEMENTS', 'SEC_FILINGS', 'EARNINGS', 'DCF_MODEL', 'COMPS_MODEL', 'HISTORICAL_VALIDATION', 'RESEARCH_REPORT', 'INVESTMENT_CASE');

-- CreateEnum
CREATE TYPE "IntegrityIssueCategory" AS ENUM ('DATA_COMPLETENESS', 'DATA_FRESHNESS', 'DATA_DISCREPANCY', 'FINANCIAL_RECONCILIATION', 'MARKET_DATA_INTEGRITY', 'DCF_MODEL_ERROR', 'DCF_STALE', 'COMPS_MODEL_ERROR', 'RESEARCH_REPORT_MISMATCH', 'AI_CLAIM_REJECTED', 'RESEARCH_CONTRADICTION', 'THESIS_ASSUMPTION_CONFLICT', 'HISTORICAL_VALIDATION_LIMITATION', 'SOURCE_UNVERIFIED');

-- CreateEnum
CREATE TYPE "IntegrityIssueSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "IntegrityIssueStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'IGNORED');

-- CreateEnum
CREATE TYPE "ClaimValidationStatus" AS ENUM ('VERIFIED', 'UNVERIFIED', 'CONTRADICTED', 'STALE', 'REJECTED');

-- CreateEnum
CREATE TYPE "ResearchIntegrityStatus" AS ENUM ('VERIFIED', 'MINOR_ISSUES', 'REVIEW_REQUIRED', 'SIGNIFICANT_ISSUES', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AuditLogAction" AS ENUM ('CHECK_RUN', 'ISSUE_CREATED', 'ISSUE_ACKNOWLEDGED', 'ISSUE_RESOLVED', 'ISSUE_IGNORED', 'ISSUE_AUTO_RESOLVED', 'CLAIM_CREATED', 'CLAIM_VALIDATED', 'MODEL_AUDIT_RUN', 'SNAPSHOT_COMPUTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AlertType" ADD VALUE 'CRITICAL_INTEGRITY_ISSUE';
ALTER TYPE "AlertType" ADD VALUE 'RESEARCH_DATA_MISMATCH';
ALTER TYPE "AlertType" ADD VALUE 'DCF_MODEL_ERROR';
ALTER TYPE "AlertType" ADD VALUE 'THESIS_ASSUMPTION_CONFLICT';

-- CreateTable
CREATE TABLE "data_quality_checks" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "datasetType" "IntegrityDatasetType" NOT NULL,
    "dimension" "DataQualityDimension" NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "freshnessStatus" "FreshnessStatus",
    "detail" TEXT NOT NULL,
    "metadata" JSONB,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_quality_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_integrity_issues" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "category" "IntegrityIssueCategory" NOT NULL,
    "severity" "IntegrityIssueSeverity" NOT NULL,
    "datasetType" "IntegrityDatasetType",
    "description" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "detail" JSONB,
    "dedupeKey" TEXT NOT NULL,
    "status" "IntegrityIssueStatus" NOT NULL DEFAULT 'OPEN',
    "acknowledgedByUserId" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "resolvedByUserId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "ignoreReason" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "research_integrity_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_claims" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "claim" TEXT NOT NULL,
    "metric" TEXT,
    "statedValue" DOUBLE PRECISION,
    "sourceValue" DOUBLE PRECISION,
    "unit" TEXT,
    "claimSourceType" TEXT NOT NULL,
    "claimSourceId" TEXT,
    "dataSnapshotAt" TIMESTAMP(3),
    "confidence" "ConfidenceLevel",
    "validationStatus" "ClaimValidationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "validationDetail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "research_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claim_sources" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "sourceLabel" TEXT NOT NULL,
    "sourceTier" "SourceTier" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "claim_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_audits" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "modelType" "IntegrityDatasetType" NOT NULL,
    "methodologyVersion" TEXT NOT NULL DEFAULT '1.0',
    "passed" BOOLEAN NOT NULL,
    "findings" JSONB NOT NULL,
    "inputsSnapshot" JSONB NOT NULL,
    "auditedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log_entries" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "action" "AuditLogAction" NOT NULL,
    "actorUserId" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integrity_snapshots" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "status" "ResearchIntegrityStatus" NOT NULL,
    "reasons" JSONB NOT NULL,
    "dimensions" JSONB NOT NULL,
    "openIssueCount" INTEGER NOT NULL DEFAULT 0,
    "criticalIssueCount" INTEGER NOT NULL DEFAULT 0,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integrity_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "data_quality_checks_companyId_datasetType_dimension_checked_idx" ON "data_quality_checks"("companyId", "datasetType", "dimension", "checkedAt");

-- CreateIndex
CREATE INDEX "research_integrity_issues_companyId_status_idx" ON "research_integrity_issues"("companyId", "status");

-- CreateIndex
CREATE INDEX "research_integrity_issues_severity_status_idx" ON "research_integrity_issues"("severity", "status");

-- CreateIndex
CREATE UNIQUE INDEX "research_integrity_issues_companyId_dedupeKey_key" ON "research_integrity_issues"("companyId", "dedupeKey");

-- CreateIndex
CREATE INDEX "research_claims_companyId_validationStatus_idx" ON "research_claims"("companyId", "validationStatus");

-- CreateIndex
CREATE INDEX "research_claims_companyId_metric_idx" ON "research_claims"("companyId", "metric");

-- CreateIndex
CREATE INDEX "claim_sources_claimId_idx" ON "claim_sources"("claimId");

-- CreateIndex
CREATE INDEX "model_audits_companyId_modelType_auditedAt_idx" ON "model_audits"("companyId", "modelType", "auditedAt");

-- CreateIndex
CREATE INDEX "audit_log_entries_companyId_createdAt_idx" ON "audit_log_entries"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_log_entries_entityType_entityId_idx" ON "audit_log_entries"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "integrity_snapshots_companyId_key" ON "integrity_snapshots"("companyId");

-- AddForeignKey
ALTER TABLE "data_quality_checks" ADD CONSTRAINT "data_quality_checks_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_integrity_issues" ADD CONSTRAINT "research_integrity_issues_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_claims" ADD CONSTRAINT "research_claims_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim_sources" ADD CONSTRAINT "claim_sources_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "research_claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_audits" ADD CONSTRAINT "model_audits_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log_entries" ADD CONSTRAINT "audit_log_entries_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integrity_snapshots" ADD CONSTRAINT "integrity_snapshots_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

