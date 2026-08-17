import { getCompanyOverview } from '@/lib/services/companyService';
import { getFinancials, CompanyNotFoundError } from '@/lib/services/financialDataService';
import { getCompanyValuationMetrics, getPeerCandidates, fetchTargetAndPeers, CompsTargetNotFoundError } from '@/lib/services/compsDataService';
import { deriveHistoricalYears } from '@/lib/valuation/historicals';
import { buildMarketData } from '@/lib/valuation/marketData';
import { buildDefaultAssumptions, runDcf } from '@/lib/valuation/engine';
import { DEFAULT_BEAR_DELTAS, DEFAULT_BULL_DELTAS } from '@/lib/valuation/scenarios';
import type { DcfResult } from '@/lib/valuation/types';
import { computeCompanyMultiples } from '@/lib/comps/multiples';
import { runComps } from '@/lib/comps/engine';
import type { PeerSelection } from '@/lib/comps/types';
import { growthRate, operatingMargin } from '@/lib/analytics/ratios';

/**
 * A thin, reusable orchestration layer for Milestone 10's watchlist rows and
 * portfolio valuation monitor — reuses the EXACT SAME pure engine functions
 * (runDcf, runComps, computeCompanyMultiples) and data services
 * (getCompanyOverview, getFinancials, getCompanyValuationMetrics) that the
 * Valuation, Comparable Companies, and Research Report pages already call.
 * Nothing here recalculates a financial metric from scratch; this file only
 * sequences existing calls for a lighter-weight, single-ticker summary than
 * a full DCF/comps workspace needs (no scenarios, no peer-selection UI).
 * Never persisted — always computed fresh from whatever is currently cached
 * in Postgres or fetched live, same freshness guarantee as every other page.
 */

const DEFAULT_PEER_COUNT = 6; // matches CompsWorkspace.tsx's own default

export interface QuickFundamentals {
  ticker: string;
  name: string;
  sector: string | null;
  industry: string | null;
  price: number | null;
  marketCap: number | null;
  revenue: number | null;
  revenueGrowth: number | null;
  operatingMargin: number | null;
  freeCashFlow: number | null;
  evToEbitda: number | null;
  peRatio: number | null;
}

/** Current-period fundamentals + multiples for one ticker — the row-level
 * data watchlists and portfolio holdings both need. Returns null only when
 * the ticker itself doesn't exist (no FMP profile at all). */
export async function getQuickFundamentals(rawTicker: string): Promise<QuickFundamentals | null> {
  const ticker = rawTicker.trim().toUpperCase();
  const metrics = await getCompanyValuationMetrics(ticker);
  if (!metrics) return null;

  const multiples = computeCompanyMultiples(metrics);

  let freeCashFlow: number | null = null;
  try {
    const financials = await getFinancials(ticker, 'annual');
    const latest = financials.periods[0] ?? null;
    freeCashFlow = latest?.cashFlow.freeCashFlow ?? null;
  } catch {
    // No SEC filer, or SEC unreachable with nothing cached — leave FCF null,
    // same graceful-degradation behavior as every other consumer of getFinancials.
  }

  return {
    ticker: metrics.ticker,
    name: metrics.name,
    sector: metrics.sector,
    industry: metrics.industry,
    price: metrics.price,
    marketCap: metrics.marketCap,
    revenue: metrics.revenue,
    revenueGrowth: metrics.revenueGrowth,
    operatingMargin: operatingMargin(metrics.ebit, metrics.revenue),
    freeCashFlow,
    evToEbitda: multiples.evToEbitda.value,
    peRatio: multiples.peRatio.value,
  };
}

export interface QuickDcf {
  currentSharePrice: number | null;
  impliedSharePrice: number | null;
  upsideDownside: number | null;
  isValid: boolean;
  wacc: number | null;
}

/** Base-case-only DCF, reusing lib/valuation/engine.ts's own default
 * assumptions unchanged — never a second, competing calculation. Returns
 * null when there's not enough annual financial history to forecast from. */
export async function getQuickDcf(rawTicker: string): Promise<QuickDcf | null> {
  const ticker = rawTicker.trim().toUpperCase();

  const overview = await getCompanyOverview(ticker);
  if (!overview) return null;

  let periods;
  try {
    periods = (await getFinancials(ticker, 'annual')).periods;
  } catch (error) {
    if (error instanceof CompanyNotFoundError) return null;
    throw error;
  }
  if (!periods.some((p) => p.periodType === 'annual')) return null;

  const historicals = deriveHistoricalYears(periods);
  const marketData = buildMarketData(overview, periods);
  const assumptions = buildDefaultAssumptions(marketData);
  const result = runDcf({ historicals, marketData, assumptions });

  return {
    currentSharePrice: marketData.currentSharePrice,
    impliedSharePrice: result.impliedSharePrice,
    upsideDownside: result.upsideDownside,
    isValid: result.isValid,
    wacc: result.wacc.wacc.value,
  };
}

