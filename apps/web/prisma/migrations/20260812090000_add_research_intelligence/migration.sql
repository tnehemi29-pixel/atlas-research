-- CreateEnum
CREATE TYPE "ResearchEventCategory" AS ENUM ('SEC_FILING', 'EARNINGS', 'FINANCIAL', 'VALUATION', 'CORPORATE_EVENT');

-- CreateEnum
CREATE TYPE "ResearchEventType" AS ENUM ('NEW_FILING', 'FINANCIAL_CHANGE', 'MARGIN_CHANGE', 'GUIDANCE_CHANGE', 'DCF_VALUATION_CHANGE', 'COMPS_VALUATION_CHANGE', 'NEW_RESEARCH_REPORT', 'RESEARCH_REPORT_UPDATED', 'NEW_RISK', 'CORPORATE_EVENT', 'EARNINGS_CALL');

-- CreateEnum
CREATE TYPE "MaterialityLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ConfidenceLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "ResearchArea" AS ENUM ('FINANCIALS', 'GROWTH', 'MARGINS', 'DCF', 'COMPS', 'RISKS', 'CATALYSTS', 'MANAGEMENT', 'CAPITAL_ALLOCATION', 'INVESTMENT_THESIS');

-- CreateEnum
CREATE TYPE "ResearchEventSourceType" AS ENUM ('SEC_FILING', 'EARNINGS_CALL', 'FINANCIAL_DATA', 'VALUATION', 'RESEARCH_REPORT');

-- CreateEnum
CREATE TYPE "AssumptionKey" AS ENUM ('REVENUE_CAGR', 'OPERATING_MARGIN', 'FCF_MARGIN', 'WACC', 'TERMINAL_GROWTH', 'EXIT_MULTIPLE', 'REVENUE_GUIDANCE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AlertType" ADD VALUE 'HIGH_IMPORTANCE_RESEARCH_EVENT';
ALTER TYPE "AlertType" ADD VALUE 'CRITICAL_RESEARCH_EVENT';
ALTER TYPE "AlertType" ADD VALUE 'NEW_MATERIAL_RISK';

-- CreateTable
CREATE TABLE "research_events" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "category" "ResearchEventCategory" NOT NULL,
    "type" "ResearchEventType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "materiality" "MaterialityLevel" NOT NULL,
    "confidence" "ConfidenceLevel" NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "eventDate" TIMESTAMP(3) NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aiStatus" "AnalysisStatus",
    "aiModel" TEXT,
    "aiSummary" TEXT,
    "aiWhyItMatters" TEXT,
    "aiQuestionsToInvestigate" JSONB,
    "aiConfidence" "ConfidenceLevel",
    "aiError" TEXT,
    "aiInputTokens" INTEGER,
    "aiOutputTokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "research_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_event_sources" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" "ResearchEventSourceType" NOT NULL,
    "label" TEXT NOT NULL,
    "secFilingId" TEXT,
    "earningsCallId" TEXT,
    "researchReportId" TEXT,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "research_event_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_event_changes" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "previousValue" DOUBLE PRECISION,
    "currentValue" DOUBLE PRECISION,
    "changeAbsolute" DOUBLE PRECISION,
    "changePercent" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "research_event_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_event_impacts" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "area" "ResearchArea" NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "research_event_impacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_research_event_states" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_research_event_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "thesis_assumptions" (
    "id" TEXT NOT NULL,
    "researchReportId" TEXT NOT NULL,
    "key" "AssumptionKey" NOT NULL,
    "label" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "extractedFrom" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "thesis_assumptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assumption_comparisons" (
    "id" TEXT NOT NULL,
    "assumptionId" TEXT NOT NULL,
    "researchEventId" TEXT,
    "newValue" DOUBLE PRECISION NOT NULL,
    "previousValue" DOUBLE PRECISION NOT NULL,
    "differenceAbsolute" DOUBLE PRECISION NOT NULL,
    "differencePercent" DOUBLE PRECISION,
    "flagged" BOOLEAN NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assumption_comparisons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "research_events_companyId_eventDate_idx" ON "research_events"("companyId", "eventDate");

-- CreateIndex
CREATE INDEX "research_events_materiality_idx" ON "research_events"("materiality");

-- CreateIndex
CREATE UNIQUE INDEX "research_events_companyId_dedupeKey_key" ON "research_events"("companyId", "dedupeKey");

-- CreateIndex
CREATE INDEX "research_event_sources_eventId_idx" ON "research_event_sources"("eventId");

-- CreateIndex
CREATE INDEX "research_event_changes_eventId_idx" ON "research_event_changes"("eventId");

-- CreateIndex
CREATE INDEX "research_event_impacts_eventId_idx" ON "research_event_impacts"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "research_event_impacts_eventId_area_key" ON "research_event_impacts"("eventId", "area");

-- CreateIndex
CREATE INDEX "user_research_event_states_userId_idx" ON "user_research_event_states"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_research_event_states_userId_eventId_key" ON "user_research_event_states"("userId", "eventId");

-- CreateIndex
CREATE INDEX "thesis_assumptions_researchReportId_idx" ON "thesis_assumptions"("researchReportId");

-- CreateIndex
CREATE UNIQUE INDEX "thesis_assumptions_researchReportId_key_key" ON "thesis_assumptions"("researchReportId", "key");

-- CreateIndex
CREATE INDEX "assumption_comparisons_assumptionId_idx" ON "assumption_comparisons"("assumptionId");

-- AddForeignKey
ALTER TABLE "research_events" ADD CONSTRAINT "research_events_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_event_sources" ADD CONSTRAINT "research_event_sources_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "research_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_event_sources" ADD CONSTRAINT "research_event_sources_secFilingId_fkey" FOREIGN KEY ("secFilingId") REFERENCES "sec_filings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_event_sources" ADD CONSTRAINT "research_event_sources_earningsCallId_fkey" FOREIGN KEY ("earningsCallId") REFERENCES "earnings_calls"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_event_sources" ADD CONSTRAINT "research_event_sources_researchReportId_fkey" FOREIGN KEY ("researchReportId") REFERENCES "research_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_event_changes" ADD CONSTRAINT "research_event_changes_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "research_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_event_impacts" ADD CONSTRAINT "research_event_impacts_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "research_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_research_event_states" ADD CONSTRAINT "user_research_event_states_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_research_event_states" ADD CONSTRAINT "user_research_event_states_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "research_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thesis_assumptions" ADD CONSTRAINT "thesis_assumptions_researchReportId_fkey" FOREIGN KEY ("researchReportId") REFERENCES "research_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assumption_comparisons" ADD CONSTRAINT "assumption_comparisons_assumptionId_fkey" FOREIGN KEY ("assumptionId") REFERENCES "thesis_assumptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assumption_comparisons" ADD CONSTRAINT "assumption_comparisons_researchEventId_fkey" FOREIGN KEY ("researchEventId") REFERENCES "research_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

