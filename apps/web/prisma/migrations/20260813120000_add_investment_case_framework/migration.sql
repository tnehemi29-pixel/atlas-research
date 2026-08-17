-- CreateEnum
CREATE TYPE "InvestmentCaseStatus" AS ENUM ('RESEARCHING', 'WATCHLIST', 'ACTIVE_THESIS', 'UNDER_REVIEW', 'THESIS_CHALLENGED', 'THESIS_INVALIDATED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "InvestmentScenario" AS ENUM ('BULL', 'BASE', 'BEAR');

-- CreateEnum
CREATE TYPE "InvestmentAssumptionMetric" AS ENUM ('REVENUE_GROWTH', 'REVENUE_CAGR', 'OPERATING_MARGIN', 'FCF_MARGIN', 'WACC', 'TERMINAL_GROWTH', 'EXIT_MULTIPLE', 'EPS_GROWTH', 'DEBT', 'SHARE_COUNT');

-- CreateEnum
CREATE TYPE "ContentOrigin" AS ENUM ('USER', 'AI');

-- CreateEnum
CREATE TYPE "EvidenceDirection" AS ENUM ('SUPPORTS', 'CONTRADICTS', 'NEUTRAL');

-- CreateEnum
CREATE TYPE "EvidenceSourceType" AS ENUM ('TEN_K', 'TEN_Q', 'EIGHT_K', 'EARNINGS_CALL', 'FINANCIAL_STATEMENT', 'DCF', 'COMPS', 'HISTORICAL_VALIDATION', 'RESEARCH_EVENT');

-- CreateEnum
CREATE TYPE "CatalystStatus" AS ENUM ('UPCOMING', 'IN_PROGRESS', 'OCCURRED', 'FAILED', 'UNCERTAIN');

-- CreateEnum
CREATE TYPE "RiskStatus" AS ENUM ('MONITORING', 'ESCALATING', 'MITIGATED', 'REALIZED');

-- CreateEnum
CREATE TYPE "InvalidationComparator" AS ENUM ('LESS_THAN', 'LESS_THAN_OR_EQUAL', 'GREATER_THAN', 'GREATER_THAN_OR_EQUAL');

-- CreateEnum
CREATE TYPE "InvalidationCriterionStatus" AS ENUM ('ACTIVE', 'POTENTIALLY_MET', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ReviewType" AS ENUM ('QUARTERLY', 'AD_HOC');

-- CreateEnum
CREATE TYPE "ReviewOutcome" AS ENUM ('THESIS_VALID', 'NEEDS_MODIFICATION', 'INVALIDATED', 'CONTINUE_MONITORING');

-- CreateTable
CREATE TABLE "investment_cases" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "horizon" TEXT NOT NULL,
    "status" "InvestmentCaseStatus" NOT NULL DEFAULT 'RESEARCHING',
    "coreThesis" TEXT NOT NULL,
    "keyDrivers" TEXT[],
    "bullSummary" TEXT,
    "baseSummary" TEXT,
    "bearSummary" TEXT,
    "strengthenIndicators" TEXT[],
    "weakenIndicators" TEXT[],
    "invalidateIndicators" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "investment_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investment_case_assumptions" (
    "id" TEXT NOT NULL,
    "investmentCaseId" TEXT NOT NULL,
    "metric" "InvestmentAssumptionMetric" NOT NULL,
    "scenario" "InvestmentScenario" NOT NULL DEFAULT 'BASE',
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "asOfDate" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "model" TEXT,
    "confidence" "ConfidenceLevel" NOT NULL DEFAULT 'MEDIUM',
    "origin" "ContentOrigin" NOT NULL DEFAULT 'USER',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "investment_case_assumptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investment_case_evidence" (
    "id" TEXT NOT NULL,
    "investmentCaseId" TEXT NOT NULL,
    "claim" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "category" TEXT NOT NULL,
    "direction" "EvidenceDirection" NOT NULL,
    "strength" "ConfidenceLevel" NOT NULL,
    "sourceType" "EvidenceSourceType" NOT NULL,
    "sourceLabel" TEXT NOT NULL,
    "secFilingId" TEXT,
    "earningsCallId" TEXT,
    "researchEventId" TEXT,
    "origin" "ContentOrigin" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "investment_case_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investment_case_risks" (
    "id" TEXT NOT NULL,
    "investmentCaseId" TEXT NOT NULL,
    "risk" TEXT NOT NULL,
    "probability" "ConfidenceLevel",
    "impact" "ConfidenceLevel" NOT NULL,
    "evidence" TEXT,
    "status" "RiskStatus" NOT NULL DEFAULT 'MONITORING',
    "mitigation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "investment_case_risks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investment_case_catalysts" (
    "id" TEXT NOT NULL,
    "investmentCaseId" TEXT NOT NULL,
    "catalyst" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "evidence" TEXT,
    "potentialImpact" "ConfidenceLevel" NOT NULL,
    "status" "CatalystStatus" NOT NULL DEFAULT 'UPCOMING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "investment_case_catalysts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investment_case_invalidation_criteria" (
    "id" TEXT NOT NULL,
    "investmentCaseId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "metric" "InvestmentAssumptionMetric",
    "comparator" "InvalidationComparator",
    "thresholdValue" DOUBLE PRECISION,
    "thresholdUnit" TEXT,
    "consecutivePeriods" INTEGER,
    "status" "InvalidationCriterionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "investment_case_invalidation_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investment_case_reviews" (
    "id" TEXT NOT NULL,
    "investmentCaseId" TEXT NOT NULL,
    "type" "ReviewType" NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "summary" JSONB NOT NULL,
    "outcome" "ReviewOutcome",
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "investment_case_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investment_case_versions" (
    "id" TEXT NOT NULL,
    "investmentCaseId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "investment_case_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investment_memos" (
    "id" TEXT NOT NULL,
    "investmentCaseId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "status" "AnalysisStatus" NOT NULL,
    "model" TEXT,
    "error" TEXT,
    "content" JSONB,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "investment_memos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "investment_cases_userId_status_idx" ON "investment_cases"("userId", "status");

-- CreateIndex
CREATE INDEX "investment_cases_userId_companyId_idx" ON "investment_cases"("userId", "companyId");

-- CreateIndex
CREATE INDEX "investment_case_assumptions_investmentCaseId_idx" ON "investment_case_assumptions"("investmentCaseId");

-- CreateIndex
CREATE UNIQUE INDEX "investment_case_assumptions_investmentCaseId_metric_scenari_key" ON "investment_case_assumptions"("investmentCaseId", "metric", "scenario");

-- CreateIndex
CREATE INDEX "investment_case_evidence_investmentCaseId_direction_idx" ON "investment_case_evidence"("investmentCaseId", "direction");

-- CreateIndex
CREATE INDEX "investment_case_risks_investmentCaseId_idx" ON "investment_case_risks"("investmentCaseId");

-- CreateIndex
CREATE INDEX "investment_case_catalysts_investmentCaseId_idx" ON "investment_case_catalysts"("investmentCaseId");

-- CreateIndex
CREATE INDEX "investment_case_invalidation_criteria_investmentCaseId_idx" ON "investment_case_invalidation_criteria"("investmentCaseId");

-- CreateIndex
CREATE INDEX "investment_case_reviews_investmentCaseId_reviewedAt_idx" ON "investment_case_reviews"("investmentCaseId", "reviewedAt");

-- CreateIndex
CREATE INDEX "investment_case_versions_investmentCaseId_idx" ON "investment_case_versions"("investmentCaseId");

-- CreateIndex
CREATE UNIQUE INDEX "investment_case_versions_investmentCaseId_version_key" ON "investment_case_versions"("investmentCaseId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "investment_memos_versionId_key" ON "investment_memos"("versionId");

-- CreateIndex
CREATE INDEX "investment_memos_investmentCaseId_createdAt_idx" ON "investment_memos"("investmentCaseId", "createdAt");

-- AddForeignKey
ALTER TABLE "investment_cases" ADD CONSTRAINT "investment_cases_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_cases" ADD CONSTRAINT "investment_cases_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_case_assumptions" ADD CONSTRAINT "investment_case_assumptions_investmentCaseId_fkey" FOREIGN KEY ("investmentCaseId") REFERENCES "investment_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_case_evidence" ADD CONSTRAINT "investment_case_evidence_investmentCaseId_fkey" FOREIGN KEY ("investmentCaseId") REFERENCES "investment_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_case_evidence" ADD CONSTRAINT "investment_case_evidence_secFilingId_fkey" FOREIGN KEY ("secFilingId") REFERENCES "sec_filings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_case_evidence" ADD CONSTRAINT "investment_case_evidence_earningsCallId_fkey" FOREIGN KEY ("earningsCallId") REFERENCES "earnings_calls"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_case_evidence" ADD CONSTRAINT "investment_case_evidence_researchEventId_fkey" FOREIGN KEY ("researchEventId") REFERENCES "research_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_case_risks" ADD CONSTRAINT "investment_case_risks_investmentCaseId_fkey" FOREIGN KEY ("investmentCaseId") REFERENCES "investment_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_case_catalysts" ADD CONSTRAINT "investment_case_catalysts_investmentCaseId_fkey" FOREIGN KEY ("investmentCaseId") REFERENCES "investment_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_case_invalidation_criteria" ADD CONSTRAINT "investment_case_invalidation_criteria_investmentCaseId_fkey" FOREIGN KEY ("investmentCaseId") REFERENCES "investment_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_case_reviews" ADD CONSTRAINT "investment_case_reviews_investmentCaseId_fkey" FOREIGN KEY ("investmentCaseId") REFERENCES "investment_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_case_versions" ADD CONSTRAINT "investment_case_versions_investmentCaseId_fkey" FOREIGN KEY ("investmentCaseId") REFERENCES "investment_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_memos" ADD CONSTRAINT "investment_memos_investmentCaseId_fkey" FOREIGN KEY ("investmentCaseId") REFERENCES "investment_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_memos" ADD CONSTRAINT "investment_memos_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "investment_case_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

