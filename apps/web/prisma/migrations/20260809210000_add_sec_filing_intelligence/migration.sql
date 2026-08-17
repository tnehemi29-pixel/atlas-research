-- CreateEnum
CREATE TYPE "SecFilingType" AS ENUM ('TEN_K', 'TEN_Q', 'EIGHT_K', 'DEF_14A', 'TWENTY_F', 'OTHER');

-- CreateEnum
CREATE TYPE "FilingProcessingStatus" AS ENUM ('PENDING', 'FETCHING', 'EXTRACTING', 'COMPLETE', 'FAILED');

-- CreateEnum
CREATE TYPE "FilingSectionType" AS ENUM ('BUSINESS', 'RISK_FACTORS', 'MDA', 'LIQUIDITY', 'MARKET_RISK', 'FINANCIAL_STATEMENTS', 'LEGAL_PROCEEDINGS', 'CONTROLS_AND_PROCEDURES', 'EIGHT_K_ITEM', 'OTHER');

-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "sec_filings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "filingType" "SecFilingType" NOT NULL,
    "formType" TEXT NOT NULL,
    "filingDate" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3),
    "accessionNumber" TEXT NOT NULL,
    "primaryDocument" TEXT NOT NULL,
    "secUrl" TEXT NOT NULL,
    "description" TEXT,
    "processingStatus" "FilingProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "processingError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sec_filings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "filing_sections" (
    "id" TEXT NOT NULL,
    "filingId" TEXT NOT NULL,
    "sectionType" "FilingSectionType" NOT NULL,
    "title" TEXT NOT NULL,
    "itemCode" TEXT,
    "orderIndex" INTEGER NOT NULL,
    "anchor" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "charCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "filing_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "filing_analyses" (
    "id" TEXT NOT NULL,
    "filingId" TEXT NOT NULL,
    "status" "AnalysisStatus" NOT NULL,
    "model" TEXT NOT NULL,
    "error" TEXT,
    "summary" TEXT NOT NULL,
    "keyChanges" JSONB NOT NULL,
    "risks" JSONB NOT NULL,
    "managementCommentary" JSONB NOT NULL,
    "capitalAllocation" JSONB NOT NULL,
    "accountingChanges" JSONB NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "filing_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "filing_comparisons" (
    "id" TEXT NOT NULL,
    "filingId" TEXT NOT NULL,
    "previousFilingId" TEXT NOT NULL,
    "status" "AnalysisStatus" NOT NULL,
    "model" TEXT NOT NULL,
    "error" TEXT,
    "financialChanges" JSONB NOT NULL,
    "newRisks" JSONB NOT NULL,
    "removedRisks" JSONB NOT NULL,
    "changedLanguage" JSONB NOT NULL,
    "guidanceChanges" JSONB NOT NULL,
    "managementCommentaryChanges" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "filing_comparisons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sec_filings_companyId_filingType_filingDate_idx" ON "sec_filings"("companyId", "filingType", "filingDate");

-- CreateIndex
CREATE UNIQUE INDEX "sec_filings_companyId_accessionNumber_key" ON "sec_filings"("companyId", "accessionNumber");

-- CreateIndex
CREATE INDEX "filing_sections_filingId_sectionType_idx" ON "filing_sections"("filingId", "sectionType");

-- CreateIndex
CREATE UNIQUE INDEX "filing_analyses_filingId_key" ON "filing_analyses"("filingId");

-- CreateIndex
CREATE UNIQUE INDEX "filing_comparisons_filingId_previousFilingId_key" ON "filing_comparisons"("filingId", "previousFilingId");

-- AddForeignKey
ALTER TABLE "sec_filings" ADD CONSTRAINT "sec_filings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "filing_sections" ADD CONSTRAINT "filing_sections_filingId_fkey" FOREIGN KEY ("filingId") REFERENCES "sec_filings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "filing_analyses" ADD CONSTRAINT "filing_analyses_filingId_fkey" FOREIGN KEY ("filingId") REFERENCES "sec_filings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "filing_comparisons" ADD CONSTRAINT "filing_comparisons_filingId_fkey" FOREIGN KEY ("filingId") REFERENCES "sec_filings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "filing_comparisons" ADD CONSTRAINT "filing_comparisons_previousFilingId_fkey" FOREIGN KEY ("previousFilingId") REFERENCES "sec_filings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

