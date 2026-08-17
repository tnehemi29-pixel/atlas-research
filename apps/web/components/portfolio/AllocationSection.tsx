import type { AllocationSliceResponse } from '@/lib/api/portfolio';
import { formatCompactCurrency, formatRatioAsPercent } from '@/lib/utils/format';

/** A plain horizontal bar list, not a pie/donut chart — "avoid overly
 * decorative charts," per the milestone spec. One neutral color (magnitude
 * only, not categorical identity) keeps the reader's attention on the
 * numbers, not the palette. */
function AllocationList({ title, slices }: { title: string; slices: AllocationSliceResponse[] }) {
  if (slices.length === 0) {
    return (
      <div>
        <p className="text-ink/40 mb-2 text-[10px] font-medium uppercase tracking-wide">{title}</p>
        <p className="text-ink/50 text-sm">No allocation data available yet.</p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-ink/40 mb-2 text-[10px] font-medium uppercase tracking-wide">{title}</p>
      <ul className="space-y-2">
        {slices.map((slice) => (
          <li key={slice.label}>
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-ink font-medium">{slice.label}</span>
              <span className="text-ink/60">
                {formatRatioAsPercent(slice.weight)} · {formatCompactCurrency(slice.marketValue)}
              </span>
            </div>
            <div className="bg-accent-soft mt-1 h-2 overflow-hidden rounded-full">
              <div className="bg-accent h-full rounded-full" style={{ width: `${Math.min(slice.weight * 100, 100)}%` }} />
            </div>
            {slice.isConcentrated && <p className="text-ink/50 mt-1 text-xs">High concentration relative to the rest of the portfolio.</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AllocationSection({ sectorAllocation, industryAllocation }: { sectorAllocation: AllocationSliceResponse[]; industryAllocation: AllocationSliceResponse[] }) {
  return (
    <section>
      <h2 className="text-ink font-serif text-lg font-medium">Allocation</h2>
      <div className="mt-3 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <AllocationList title="By Sector" slices={sectorAllocation} />
        <AllocationList title="By Industry" slices={industryAllocation} />
      </div>
    </section>
  );
}
