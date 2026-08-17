-- AlterTable
ALTER TABLE "income_statements" DROP COLUMN "sharesOutstanding",
ADD COLUMN     "basicSharesOutstanding" DOUBLE PRECISION,
ADD COLUMN     "dilutedSharesOutstanding" DOUBLE PRECISION;
