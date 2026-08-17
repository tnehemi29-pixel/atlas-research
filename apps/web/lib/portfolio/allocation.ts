/**
 * Sector/industry allocation grouping — pure, no I/O. Reused by
 * portfolioService.ts for both sector and industry breakdowns (same
 * function, different label extractor), so the two never drift into
 * slightly different concentration math.
 */

/** Above this weight, a slice is flagged for the neutral "high
 * concentration relative to the rest of the portfolio" note — never framed
 * as objectively bad, per the milestone spec. Documented here (not buried
 * in a UI string) so the threshold is one visible, adjustable constant. */
export const CONCENTRATION_THRESHOLD = 0.35;

export interface AllocationSlice {
  label: string;
  marketValue: number;
  weight: number;
  isConcentrated: boolean;
}

export function computeAllocation(holdings: Array<{ label: string | null; marketValue: number | null }>): AllocationSlice[] {
  const totals = new Map<string, number>();
  let total = 0;

  for (const holding of holdings) {
    if (holding.marketValue === null || holding.marketValue <= 0) continue;
    const label = holding.label ?? 'Unclassified';
    totals.set(label, (totals.get(label) ?? 0) + holding.marketValue);
    total += holding.marketValue;
  }

  if (total === 0) return [];

  return [...totals.entries()]
    .map(([label, marketValue]) => ({
      label,
      marketValue,
      weight: marketValue / total,
      isConcentrated: marketValue / total > CONCENTRATION_THRESHOLD,
    }))
    .sort((a, b) => b.marketValue - a.marketValue);
}
