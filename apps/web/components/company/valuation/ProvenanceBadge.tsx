import type { AssumptionSource } from '@/lib/valuation/types';

/** Renders a Tagged<T>'s provenance as a small colored badge — the visual
 * half of "clearly distinguish ACTUAL / ESTIMATE / USER ASSUMPTION /
 * CALCULATED" (the textual half is the `note` shown as a title tooltip). */

const LABEL: Record<AssumptionSource, string> = {
  actual: 'Actual',
  estimate: 'Estimate',
  calculated: 'Calculated',
  user: 'User',
};

const STYLE: Record<AssumptionSource, string> = {
  actual: 'border-emerald-300 bg-emerald-50 text-emerald-700',
  estimate: 'border-amber-300 bg-amber-50 text-amber-700',
  calculated: 'border-sky-300 bg-sky-50 text-sky-700',
  user: 'border-violet-300 bg-violet-50 text-violet-700',
};

export function ProvenanceBadge({ source, note }: { source: AssumptionSource; note?: string }) {
  return (
    <span
      title={note}
      className={`rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STYLE[source]}`}
    >
      {LABEL[source]}
    </span>
  );
}
