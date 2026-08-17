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
import { db } from '@/lib/db';
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

async function persistPeriods(companyId: string, periods: NormalizedPeriod[]): Promise<void> {
  await db.$transaction(async (tx) => {
    // Raw facts are fully regenerated every refresh rather than upserted —
    // simpler and correct since they're a derived provenance trail, not
    // user-owned data. See prisma/schema.prisma's RawFinancialFact comment.
    await tx.rawFinancialFact.deleteMany({ where: { companyId } });

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
      if (rawRows.length > 0) {
        await tx.rawFinancialFact.createMany({ data: rawRows });
      }
    }

    await tx.company.update({ where: { id: companyId }, data: { financialsSyncedAt: new Date() } });
  });
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
