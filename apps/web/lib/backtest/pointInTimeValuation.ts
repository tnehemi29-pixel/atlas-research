import type { FinancialPeriodData } from '@erp/types';
import { getCompanyOverview } from '@/lib/services/companyService';
import { getFinancials, CompanyNotFoundError } from '@/lib/services/financialDataService';
import { getPriceAsOf, toDateOnly } from '@/lib/services/historicalPriceService';
import { deriveHistoricalYears } from '@/lib/valuation/historicals';
import { buildDefaultAssumptions, runDcf } from '@/lib/valuation/engine';
import type { DcfMarketData, ForecastYear } from '@/lib/valuation/types';

/**
 * The core mechanism preventing look-ahead bias in every DCF-based
 * Milestone 12 analysis (spec section 1 — "the most important requirement
 * of the milestone"). `runPointInTimeDcf(ticker, asOfDate)` reuses
 * Milestone 5's own engine (deriveHistoricalYears, buildDefaultAssumptions,
 * runDcf) completely unchanged; the only thing this file does differently
 * from lib/valuation/quickValuation.ts's getQuickDcf is WHICH inputs it
 * feeds that engine:
 *
 *  - Financial periods are filtered to `filingDate <= asOfDate` — a period
 *    that hadn't been filed yet on the historical date is invisible here,
 *    exactly as it would have been to a real analyst. A period with an
 *    unknown (`null`) filing date is excluded too, conservatively — "might
 *    not have been available" is treated the same as "wasn't available."
 *  - The share price is the actual historical close on/before `asOfDate`
 *    (lib/services/historicalPriceService.ts), never today's price.
 *  - Market cap is derived from that historical price × the point-in-time
 *    diluted share count, never today's market cap.
 *
 * Known, disclosed limitation: WACC's beta input still uses the company's
 * CURRENT beta (Atlas has no historical beta time series to draw from) —
 * documented in docs/backtesting.md and surfaced in every result's own
 * methodology panel, never silently presented as point-in-time.
 *
 * Separately documented limitation (see docs/backtesting.md and the
 * Milestone 12 README section): a period's *value* still reflects
 * whichever filing Atlas's own Milestone 3 pipeline currently has stored
 * as the latest for that period — if that period was restated after
 * `asOfDate`, this does not detect or exclude the restatement. Excluding
 * not-yet-filed PERIODS (the check above) is the load-bearing protection
 * against look-ahead bias; guarding against later restatements of an
 * already-filed period would require an append-only fact history Atlas
 * does not currently persist.
 */

export interface PointInTimeDcfResult {
  asOfDate: string;
  impliedSharePrice: number | null;
  currentSharePrice: number | null;
  upsideDownside: number | null;
  isValid: boolean;
  /** How many annual periods were actually known as of this date — lets a
   * caller judge how forecast-worthy this particular snapshot's historical
   * baseline was (a DCF run off 1-2 known years is far less anchored than
   * one off 5+). */
  annualPeriodsKnown: number;
  /** The full forecast table this point-in-time run produced — empty when
   * any required input was missing (lib/valuation/engine.ts's own
   * all-or-nothing rule). Used directly by DCF forecast validation to
   * compare each forecast year against what actually happened. */
  forecast: ForecastYear[];
}

/** Filters to annual periods whose filing date is on or before `asOfDate`
 * — the one shared filter every point-in-time consumer in this milestone
 * should use, so "what was known as of date X" always means the same
 * thing everywhere. */
export function filterPeriodsAsOf(periods: FinancialPeriodData[], asOfDate: string): FinancialPeriodData[] {
  // financialDataService.ts's FinancialPeriodData.filingDate is a full ISO
  // timestamp (filingDate.toISOString()), not a plain "YYYY-MM-DD" — both
  // sides are normalized to date-only before comparing so a period filed on
  // the same calendar day as `asOfDate` compares correctly, and so callers
  // passing either format get the same, correct answer.
  const normalizedAsOfDate = toDateOnly(asOfDate);
  return periods.filter((p) => p.periodType === 'annual' && p.filingDate !== null && toDateOnly(p.filingDate) <= normalizedAsOfDate);
}

function latestOf(periods: FinancialPeriodData[]): FinancialPeriodData {
  return periods.reduce((latest, p) => (p.fiscalYear > latest.fiscalYear ? p : latest));
}

function buildPointInTimeMarketData(asOfPrice: number, periods: FinancialPeriodData[], beta: number | null): DcfMarketData {
  const latest = latestOf(periods);
  const { shortTermDebt, longTermDebt } = latest.balanceSheet;
  const totalDebt = shortTermDebt === null && longTermDebt === null ? null : (shortTermDebt ?? 0) + (longTermDebt ?? 0);
  const dilutedSharesOutstanding = latest.incomeStatement.dilutedSharesOutstanding;

  return {
    currentSharePrice: asOfPrice,
    marketCapitalization: dilutedSharesOutstanding !== null ? asOfPrice * dilutedSharesOutstanding : null,
    totalDebt,
    cash: latest.balanceSheet.cashAndEquivalents,
    dilutedSharesOutstanding,
    beta,
    interestExpense: latest.incomeStatement.interestExpense,
  };
}

/** Returns null when either the company can't be resolved, no annual
 * period had been filed yet as of `asOfDate`, or no historical price is
 * available for that date — never a DCF built on a fabricated baseline. */
export async function runPointInTimeDcf(rawTicker: string, asOfDate: string): Promise<PointInTimeDcfResult | null> {
  const ticker = rawTicker.trim().toUpperCase();

  let allPeriods: FinancialPeriodData[];
  try {
    allPeriods = (await getFinancials(ticker, 'annual')).periods;
  } catch (error) {
    if (error instanceof CompanyNotFoundError) return null;
    throw error;
  }

  const knownPeriods = filterPeriodsAsOf(allPeriods, asOfDate);
  if (knownPeriods.length === 0) return null;

  const priceAsOf = await getPriceAsOf(ticker, asOfDate);
  if (!priceAsOf) return null;

  const overview = await getCompanyOverview(ticker);
  const historicals = deriveHistoricalYears(knownPeriods);
  const marketData = buildPointInTimeMarketData(priceAsOf.close, knownPeriods, overview?.beta ?? null);
  const assumptions = buildDefaultAssumptions(marketData);
  const result = runDcf({ historicals, marketData, assumptions });

  return {
    asOfDate,
    impliedSharePrice: result.impliedSharePrice,
    currentSharePrice: marketData.currentSharePrice,
    upsideDownside: result.upsideDownside,
    isValid: result.isValid,
    annualPeriodsKnown: knownPeriods.length,
    forecast: result.forecast,
  };
}
