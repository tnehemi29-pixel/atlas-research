'use client';

import type { DcfResult } from '@/lib/valuation/types';
import type { ScenarioDeltas } from '@/lib/valuation/scenarios';
import { formatCompactCurrency, formatPercent, formatPrice, formatRatioAsPercent } from '@/lib/utils/format';
import { PercentField } from './fields';

interface ScenarioColumn {
  key: 'bear' | 'base' | 'bull';
  label: string;
  result: DcfResult;
  accent: string;
}

interface ScenarioPanelProps {
  base: DcfResult;
  bear: DcfResult;
  bull: DcfResult;
  bearDeltas: ScenarioDeltas;
  bullDeltas: ScenarioDeltas;
  onChangeBearDeltas: (deltas: ScenarioDeltas) => void;
  onChangeBullDeltas: (deltas: ScenarioDeltas) => void;
}

function ScenarioRow({ label, values }: { label: string; values: [string, string, string] }) {
  return (
    <tr className="border-ink/5 border-b last:border-0">
      <td className="text-ink/70 px-4 py-2.5 text-xs">{label}</td>
      {values.map((value, i) => (
        <td key={i} className="text-ink px-4 py-2.5 text-right font-mono text-sm tabular-nums">
          {value}
        </td>
      ))}
    </tr>
  );
}

export function ScenarioPanel({ base, bear, bull, bearDeltas, bullDeltas, onChangeBearDeltas, onChangeBullDeltas }: ScenarioPanelProps) {
  const columns: ScenarioColumn[] = [
    { key: 'bear', label: 'Bear', result: bear, accent: 'text-red-700' },
    { key: 'base', label: 'Base', result: base, accent: 'text-ink' },
    { key: 'bull', label: 'Bull', result: bull, accent: 'text-emerald-700' },
  ];

  return (
    <section className="mt-8">
      <h2 className="text-ink font-serif text-lg font-semibold">Scenarios</h2>
      <p className="text-ink/50 mt-1 text-xs">
        Bear and Bull apply an editable delta on top of the Base case&apos;s own assumptions —
        shifting resolved revenue growth, EBIT margin, and the equity risk premium (which flows
        into WACC). They are not independently re-forecast from scratch, so a change to any Base
        assumption above automatically carries through to both.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="border-ink/10 bg-paper rounded-xl border p-4">
          <h3 className="text-sm font-semibold text-red-700">Bear Case Deltas</h3>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <PercentField label="Growth" value={bearDeltas.revenueGrowthDelta} onChange={(v) => onChangeBearDeltas({ ...bearDeltas, revenueGrowthDelta: v })} />
            <PercentField label="Margin" value={bearDeltas.marginDelta} onChange={(v) => onChangeBearDeltas({ ...bearDeltas, marginDelta: v })} />
            <PercentField label="ERP" value={bearDeltas.equityRiskPremiumDelta} onChange={(v) => onChangeBearDeltas({ ...bearDeltas, equityRiskPremiumDelta: v })} />
          </div>
        </div>
        <div className="border-ink/10 bg-paper rounded-xl border p-4">
          <h3 className="text-sm font-semibold text-emerald-700">Bull Case Deltas</h3>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <PercentField label="Growth" value={bullDeltas.revenueGrowthDelta} onChange={(v) => onChangeBullDeltas({ ...bullDeltas, revenueGrowthDelta: v })} />
            <PercentField label="Margin" value={bullDeltas.marginDelta} onChange={(v) => onChangeBullDeltas({ ...bullDeltas, marginDelta: v })} />
            <PercentField label="ERP" value={bullDeltas.equityRiskPremiumDelta} onChange={(v) => onChangeBullDeltas({ ...bullDeltas, equityRiskPremiumDelta: v })} />
          </div>
        </div>
      </div>

      <div className="border-ink/10 mt-4 overflow-x-auto rounded-xl border">
        <table className="w-full min-w-max border-collapse text-sm">
          <thead>
            <tr className="border-ink/10 bg-paper border-b">
              <th className="text-ink/40 px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide">
                Output
              </th>
              {columns.map((column) => (
                <th key={column.key} className={`px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide ${column.accent}`}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <ScenarioRow
              label="WACC"
              values={columns.map((c) => formatRatioAsPercent(c.result.wacc.wacc.value)) as [string, string, string]}
            />
            <ScenarioRow
              label="Enterprise Value"
              values={columns.map((c) => formatCompactCurrency(c.result.enterpriseValue)) as [string, string, string]}
            />
            <ScenarioRow
              label="Equity Value"
              values={columns.map((c) => formatCompactCurrency(c.result.equityValue)) as [string, string, string]}
            />
            <ScenarioRow
              label="Implied Share Price"
              values={columns.map((c) => formatPrice(c.result.impliedSharePrice)) as [string, string, string]}
            />
            <ScenarioRow
              label="Upside / Downside"
              values={
                columns.map((c) =>
                  formatPercent(c.result.upsideDownside === null ? null : c.result.upsideDownside * 100),
                ) as [string, string, string]
              }
            />
          </tbody>
        </table>
      </div>
    </section>
  );
}
