-- CreateTable
CREATE TABLE "historical_price_bars" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "close" DOUBLE PRECISION NOT NULL,
    "adjClose" DOUBLE PRECISION,
    "open" DOUBLE PRECISION,
    "high" DOUBLE PRECISION,
    "low" DOUBLE PRECISION,
    "volume" DOUBLE PRECISION,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historical_price_bars_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "historical_price_bars_companyId_date_idx" ON "historical_price_bars"("companyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "historical_price_bars_companyId_date_key" ON "historical_price_bars"("companyId", "date");

-- AddForeignKey
ALTER TABLE "historical_price_bars" ADD CONSTRAINT "historical_price_bars_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
