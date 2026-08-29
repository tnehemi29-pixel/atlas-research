import type {
  Company,
  FiscalPeriod as PrismaFiscalPeriod,
  PeriodType as PrismaPeriodType,
  Prisma,
} from '@prisma/client';
import type {
  CompanyFinancialsResponse,
  FinancialPeriodData,
  FiscalPeriod as ApiFiscalPeriod,
  PeriodType as ApiPeriodType,
} from '@erp/types';
import { db, dbDirect } from '@/lib/db';
import { ensureCompanyByTicker } from '@/lib/services/companyService';
import { getCompanyFacts, resolveCik } from '@/lib/providers/secEdgar';
import { normalizeCompanyFacts } from '@/lib/xbrl/normalize';
import { applyValidation, validatePeriod } from '@/lib/xbrl/validate';
import { ALL_CONCEPT_FIELDS } from '@/lib/xbrl/conceptMap';
import {
  EMPTY_BALANCE_SHEET,
  EMPTY_CASH_FLOW,
  EMPTY_INCOME_STATEMENT,
  fromBalanceSheetRow,
  fromCashFlowRow,
  fromIncomeStatementRow,
  toBalanceSheetInput,
  toCashFlowInput,
  toIncomeStatementInput,
} from '@/lib/xbrl/persist';
import type { NormalizedPeriod, ValidationIssue } from '@/lib/xbrl/types';

/**
 * Orchestrates the full pipeline: ensure the company + its SEC CIK are
 * known -> fetch & normalize XBRL facts (only when the cache is stale) ->
 * validate -> persist -> serve from the database. This is the only module
 * that decides *when* to hit SEC vs. read from Postgres; everything else
 * (the API route, the page) just calls getFinancials().
 */

// Financial statements change on a filing cadence (quarterly at fastest),
// not intraday — a much longer TTL than the M2 stock-quote cache is correct.
const REFRESH_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ANNUAL_PERIODS = 10;
const MAX_QUARTERLY_PERIODS = 40;

export class CompanyNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CompanyNotFoundError';
  }
}

function toPrismaPeriodType(periodType: ApiPeriodType): PrismaPeriodType {
  return periodType === 'annual' ? 'ANNUAL' : 'QUARTERLY';
}

const FIELD_META = new Map(ALL_CONCEPT_FIELDS.map((def) => [def.field, def]));

function findPreviousSameType(
  periods: NormalizedPeriod[],
  index: number,
): NormalizedPeriod | undefined {
  const current = periods[index];
  if (!current) return undefined;
  return periods.slice(index + 1).find((p) => p.periodType === current.periodType);
}

/**
 * Each period needs 4 sequential round trips (FinancialPeriod,
 * IncomeStatement, BalanceSheet, CashFlowStatement upserts) inside one
 * interactive transaction. A single transaction spanning a deep filer's
 * entire history used to exceed even a 20s transaction timeout — AMD has 81
 * normalized periods (18 annual + 63 quarterly, back to 2008), i.e. 324
 * sequential round trips in one transaction, which threw Prisma P2028
 * ("Transaction already closed") well before completing. Batches of 10
 * periods (40 round trips) keep each individual transaction comfortably
 * within that same 20s ceiling with a wide margin, confirmed against AMD's
 * actual filing history — raising the timeout again would only move the
 * threshold, not remove it, since it scales with a company's period count,
 * not with any fixed budget.
 */
const PERIOD_PERSIST_BATCH_SIZE = 10;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

/**
 * Persists one batch of periods inside a single interactive transaction —
 * every period's 4 statement upserts stay atomic with each other (a period
 * is never left with some statements and not others), but separate batches
 * are separate transactions, so one batch committing is never contingent on
 * every other batch also succeeding. Runs over the direct (non-pooled)
 * connection — this is a genuinely multi-statement interactive transaction,
 * which needs one connection held open throughout; the pooled `db` client's
 * PgBouncer transaction-mode endpoint doesn't support that. See lib/db.ts's
 * dbDirect for the full explanation.
 */
