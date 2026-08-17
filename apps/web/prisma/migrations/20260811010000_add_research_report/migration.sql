-- CreateTable
CREATE TABLE "research_reports" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "AnalysisStatus" NOT NULL,
    "model" TEXT NOT NULL,
    "error" TEXT,
    "dataSnapshotAt" TIMESTAMP(3) NOT NULL,
    "content" JSONB NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "research_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "research_reports_companyId_createdAt_idx" ON "research_reports"("companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "research_reports_companyId_version_key" ON "research_reports"("companyId", "version");

-- AddForeignKey
ALTER TABLE "research_reports" ADD CONSTRAINT "research_reports_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