export interface QuickDcfScenario {
  label: 'Bear' | 'Base' | 'Bull';
  currentSharePrice: number | null;
  impliedSharePrice: number | null;
  upsideDownside: number | null;
  isValid: boolean;
  wacc: number | null;
  terminalGrowthRate: number | null;
  finalYearRevenue: number | null;
  finalYearOperatingMargin: number | null;
  finalYearUnleveredFcf: number | null;
  forecastYears: number;
}

export interface QuickDcfScenarios {
  bear: QuickDcfScenario;
  base: QuickDcfScenario;
  bull: QuickDcfScenario;
}

/** Bull/Base/Bear DCF scenarios for a ticker — reuses lib/valuation/engine.ts's
 * runDcf three times with lib/valuation/scenarios.ts's own default deltas,
 * exactly the same pattern lib/research/aggregateResearchContext.ts (Milestone
 * 9) already uses to build a research report's scenario table. Never a
 * second DCF engine, never a different set of scenario deltas invented for
 * this call site — Milestone 13's Investment Case valuation section reads
 * this directly rather than storing its own Bull/Base/Bear figures. Returns
 * null under the same conditions as getQuickDcf (no overview, or no annual
 * financial history to forecast from). */
export async function getQuickDcfScenarios(rawTicker: string): Promise<QuickDcfScenarios | null> {
  const ticker = rawTicker.trim().toUpperCase();

  const overview = await getCompanyOverview(ticker);
  if (!overview) return null;

  let periods;
  try {
    periods = (await getFinancials(ticker, 'annual')).periods;
  } catch (error) {
    if (error instanceof CompanyNotFoundError) return null;
    throw error;
  }
  if (!periods.some((p) => p.periodType === 'annual')) return null;

  const historicals = deriveHistoricalYears(periods);
  const marketData = buildMarketData(overview, periods);
  const assumptions = buildDefaultAssumptions(marketData);

  const base = runDcf({ historicals, marketData, assumptions });
  const bear = runDcf({ historicals, marketData, assumptions, scenarioDeltas: DEFAULT_BEAR_DELTAS });
  const bull = runDcf({ historicals, marketData, assumptions, scenarioDeltas: DEFAULT_BULL_DELTAS });

  const terminalGrowthRate =
    assumptions.terminalValue.method === 'perpetuityGrowth' ? assumptions.terminalValue.perpetuityGrowthRate : base.terminalValue.impliedPerpetuityGrowth;

  const toScenario = (label: QuickDcfScenario['label'], result: DcfResult): QuickDcfScenario => {
    const finalYear = result.forecast[result.forecast.length - 1] ?? null;
    return {
      label,
      currentSharePrice: result.currentSharePrice,
      impliedSharePrice: result.impliedSharePrice,
      upsideDownside: result.upsideDownside,
      isValid: result.isValid,
      wacc: result.wacc.wacc.value,
      terminalGrowthRate,
      finalYearRevenue: finalYear?.revenue ?? null,
      finalYearOperatingMargin: finalYear?.ebitMargin ?? null,
      finalYearUnleveredFcf: finalYear?.unleveredFcf ?? null,
      forecastYears: assumptions.forecastYears,
    };
  };

  return { bear: toScenario('Bear', bear), base: toScenario('Base', base), bull: toScenario('Bull', bull) };
}

export interface QuickComps {
  impliedSharePrice: number | null;
  upsideDownside: number | null;
  evToEbitda: number | null;
  /** Outlier-adjusted peer-group median EV/EBITDA — the "vs. peer median"
   * half of a valuation-spread comparison (Milestone 12); `evToEbitda`
   * above is the TARGET's own multiple. */
  peerMedianEvToEbitda: number | null;
}

/** Auto-selected-peer-set comps, reusing lib/comps/engine.ts's runComps
 * unchanged with the same top-N-by-similarity peer selection the Comps page
 * defaults to. Returns null when no peers can be identified. */
export async function getQuickComps(rawTicker: string): Promise<QuickComps | null> {
  const ticker = rawTicker.trim().toUpperCase();

  try {
    const candidates = await getPeerCandidates(ticker);
    if (candidates.length === 0) return null;

    const peerTickers = candidates.slice(0, DEFAULT_PEER_COUNT).map((c) => c.metrics.ticker);
    const { target, peers } = await fetchTargetAndPeers(ticker, peerTickers);
    if (peers.length === 0) return null;

    const peerSelections: PeerSelection[] = peers.map((metrics) => ({
      metrics,
      score: null,
      source: 'calculated',
      excluded: false,
    }));

    const result = runComps({ target, peers: peerSelections });
    const impliedSharePrice = result.medianImpliedSharePrice;
    const currentPrice = target.price;

    return {
      impliedSharePrice,
      upsideDownside: impliedSharePrice !== null && currentPrice !== null ? growthRate(impliedSharePrice, currentPrice) : null,
      evToEbitda: result.targetMultiples.evToEbitda.value,
      peerMedianEvToEbitda: result.statistics.evToEbitda.adjusted.median,
    };
  } catch (error) {
    if (error instanceof CompsTargetNotFoundError) return null;
    throw error;
  }
}
