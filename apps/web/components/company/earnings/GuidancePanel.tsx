import type { GuidanceObservationResponse } from '@/lib/api/earnings';

/**
 * "Guidance" — low/high are extracted from spoken language by the AI, but
 * midpoint and the increased/decreased/maintained/new label are always
 * computed deterministically (see lib/earnings/guidance.ts) — the model
 * never does that arithmetic itself.
 */
const CHANGE_LABEL: Record<string, string> = {
  INCREASED: 'Guidance increased',
  DECREASED: 'Guidance decreased',
  MAINTAINED: 'Guidance maintained',
  NEW: 'New guidance',
};

const CHANGE_STYLE: Record<string, string> = {
  INCREASED: 'border-emerald-300 bg-emerald-50 text-emerald-700',
  DECREASED: 'border-red-300 bg-red-50 text-red-700',
  MAINTAINED: 'border-ink/15 bg-ink/5 text-ink/60',
  NEW: 'border-accent/30 bg-accent-soft text-accent',
};

function formatValue(value: number | null): string {
  if (value === null) return '—';
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatRange(low: number | null, high: number | null): string {
  if (low === null && high === null) return '—';
  if (low !== null && high !== null && low !== high) return `${formatValue(low)}–${formatValue(high)}`;
  return formatValue(low ?? high);
}

interface GuidancePanelProps {
  observations: GuidanceObservationResponse[];
}

export function GuidancePanel({ observations }: GuidancePanelProps) {
  if (observations.length === 0) {
    return <p className="text-ink/40 text-xs">No forward-looking guidance was identified on this call.</p>;
  }

  return (
    <div className="space-y-3">
      {observations.map((g) => (
        <div key={g.id} className="border-ink/10 bg-paper rounded-xl border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-ink text-sm font-semibold">{g.metricLabel}</span>
              <span className="text-ink/40 ml-2 text-xs">{g.period}</span>
            </div>
            <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${CHANGE_STYLE[g.change] ?? ''}`}>
              {CHANGE_LABEL[g.change] ?? g.change}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs">
            <span className="text-ink/60">
              Current: <span className="text-ink font-mono">{formatRange(g.low, g.high)}</span>
              {g.midpoint !== null && <span className="text-ink/40"> (mid {formatValue(g.midpoint)})</span>}
            </span>
            {g.priorMidpoint !== null && (
              <span className="text-ink/60">
                Prior: <span className="text-ink font-mono">{formatRange(g.priorLow, g.priorHigh)}</span>
                <span className="text-ink/40"> (mid {formatValue(g.priorMidpoint)})</span>
              </span>
            )}
          </div>
          <p className="text-ink/60 mt-2 text-xs italic">&ldquo;{g.sourceExcerpt}&rdquo;</p>
        </div>
      ))}
    </div>
  );
}
