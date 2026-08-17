-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "changePercent" DOUBLE PRECISION,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "exchange" TEXT,
ADD COLUMN     "industry" TEXT,
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "marketCap" DOUBLE PRECISION,
ADD COLUMN     "price" DOUBLE PRECISION,
ADD COLUMN     "quoteUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "sector" TEXT,
ADD COLUMN     "yearHigh" DOUBLE PRECISION,
ADD COLUMN     "yearLow" DOUBLE PRECISION;
