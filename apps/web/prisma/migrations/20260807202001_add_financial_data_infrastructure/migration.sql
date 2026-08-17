-- CreateEnum
CREATE TYPE "FiscalPeriod" AS ENUM ('FY', 'Q1', 'Q2', 'Q3', 'Q4');

-- CreateEnum
CREATE TYPE "PeriodType" AS ENUM ('ANNUAL', 'QUARTERLY');

-- CreateEnum
CREATE TYPE "RefreshStatus" AS ENUM ('SUCCESS', 'PARTIAL', 'FAILED');

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "cik" TEXT,
ADD COLUMN     "financialsSyncedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "financial_periods" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "fiscalPeriod" "FiscalPeriod" NOT NULL,
    "periodType" "PeriodType" NOT NULL,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "filingType" TEXT,
    "filingDate" TIMESTAMP(3),
    "accessionNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "income_statements" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "revenue" DOUBLE PRECISION,
    "costOfRevenue" DOUBLE PRECISION,
    "grossProfit" DOUBLE PRECISION,
    "operatingExpenses" DOUBLE PRECISION,
    "operatingIncome" DOUBLE PRECISION,
    "interestExpense" DOUBLE PRECISION,
    "pretaxIncome" DOUBLE PRECISION,
    "incomeTax" DOUBLE PRECISION,
    "netIncome" DOUBLE PRECISION,
    "eps" DOUBLE PRECISION,
    "dilutedEps" DOUBLE PRECISION,
    "sharesOutstanding" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "income_statements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "balance_sheets" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "cashAndEquivalents" DOUBLE PRECISION,
    "shortTermInvestments" DOUBLE PRECISION,
    "accountsReceivable" DOUBLE PRECISION,
    "inventory" DOUBLE PRECISION,
    "totalCurrentAssets" DOUBLE PRECISION,
    "ppe" DOUBLE PRECISION,
    "goodwill" DOUBLE PRECISION,
    "intangibleAssets" DOUBLE PRECISION,
    "totalAssets" DOUBLE PRECISION,
    "accountsPayable" DOUBLE PRECISION,
    "shortTermDebt" DOUBLE PRECISION,
    "longTermDebt" DOUBLE PRECISION,
    "totalCurrentLiabilities" DOUBLE PRECISION,
    "totalLiabilities" DOUBLE PRECISION,
    "stockholdersEquity" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "balance_sheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_flow_statements" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "operatingCashFlow" DOUBLE PRECISION,
    "capex" DOUBLE PRECISION,
    "investingCashFlow" DOUBLE PRECISION,
    "financingCashFlow" DOUBLE PRECISION,
    "freeCashFlow" DOUBLE PRECISION,
    "depreciationAmortization" DOUBLE PRECISION,
    "stockBasedCompensation" DOUBLE PRECISION,
    "changeInWorkingCapital" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_flow_statements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_financial_facts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "periodId" TEXT,
    "standardizedField" TEXT NOT NULL,
    "statementType" TEXT NOT NULL,
    "xbrlConcept" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "fiscalYear" INTEGER,
    "fiscalPeriod" TEXT,
    "form" TEXT,
    "filedDate" TIMESTAMP(3),
    "accessionNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_financial_facts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_data_refresh_logs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'SEC_EDGAR',
    "status" "RefreshStatus" NOT NULL,
    "periodsFound" INTEGER NOT NULL DEFAULT 0,
    "warnings" JSONB,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "financial_data_refresh_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "financial_periods_companyId_periodType_fiscalYear_idx" ON "financial_periods"("companyId", "periodType", "fiscalYear");

-- CreateIndex
CREATE UNIQUE INDEX "financial_periods_companyId_fiscalYear_fiscalPeriod_key" ON "financial_periods"("companyId", "fiscalYear", "fiscalPeriod");

-- CreateIndex
CREATE UNIQUE INDEX "income_statements_periodId_key" ON "income_statements"("periodId");

-- CreateIndex
CREATE UNIQUE INDEX "balance_sheets_periodId_key" ON "balance_sheets"("periodId");

-- CreateIndex
CREATE UNIQUE INDEX "cash_flow_statements_periodId_key" ON "cash_flow_statements"("periodId");

-- CreateIndex
CREATE INDEX "raw_financial_facts_companyId_xbrlConcept_idx" ON "raw_financial_facts"("companyId", "xbrlConcept");

-- CreateIndex
CREATE INDEX "raw_financial_facts_periodId_idx" ON "raw_financial_facts"("periodId");

-- CreateIndex
CREATE INDEX "financial_data_refresh_logs_companyId_startedAt_idx" ON "financial_data_refresh_logs"("companyId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "companies_cik_key" ON "companies"("cik");

-- AddForeignKey
ALTER TABLE "financial_periods" ADD CONSTRAINT "financial_periods_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "income_statements" ADD CONSTRAINT "income_statements_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "financial_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "balance_sheets" ADD CONSTRAINT "balance_sheets_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "financial_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_flow_statements" ADD CONSTRAINT "cash_flow_statements_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "financial_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_financial_facts" ADD CONSTRAINT "raw_financial_facts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_financial_facts" ADD CONSTRAINT "raw_financial_facts_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "financial_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_data_refresh_logs" ADD CONSTRAINT "financial_data_refresh_logs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

