import type { InvestmentAssumptionMetric } from '@prisma/client';

/** Human-readable labels for the metric enum — shared between the server
 * (snapshot assembly, memo content) and the client UI so a label never
 * drifts between the two. */
export const ASSUMPTION_METRIC_LABELS: Record<InvestmentAssumptionMetric, string> = {
  REVENUE_GROWTH: 'Revenue Growth',
  REVENUE_CAGR: 'Revenue CAGR',
  OPERATING_MARGIN: 'Operating Margin',
  FCF_MARGIN: 'FCF Margin',
  WACC: 'WACC',
  TERMINAL_GROWTH: 'Terminal Growth',
  EXIT_MULTIPLE: 'Exit Multiple',
  EPS_GROWTH: 'EPS Growth',
  DEBT: 'Debt',
  SHARE_COUNT: 'Share Count',
};
