-- CreateEnum
CREATE TYPE "CallProcessingStatus" AS ENUM ('PENDING', 'FETCHING', 'PARSING', 'COMPLETE', 'FAILED', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "TranscriptSectionType" AS ENUM ('OPENING_REMARKS', 'PREPARED_REMARKS', 'QA', 'OTHER');

-- CreateEnum
CREATE TYPE "SpeakerType" AS ENUM ('EXECUTIVE', 'ANALYST', 'OPERATOR', 'OTHER');

-- CreateEnum
CREATE TYPE "GuidanceMetric" AS ENUM ('REVENUE', 'EPS', 'GROSS_MARGIN', 'OPERATING_MARGIN', 'CAPEX', 'OPEX', 'FREE_CASH_FLOW', 'SEGMENT_REVENUE', 'OTHER');

-- CreateEnum
CREATE TYPE "GuidanceChangeType" AS ENUM ('INCREASED', 'DECREASED', 'MAINTAINED', 'NEW');

-- CreateEnum
CREATE TYPE "LanguageChangeType" AS ENUM ('NEW_TOPIC', 'CHANGED_EMPHASIS', 'SIMILAR_COMMENTARY');

-- CreateTable
CREATE TABLE "earnings_calls" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "fiscalQuarter" INTEGER NOT NULL,
    "periodEndDate" TIMESTAMP(3),
    "callDate" TIMESTAMP(3),
    "provider" TEXT NOT NULL,
    "providerTranscriptId" TEXT,
    "processingStatus" "CallProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "processingError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "earnings_calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transcripts" (
    "id" TEXT NOT NULL,
    "earningsCallId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "rawContent" TEXT NOT NULL,
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transcripts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transcript_segments" (
    "id" TEXT NOT NULL,
    "transcriptId" TEXT NOT NULL,
    "section" "TranscriptSectionType" NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "speakerName" TEXT,
    "speakerRole" TEXT,
    "speakerType" "SpeakerType" NOT NULL,
    "text" TEXT NOT NULL,
    "anchor" TEXT NOT NULL,

    CONSTRAINT "transcript_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "earnings_analyses" (
    "id" TEXT NOT NULL,
    "earningsCallId" TEXT NOT NULL,
    "status" "AnalysisStatus" NOT NULL,
    "model" TEXT NOT NULL,
    "error" TEXT,
    "summary" TEXT NOT NULL,
    "businessTrends" JSONB NOT NULL,
    "managementCommentary" JSONB NOT NULL,
    "risks" JSONB NOT NULL,
    "capitalAllocation" JSONB NOT NULL,
    "analystTopics" JSONB NOT NULL,
    "managementLanguage" JSONB NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "earnings_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guidance_observations" (
    "id" TEXT NOT NULL,
    "earningsCallId" TEXT NOT NULL,
    "metric" "GuidanceMetric" NOT NULL,
    "metricLabel" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "low" DOUBLE PRECISION,
    "high" DOUBLE PRECISION,
    "midpoint" DOUBLE PRECISION,
    "priorLow" DOUBLE PRECISION,
    "priorHigh" DOUBLE PRECISION,
    "priorMidpoint" DOUBLE PRECISION,
    "change" "GuidanceChangeType" NOT NULL,
    "sourceExcerpt" TEXT NOT NULL,
    "sourceAnchor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guidance_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "earnings_comparisons" (
    "id" TEXT NOT NULL,
    "earningsCallId" TEXT NOT NULL,
    "previousEarningsCallId" TEXT NOT NULL,
    "status" "AnalysisStatus" NOT NULL,
    "model" TEXT NOT NULL,
    "error" TEXT,
    "financialChanges" JSONB NOT NULL,
    "languageChanges" JSONB NOT NULL,
    "toneComparison" JSONB NOT NULL,
    "guidanceSummary" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "earnings_comparisons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "earnings_filing_comparisons" (
    "id" TEXT NOT NULL,
    "earningsCallId" TEXT NOT NULL,
    "secFilingId" TEXT NOT NULL,
    "status" "AnalysisStatus" NOT NULL,
    "model" TEXT NOT NULL,
    "error" TEXT,
    "alignments" JSONB NOT NULL,
    "newInCall" JSONB NOT NULL,
    "onlyInFiling" JSONB NOT NULL,
    "riskEmphasisDifferences" JSONB NOT NULL,
    "guidanceDifferences" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "earnings_filing_comparisons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "earnings_calls_companyId_fiscalYear_fiscalQuarter_idx" ON "earnings_calls"("companyId", "fiscalYear", "fiscalQuarter");

-- CreateIndex
CREATE UNIQUE INDEX "earnings_calls_companyId_fiscalYear_fiscalQuarter_key" ON "earnings_calls"("companyId", "fiscalYear", "fiscalQuarter");

-- CreateIndex
CREATE UNIQUE INDEX "transcripts_earningsCallId_key" ON "transcripts"("earningsCallId");

-- CreateIndex
CREATE INDEX "transcript_segments_transcriptId_section_idx" ON "transcript_segments"("transcriptId", "section");

-- CreateIndex
CREATE UNIQUE INDEX "earnings_analyses_earningsCallId_key" ON "earnings_analyses"("earningsCallId");

-- CreateIndex
CREATE INDEX "guidance_observations_earningsCallId_metric_idx" ON "guidance_observations"("earningsCallId", "metric");

-- CreateIndex
CREATE UNIQUE INDEX "earnings_comparisons_earningsCallId_previousEarningsCallId_key" ON "earnings_comparisons"("earningsCallId", "previousEarningsCallId");

-- CreateIndex
CREATE UNIQUE INDEX "earnings_filing_comparisons_earningsCallId_secFilingId_key" ON "earnings_filing_comparisons"("earningsCallId", "secFilingId");

-- AddForeignKey
ALTER TABLE "earnings_calls" ADD CONSTRAINT "earnings_calls_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_earningsCallId_fkey" FOREIGN KEY ("earningsCallId") REFERENCES "earnings_calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_transcriptId_fkey" FOREIGN KEY ("transcriptId") REFERENCES "transcripts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "earnings_analyses" ADD CONSTRAINT "earnings_analyses_earningsCallId_fkey" FOREIGN KEY ("earningsCallId") REFERENCES "earnings_calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guidance_observations" ADD CONSTRAINT "guidance_observations_earningsCallId_fkey" FOREIGN KEY ("earningsCallId") REFERENCES "earnings_calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "earnings_comparisons" ADD CONSTRAINT "earnings_comparisons_earningsCallId_fkey" FOREIGN KEY ("earningsCallId") REFERENCES "earnings_calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "earnings_comparisons" ADD CONSTRAINT "earnings_comparisons_previousEarningsCallId_fkey" FOREIGN KEY ("previousEarningsCallId") REFERENCES "earnings_calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "earnings_filing_comparisons" ADD CONSTRAINT "earnings_filing_comparisons_earningsCallId_fkey" FOREIGN KEY ("earningsCallId") REFERENCES "earnings_calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "earnings_filing_comparisons" ADD CONSTRAINT "earnings_filing_comparisons_secFilingId_fkey" FOREIGN KEY ("secFilingId") REFERENCES "sec_filings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
