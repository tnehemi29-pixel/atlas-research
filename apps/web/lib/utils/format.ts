export function formatPrice(value: number | null): string {
  if (value === null) return '—';
  return `$${value.toFixed(2)}`;
}

export function formatPercent(value: number | null): string {
  if (value === null) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

/** Compact "1.23B" style scaling shared by every large-number formatter below
 * — market cap, dollar financial-statement lines, and raw share counts all
 * use the same T/B/M scaling, they just differ in the prefix/suffix. */
export function formatCompactNumber(value: number | null): string {
  if (value === null) return '—';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(2)}M`;
  return `${sign}${abs.toLocaleString()}`;
}

/** Compact "$1.23B" style formatting for large dollar figures — shared by
 * market cap (M2) and every financial-statement line item (M3/M4) so the two
 * don't duplicate the same scaling logic. */
export function formatCompactCurrency(value: number | null): string {
  if (value === null) return '—';
  return value < 0 ? `-$${formatCompactNumber(-value)}` : `$${formatCompactNumber(value)}`;
}

export function formatMarketCap(value: number | null): string {
  return formatCompactCurrency(value);
}

/** Raw share counts (basic/diluted shares outstanding) — same scaling as
 * currency, no $ prefix. */
export function formatShares(value: number | null): string {
  return formatCompactNumber(value);
}

/** Formats a ratio (0.15) as a percent string ("+15.00%") — the bridge
 * between lib/analytics/ratios.ts's ratio convention and formatPercent's
 * already-scaled-percent convention, kept in one place rather than
 * scattered `* 100` calls at every call site. */
export function formatRatioAsPercent(ratio: number | null): string {
  return formatPercent(ratio === null ? null : ratio * 100);
}

/** "10.0x" style formatting for valuation multiples (exit EV/EBITDA, etc.). */
export function formatMultiple(value: number | null): string {
  if (value === null) return '—';
  return `${value.toFixed(1)}x`;
}

/** Formats a comps-engine `Multiple` ({ value, status }) — "N/M" (Not
 * Meaningful) and "—" (missing data) are structurally distinct outcomes on
 * the type, not both collapsed into a bare null, so this never has to guess
 * which one applies. */
export function formatMultipleOrNM(multiple: { value: number | null; status: string }): string {
  if (multiple.status === 'notMeaningful') return 'N/M';
  return formatMultiple(multiple.value);
}

export function formatUpdatedAt(iso: string | null): string {
  if (!iso) return 'unknown';
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** A plain date, no time — filing dates, period-end dates. */
export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}
