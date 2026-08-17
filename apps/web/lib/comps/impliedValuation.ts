import { computeEquityValue, computeImpliedSharePrice, computeUpsideDownside } from '@/lib/valuation/bridge';
import { median } from './statistics';
import type { CompanyValuationMetrics, ImpliedValuationRow, MultipleKey } from './types';

/**
 * Target Metric x Peer Median Multiple = Implied Valuation, for each of the
 * four methodologies. Deliberately reuses computeEquityValue /
 * computeImpliedSharePrice / computeUpsideDownside from Milestone 5's
 * lib/valuation/bridge.ts rather than reimplementing the EV -> equity value
 * -> share price bridge — it's the exact same formula (EV + Cash - Debt,
 * then / Diluted Shares) regardless of whether EV came from a DCF or a
 * peer-multiple.
 */

const METHODOLOGY_LABELS: Record<MultipleKey, string> = {
  evToRevenue: 'EV / Revenue',
  evToEbitda: 'EV / EBITDA',
  evToEbit: 'EV / EBIT',
  peRatio: 'P / E',
};

function targetMetricFor(methodology: MultipleKey, target: CompanyValuationMetrics): number | null {
  switch (methodology) {
    case 'evToRevenue':
      return target.revenue;
    case 'evToEbitda':
      return target.ebitda;
    case 'evToEbit':
      return target.ebit;
    case 'peRatio':
      return target.netIncome;
  }
}

function notMeaningfulRow(methodology: MultipleKey, medianMultiple: number | null): ImpliedValuationRow {
  return {
    methodology,
    label: METHODOLOGY_LABELS[methodology],
    medianMultiple,
    impliedEnterpriseValue: null,
    impliedEquityValue: null,
    impliedSharePrice: null,
    upsideDownside: null,
    isMeaningful: false,
  };
}

/**
 * Computes one methodology's implied valuation for the target company.
 * `medianMultiple` is the peer statistic to apply (the caller decides
 * raw vs. outlier-adjusted — see engine.ts, which always uses the adjusted
 * median). Not meaningful whenever the target's own base metric is missing
 * or non-positive (the same N/M convention used for the multiples
 * themselves, applied to the target side of the equation) or the peer
 * median itself couldn't be computed.
 */
export function computeImpliedValuationRow(
  methodology: MultipleKey,
  target: CompanyValuationMetrics,
  medianMultiple: number | null,
): ImpliedValuationRow {
  const targetMetric = targetMetricFor(methodology, target);

  if (targetMetric === null || targetMetric <= 0 || medianMultiple === null) {
    return notMeaningfulRow(methodology, medianMultiple);
  }

  if (methodology === 'peRatio') {
    // P/E goes directly to equity value — there is no enterprise-value step.
    const impliedEquityValue = targetMetric * medianMultiple;
    const impliedSharePrice = computeImpliedSharePrice(impliedEquityValue, target.dilutedSharesOutstanding);
    // Reversing the equity bridge (EquityValue = EV + Cash - Debt) purely for
    // display symmetry with the EV-based rows — not an independent estimate.
    const impliedEnterpriseValue =
      target.cash !== null && target.totalDebt !== null
        ? impliedEquityValue - target.cash + target.totalDebt
        : null;

    return {
      methodology,
      label: METHODOLOGY_LABELS[methodology],
      medianMultiple,
      impliedEnterpriseValue,
      impliedEquityValue,
      impliedSharePrice,
      upsideDownside: computeUpsideDownside(impliedSharePrice, target.price),
      isMeaningful: impliedSharePrice !== null,
    };
  }

  const impliedEnterpriseValue = targetMetric * medianMultiple;
  const impliedEquityValue = computeEquityValue(impliedEnterpriseValue, target.cash, target.totalDebt);
  const impliedSharePrice = computeImpliedSharePrice(impliedEquityValue, target.dilutedSharesOutstanding);

  return {
    methodology,
    label: METHODOLOGY_LABELS[methodology],
    medianMultiple,
    impliedEnterpriseValue,
    impliedEquityValue,
    impliedSharePrice,
    upsideDownside: computeUpsideDownside(impliedSharePrice, target.price),
    isMeaningful: impliedSharePrice !== null,
  };
}

const ALL_METHODOLOGIES: MultipleKey[] = ['evToRevenue', 'evToEbitda', 'evToEbit', 'peRatio'];

export function computeAllImpliedValuationRows(
  target: CompanyValuationMetrics,
  medianMultiples: Record<MultipleKey, number | null>,
): ImpliedValuationRow[] {
  return ALL_METHODOLOGIES.map((methodology) =>
    computeImpliedValuationRow(methodology, target, medianMultiples[methodology]),
  );
}

/** The median across every *meaningful* methodology's implied share price —
 * never a blend/average of methodologies, and never includes a row that
 * wasn't meaningful in the first place. */
export function computeMedianImpliedSharePrice(rows: ImpliedValuationRow[]): number | null {
  const prices = rows
    .filter((row) => row.isMeaningful && row.impliedSharePrice !== null)
    .map((row) => row.impliedSharePrice as number);
  return median(prices);
}