async function persistPeriodBatch(
  companyId: string,
  periods: NormalizedPeriod[],
): Promise<Prisma.RawFinancialFactCreateManyInput[]> {
  const batchRawRows: Prisma.RawFinancialFactCreateManyInput[] = [];

  await dbDirect.$transaction(
    async (tx) => {
      for (const period of periods) {
        const fiscalPeriod = period.fiscalPeriod as PrismaFiscalPeriod;

        const periodRow = await tx.financialPeriod.upsert({
          where: {
            companyId_fiscalYear_fiscalPeriod: {
              companyId,
              fiscalYear: period.fiscalYear,
              fiscalPeriod,
            },
          },
          create: {
            companyId,
            fiscalYear: period.fiscalYear,
            fiscalPeriod,
            periodType: toPrismaPeriodType(period.periodType),
            periodStart: period.periodStart,
            periodEnd: period.periodEnd,
            filingType: period.filingType,
            filingDate: period.filingDate ? new Date(period.filingDate) : null,
            accessionNumber: period.accessionNumber,
          },
          update: {
            periodType: toPrismaPeriodType(period.periodType),
            periodStart: period.periodStart,
            periodEnd: period.periodEnd,
            filingType: period.filingType,
            filingDate: period.filingDate ? new Date(period.filingDate) : null,
            accessionNumber: period.accessionNumber,
          },
        });

        const incomeInput = toIncomeStatementInput(period);
        await tx.incomeStatement.upsert({
          where: { periodId: periodRow.id },
          create: { periodId: periodRow.id, ...incomeInput },
          update: incomeInput,
        });

        const balanceInput = toBalanceSheetInput(period);
        await tx.balanceSheet.upsert({
          where: { periodId: periodRow.id },
          create: { periodId: periodRow.id, ...balanceInput },
          update: balanceInput,
        });

        const cashFlowInput = toCashFlowInput(period);
        await tx.cashFlowStatement.upsert({
          where: { periodId: periodRow.id },
          create: { periodId: periodRow.id, ...cashFlowInput },
          update: cashFlowInput,
        });

        // Not written here — accumulated across every batch and only ever
        // written once all batches have committed (see persistPeriods below).
        const rawRows = Object.entries(period.sources).map(([field, source]) => {
          const meta = FIELD_META.get(field);
          return {
            companyId,
            periodId: periodRow.id,
            standardizedField: field,
            statementType: meta?.statementType ?? 'income',
            xbrlConcept: source.tag,
            unit: meta?.unit ?? 'USD',
            value: source.value,
            periodStart: period.periodStart,
            periodEnd: period.periodEnd,
            fiscalYear: period.fiscalYear,
            fiscalPeriod: period.fiscalPeriod,
            form: source.filing.form,
            filedDate: new Date(source.filing.filed),
            accessionNumber: source.filing.accn,
          };
        });
        batchRawRows.push(...rawRows);
      }
    },
    { timeout: 20000, maxWait: 10000 },
  );

  return batchRawRows;
}

/**
 * Persists every normalized period for a company. Periods arrive sorted
 * newest-first (see normalizeCompanyFacts), and each batch below commits
 * independently in its own transaction — so if a later batch fails, the
 * most recent (most decision-relevant, e.g. for the DCF's "latest period")
 * periods from earlier batches are already durably persisted, not lost
 * along with everything else the way one giant all-or-nothing transaction
 * previously was. Every upsert is keyed by a stable natural key
 * (companyId+fiscalYear+fiscalPeriod, or periodId derived from that), so if
 * a batch fails and the caller retries the whole refresh later, re-persisting
 * already-committed periods is a no-op overwrite with identical values —
 * never a duplicate row, never corruption.
 *
 * `Company.financialsSyncedAt` is only ever set once every batch has
 * committed — never after a partial success — so a refresh that fails
 * partway through leaves the company correctly looking "not yet fully
 * synced," and the next read (getFinancials's isFresh check) retries rather
 * than treating incomplete data as current. A failure here propagates to
 * the caller exactly as it always did (refreshFinancials's existing
 * try/catch logs FAILED and rethrows) — it's just no longer all-or-nothing
 * at the database level.
 */
export async function persistPeriods(companyId: string, periods: NormalizedPeriod[]): Promise<void> {
  const allRawRows: Prisma.RawFinancialFactCreateManyInput[] = [];

  for (const batch of chunk(periods, PERIOD_PERSIST_BATCH_SIZE)) {
    const batchRawRows = await persistPeriodBatch(companyId, batch);
    allRawRows.push(...batchRawRows);
  }

  await db.company.update({ where: { id: companyId }, data: { financialsSyncedAt: new Date() } });

  // Raw facts are a derived provenance trail, not user-owned data — fully
  // regenerated every refresh rather than upserted (see the RawFinancialFact
  // comment in prisma/schema.prisma), and safe to write after every batch has
  // committed since they don't need to be atomic with any single one of them
  // (a next refresh fully regenerates them regardless). Using the pooled
  // `db` client here, not `dbDirect` — these are simple, independent
  // statements, exactly what pooling handles well.
  await db.rawFinancialFact.deleteMany({ where: { companyId } });
  if (allRawRows.length > 0) {
    await db.rawFinancialFact.createMany({ data: allRawRows });
  }
}

async function logRefresh(
  companyId: string,
  startedAt: Date,
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED',
  periodsFound: number,
  warnings: ValidationIssue[],
  errorMessage?: string,
): Promise<void> {
  await db.financialDataRefreshLog.create({
    data: {
      companyId,
      status,
      periodsFound,
      warnings: warnings.length > 0 ? (warnings as unknown as Prisma.InputJsonValue) : undefined,
      errorMessage,
      startedAt,
      completedAt: new Date(),
    },
  });
}

