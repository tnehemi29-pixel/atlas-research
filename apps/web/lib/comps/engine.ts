import { safeDivide } from '@/lib/analytics/ratios';
import { computeCompanyMultiples } from './multiples';
import { median, summarize } from './statistics';
import { detectOutliersIQR } from './outliers';
import { computeAllImpliedValuationRows, computeMedianImpliedSharePrice } from './impliedValuation';
import type {
  CompanyValuationMetrics,
  CompsResult,
  MultipleKey,
  MultipleStatistics,
  PeerQualitySummary,
  PeerSelection,
  SelectedPeer,
} from './types';

/**
 * The comps engine's single entry point. Deterministic and side-effect
 * free — the same (target, peers) always produces the same CompsResult, and
 * every intermediate step (each peer's own multiples, the raw vs.
 * outlier-adjusted statistics, the implied valuation per methodology) is
 * exposed on the result rather than collapsed into just a final number, the
 * same "auditable at every step" design as lib/valuation/engine.ts.
 */

const MULTIPLE_KEYS: MultipleKey[] = ['evToRevenue', 'evToEbitda', 'evToEbit', 'peRatio'];

export interface RunCompsParams {
  target: CompanyValuationMetrics;
  /** The user's selected peer set — engine always (re)computes multiples
   * from `metrics` rather than trusting a caller-supplied value. */
  peers: PeerSelection[];
}

/**
 * Raw = every selected peer with an 'ok' value for this multiple, full
 * stop. Outliers = IQR-flagged candidates identified from that *raw* set —
 * purely informational, a suggestion for the user to consider, never
 * subtracted automatically ("do NOT automatically delete unusual
 * companies"). Adjusted = raw recomputed after the user's own exclusions
 * (`peer.excluded`) — which may or may not be the same companies the IQR
 * check flagged; the user has the final say either way.
 */
function computeMultipleStatistics(peers: SelectedPeer[], key: MultipleKey): MultipleStatistics {
  const allEntries = peers
    .map((peer) => ({ ticker: peer.metrics.ticker, value: peer.multiples[key].value }))
    .filter((entry): entry is { ticker: string; value: number } => entry.value !== null);

  const raw = summarize(allEntries.map((entry) => entry.value));
  const outliers = detectOutliersIQR(allEntries);

  const excludedTickers = new Set(peers.filter((peer) => peer.excluded).map((peer) => peer.metrics.ticker));
  const adjustedEntries = allEntries.filter((entry) => !excludedTickers.has(entry.ticker));
  const adjusted = summarize(adjustedEntries.map((entry) => entry.value));

  return { raw, outliers, adjusted };
}

function computePeerQuality(peers: SelectedPeer[]): PeerQualitySummary {
  const included = peers.filter((peer) => !peer.excluded).map((peer) => peer.metrics);

  const numeric = (values: Array<number | null>) => values.filter((v): v is number => v !== null);

  return {
    peerCount: included.length,
    medianRevenue: median(numeric(included.map((m) => m.revenue))),
    medianMarketCap: median(numeric(included.map((m) => m.marketCap))),
    medianGrowth: median(numeric(included.map((m) => m.revenueGrowth))),
    medianEbitdaMargin: median(numeric(included.map((m) => safeDivide(m.ebitda, m.revenue)))),
  };
}

export function runComps(params: RunCompsParams): CompsResult {
  const { target, peers } = params;

  const targetMultiples = computeCompanyMultiples(target);
  const peersWithMultiples: SelectedPeer[] = peers.map((peer) => ({
    ...peer,
    multiples: computeCompanyMultiples(peer.metrics),
  }));

  const statistics = Object.fromEntries(
    MULTIPLE_KEYS.map((key) => [key, computeMultipleStatistics(peersWithMultiples, key)]),
  ) as Record<MultipleKey, MultipleStatistics>;

  // Implied valuation always uses the outlier-adjusted median — the whole
  // point of flagging outliers is that they shouldn't drive the target's
  // implied valuation unless the user explicitly un-excludes them.
  const medianMultiples: Record<MultipleKey, number | null> = {
    evToRevenue: statistics.evToRevenue.adjusted.median,
    evToEbitda: statistics.evToEbitda.adjusted.median,
    evToEbit: statistics.evToEbit.adjusted.median,
    peRatio: statistics.peRatio.adjusted.median,
  };

  const impliedValuation = computeAllImpliedValuationRows(target, medianMultiples);
  const medianImpliedSharePrice = computeMedianImpliedSharePrice(impliedValuation);
  const peerQuality = computePeerQuality(peersWithMultiples);

  return {
    target,
    targetMultiples,
    peers: peersWithMultiples,
    statistics,
    impliedValuation,
    medianImpliedSharePrice,
    peerQuality,
  };
}
