'use client';

import { useEffect, useState } from 'react';
import { fetchThesisMonitor, type ThesisMonitorResponse } from '@/lib/api/researchEvents';
import { formatResearchEventValue } from '@/lib/utils/researchEventDisplay';

/** Spec sections 13-14: the report's structurally-extracted assumptions,
 * each compared against the best currently-available live observation.
 * "Potentially inconsistent with a prior research assumption" — never
 * "thesis broken," and the underlying model is never touched by this
 * panel. Loads client-side (rather than blocking the report's own SSR)
 * since it's an independent, optional cross-check on top of the report. */
export function ThesisMonitorPanel({ ticker }: { ticker: string }) {
  const [monitor, setMonitor] = useState<ThesisMonitorResponse | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetchThesisMonitor(ticker)
      .then((result) => {
        if (!cancelled) setMonitor(result);
      })
      .catch(() => {
        if (!cancelled) setMonitor(null);
      });
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  if (monitor === undefined) {
    return (
      <section className="border-ink/10 bg-paper mt-8 rounded-xl border p-4 print:hidden">
        <h2 className="text-ink font-serif text-lg font-medium">Research Thesis Monitor</h2>
        <p className="text-ink/40 mt-2 text-sm">Loading…</p>
      </section>
    );
  }

  if (!monitor || monitor.assumptions.length === 0) return null;

  return (
    <section className="border-ink/10 bg-paper mt-8 rounded-xl border p-4 print:hidden">
      <h2 className="text-ink font-serif text-lg font-medium">Research Thesis Monitor</h2>
      <p className="text-ink/50 mt-1 text-sm">
        Key assumptions extracted from report version {monitor.reportVersion}, compared against the best currently-available live
        data. A flag means a live observation has drifted from what this report originally assumed — it is a prompt to
        re-examine the thesis, not a verdict on it. The underlying model is never modified automatically.
      </p>

      <ul className="mt-4 divide-y divide-black/5">
        {monitor.assumptions.map((assumption) => (
          <li key={assumption.key} className="py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-ink text-sm font-medium">{assumption.label}</p>
              {assumption.latestComparison && (
                <span
                  className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    assumption.latestComparison.flagged ? 'border-orange-300 bg-orange-50 text-orange-800' : 'border-ink/15 bg-ink/5 text-ink/50'
                  }`}
                >
                  {assumption.latestComparison.flagged ? 'Flagged' : 'Consistent'}
                </span>
              )}
            </div>
            <p className="text-ink/60 mt-0.5 text-xs">Assumed: {formatResearchEventValue(assumption.unit, assumption.originalValue)} · {assumption.extractedFrom}</p>
            {assumption.latestComparison ? (
              <p className="text-ink/70 mt-1 text-sm">
                {assumption.latestComparison.note} (now {formatResearchEventValue(assumption.unit, assumption.latestComparison.newValue)})
              </p>
            ) : (
              <p className="text-ink/40 mt-1 text-sm">No comparable live data available yet.</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