async function refreshFinancials(company: Company): Promise<void> {
  const startedAt = new Date();

  try {
    let cik = company.cik;
    if (!cik) {
      const identity = await resolveCik(company.ticker);
      if (!identity) {
        throw new CompanyNotFoundError(
          `SEC EDGAR has no filer registered for ticker "${company.ticker}".`,
        );
      }
      cik = identity.cik;
      await db.company.update({ where: { id: company.id }, data: { cik } });
    }

    const facts = await getCompanyFacts(cik);
    const rawPeriods = normalizeCompanyFacts(facts);

    const warnings: ValidationIssue[] = [];
    const cleanedPeriods = rawPeriods.map((period, index) => {
      const issues = validatePeriod(period, findPreviousSameType(rawPeriods, index));
      warnings.push(...issues);
      return applyValidation(period, issues);
    });

    for (const issue of warnings) {
      // eslint-disable-next-line no-console
      console.warn(
        `[financialDataService] ${company.ticker} ${issue.fiscalYear}${issue.fiscalPeriod} ${issue.severity}: ${issue.message}`,
      );
    }

    await persistPeriods(company.id, cleanedPeriods);
    await logRefresh(
      company.id,
      startedAt,
      cleanedPeriods.length > 0 ? 'SUCCESS' : 'PARTIAL',
      cleanedPeriods.length,
      warnings,
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown error refreshing financial data';
    await logRefresh(company.id, startedAt, 'FAILED', 0, [], message);
    throw error;
  }
}

function mapPeriodRow(
  row: Awaited<
    ReturnType<
      typeof db.financialPeriod.findMany<{
        include: { incomeStatement: true; balanceSheet: true; cashFlowStatement: true };
      }>
    >
  >[number],
  periodType: ApiPeriodType,
): FinancialPeriodData {
  return {
    fiscalYear: row.fiscalYear,
    fiscalPeriod: row.fiscalPeriod as ApiFiscalPeriod,
    periodType,
    periodStart: row.periodStart ? row.periodStart.toISOString() : null,
    periodEnd: row.periodEnd.toISOString(),
    filingType: row.filingType,
    filingDate: row.filingDate ? row.filingDate.toISOString() : null,
    incomeStatement: row.incomeStatement
      ? fromIncomeStatementRow(row.incomeStatement)
      : EMPTY_INCOME_STATEMENT,
    balanceSheet: row.balanceSheet ? fromBalanceSheetRow(row.balanceSheet) : EMPTY_BALANCE_SHEET,
    cashFlow: row.cashFlowStatement ? fromCashFlowRow(row.cashFlowStatement) : EMPTY_CASH_FLOW,
  };
}

/**
 * Returns standardized financial statement history for a ticker. Throws
 * CompanyNotFoundError if SEC EDGAR has no filer for the ticker at all;
 * throws the underlying provider error if SEC is unreachable and nothing is
 * cached yet; otherwise always returns data, falling back to a stale cached
 * snapshot (stale: true) if a refresh was needed but failed.
 */
export async function getFinancials(
  rawTicker: string,
  periodType: ApiPeriodType,
): Promise<CompanyFinancialsResponse> {
  const ticker = rawTicker.trim().toUpperCase();
  if (ticker.length === 0) {
    throw new CompanyNotFoundError('No ticker provided.');
  }

  const company = await ensureCompanyByTicker(ticker);
  const isFresh = Boolean(
    company.financialsSyncedAt &&
      Date.now() - company.financialsSyncedAt.getTime() < REFRESH_TTL_MS,
  );

  let stale = false;
  if (!isFresh) {
    try {
      await refreshFinancials(company);
    } catch (error) {
      if (error instanceof CompanyNotFoundError) throw error;

      const existingCount = await db.financialPeriod.count({ where: { companyId: company.id } });
      if (existingCount === 0) throw error;
      stale = true;
    }
  }

  const refreshedCompany = await db.company.findUniqueOrThrow({ where: { id: company.id } });
  const dbPeriods = await db.financialPeriod.findMany({
    where: { companyId: company.id, periodType: toPrismaPeriodType(periodType) },
    include: { incomeStatement: true, balanceSheet: true, cashFlowStatement: true },
    orderBy: { periodEnd: 'desc' },
    take: periodType === 'annual' ? MAX_ANNUAL_PERIODS : MAX_QUARTERLY_PERIODS,
  });

  return {
    ticker: refreshedCompany.ticker,
    periodType,
    periods: dbPeriods.map((row) => mapPeriodRow(row, periodType)),
    stale,
    dataAsOf: refreshedCompany.financialsSyncedAt
      ? refreshedCompany.financialsSyncedAt.toISOString()
      : null,
  };
}
