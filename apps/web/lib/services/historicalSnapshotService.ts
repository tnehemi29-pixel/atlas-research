import { db } from '@/lib/db';
import { getFinancials } from '@/lib/services/financialDataService';
import { listFilings } from '@/lib/services/secFilingService';
import { listEarningsCalls } from '@/lib/services/earningsCallService';
import { getPriceAsOf } from '@/lib/services/historicalPriceService';
import { filterPeriodsAsOf, runPointInTimeDcf, type PointInTimeDcfResult } from '@/lib/backtest/pointInTimeValuation';

/**
 * Spec section 2: "What Atlas knew at this point in time." Assembles a
 * point-in-time research snapshot entirely from data Milestones 1-11
 * already store, filtered to what would have been visible as of
 * `asOfDate` — never persisted (computed fresh, like every other
 * "current state" read in this codebase since Milestone 10), so it always
 * reflects whatever is cached now, with no separate materialization job to
 * keep in sync.
 *
 * Comparable-company data is deliberately OMITTED from the snapshot (see
 * `limitations`) rather than populated with today's peer multiples under a
 * misleading "as of" label — Atlas has no point-in-time peer-group
 * fundamentals. lib/services/backtestService.ts's valuation-spread
 * analysis makes a different, narrower, loudly-disclosed compromise for
 * that specific feature (point-in-time target multiple vs. current peer
 * median) — see docs/backtesting.md — but the general-purpose snapshot
 * here stays conservative and simply says "not available."
 */

export interface HistoricalSnapshotFiling {
  id: string;
  formType: string;
  filingDate: string;
}

export interface HistoricalSnapshotEarningsCall {
  id: string;
  fiscalYear: number;
  fiscalQuarter: number;
  callDate: string | null;
}

export interface HistoricalSnapshotResearchEvent {
  id: string;
  type: string;
  category: string;
  title: string;
  materiality: string;
  eventDate: string;
}

export interface HistoricalSnapshot {
  ticker: string;
  companyName: string;
  asOfDate: string;
  price: { date: string; close: number } | null;
  marketCap: number | null;
  annualPeriodsKnown: number;
  latestKnownFiscalYear: number | null;
  filings: HistoricalSnapshotFiling[];
  earningsCalls: HistoricalSnapshotEarningsCall[];
  dcf: PointInTimeDcfResult | null;
  researchEvents: HistoricalSnapshotResearchEvent[];
  /** Always non-empty — the standard, fixed disclosures this milestone
   * requires on every point-in-time result (spec sections 3 and 16). Never
   * conditionally shown; a snapshot with nothing to disclose still doesn't
   * exist in this system. */
  limitations: string[];
}

const STANDARD_LIMITATIONS = [
  'Comparable-company data is not included in this snapshot — Atlas does not maintain point-in-time peer-group fundamentals for other companies at this historical date.',
  "A financial period's value reflects the latest filing Atlas currently has stored for that period. If the period was restated after this date, the restated figure may be shown here instead of what an analyst would actually have seen on this date — see docs/backtesting.md.",
  "The DCF's WACC uses the company's CURRENT beta, not a point-in-time historical beta.",
  'Results may contain survivorship bias — Atlas has no data source for companies that have since been delisted or gone private.',
];

/** Returns null only when the ticker itself is unknown to Atlas — every
 * other missing piece (no price yet, no filings yet, DCF not computable)
 * degrades to an empty/null field within an otherwise-real snapshot,
 * exactly matching "what Atlas knew" for a company with a thin history. */
export async function getSnapshotAsOf(rawTicker: string, asOfDate: string): Promise<HistoricalSnapshot | null> {
  const ticker = rawTicker.trim().toUpperCase();
  const company = await db.company.findUnique({ where: { ticker } });
  if (!company) return null;

  const asOfDateObj = new Date(`${asOfDate}T23:59:59.999Z`);

  const [priceAsOf, dcf, allPeriods, allFilings, allCalls, events] = await Promise.all([
    getPriceAsOf(ticker, asOfDate),
    runPointInTimeDcf(ticker, asOfDate).catch(() => null),
    getFinancials(ticker, 'annual')
      .then((r) => r.periods)
      .catch(() => []),
    listFilings(ticker).catch(() => []),
    listEarningsCalls(ticker).catch(() => []),
    db.researchEvent.findMany({ where: { companyId: company.id, eventDate: { lte: asOfDateObj } }, orderBy: { eventDate: 'desc' } }),
  ]);

  const knownPeriods = filterPeriodsAsOf(allPeriods, asOfDate);
  const latestKnownFiscalYear = knownPeriods.length > 0 ? Math.max(...knownPeriods.map((p) => p.fiscalYear)) : null;
  const latestKnownShares = knownPeriods.find((p) => p.fiscalYear === latestKnownFiscalYear)?.incomeStatement.dilutedSharesOutstanding ?? null;
  const marketCap = priceAsOf && latestKnownShares !== null ? priceAsOf.close * latestKnownShares : null;

  const filings: HistoricalSnapshotFiling[] = allFilings
    .filter((f) => f.filingDate <= asOfDateObj)
    .map((f) => ({ id: f.id, formType: f.formType, filingDate: f.filingDate.toISOString().slice(0, 10) }));

  const earningsCalls: HistoricalSnapshotEarningsCall[] = allCalls
    .filter((c) => (c.callDate ?? c.periodEndDate ?? asOfDateObj) <= asOfDateObj)
    .map((c) => ({ id: c.id, fiscalYear: c.fiscalYear, fiscalQuarter: c.fiscalQuarter, callDate: c.callDate ? c.callDate.toISOString().slice(0, 10) : null }));

  const researchEvents: HistoricalSnapshotResearchEvent[] = events.map((e) => ({
    id: e.id,
    type: e.type,
    category: e.category,
    title: e.title,
    materiality: e.materiality,
    eventDate: e.eventDate.toISOString().slice(0, 10),
  }));

  return {
    ticker,
    companyName: company.name,
    asOfDate,
    price: priceAsOf,
    marketCap,
    annualPeriodsKnown: knownPeriods.length,
    latestKnownFiscalYear,
    filings,
    earningsCalls,
    dcf,
    researchEvents,
    limitations: STANDARD_LIMITATIONS,
  };
}
