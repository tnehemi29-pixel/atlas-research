'use client';

import type { DcfAssumptions, DcfMarketData, DcfResult, TerminalValueMethod } from '@/lib/valuation/types';
import { formatCompactCurrency, formatMultiple, formatPrice, formatRatioAsPercent, formatShares } from '@/lib/utils/format';
import { NumberField, PercentField, SelectField } from './fields';
import { ProvenanceBadge } from './ProvenanceBadge';

const TV_METHODS: ReadonlyArray<{ value: TerminalValueMethod; label: string }> = [
  { value: 'perpetuityGrowth', label: 'Perpetuity Growth' },
  { value: 'exitMultiple', label: 'Exit Multiple (EV/EBITDA)' },
];

interface ForecastRow {
  key: string;
  label: string;
  get: (year: DcfResult['forecast'][number]) => number;
  format: (value: number) => string;
  emphasis?: boolean;
}

const FORECAST_ROWS: ForecastRow[] = [
  { key: 'revenue', label: 'Revenue', get: (y) => y.revenue, format: formatCompactCurrency, emphasis: true },
  { key: 'revenueGrowth', label: 'Revenue growth', get: (y) => y.revenueGrowth, format: formatRatioAsPercent },
  { key: 'ebitMargin', label: 'EBIT margin', get: (y) => y.ebitMargin, format: formatRatioAsPercent },
  { key: 'ebit', label: 'EBIT', get: (y) => y.ebit, format: formatCompactCurrency },
  { key: 'taxes', label: 'Taxes on EBIT', get: (y) => y.ebit * y.taxRate, format: formatCompactCurrency },
  { key: 'nopat', label: 'NOPAT', get: (y) => y.nopat, format: formatCompactCurrency },
  { key: 'da', label: '+ D&A', get: (y) => y.da, format: formatCompactCurrency },
  { key: 'capex', label: '- CapEx', get: (y) => y.capex, format: formatCompactCurrency },
  { key: 'changeInNwc', label: '- Change in NWC', get: (y) => y.changeInNwc, format: formatCompactCurrency },
  { key: 'fcf', label: 'Unlevered FCF', get: (y) => y.unleveredFcf, format: formatCompactCurrency, emphasis: true },
  { key: 'discountFactor', label: 'Discount factor', get: (y) => y.discountFactor, format: (v) => v.toFixed(3) },
  { key: 'pv', label: 'PV of FCF', get: (y) => y.presentValueOfFcf, format: formatCompactCurrency, emphasis: true },
];

function BridgeRow({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-1.5 ${emphasis ? 'border-ink/10 border-t pt-2' : ''}`}>
      <span className={`text-xs ${emphasis ? 'text-ink font-semibold' : 'text-ink/60'}`}>{label}</span>
      <span className={`font-mono tabular-nums ${emphasis ? 'text-ink text-sm font-semibold' : 'text-ink text-sm'}`}>
        {value}
      </span>
    </div>
  );
}

interface DcfOutputTableProps {
  assumptions: DcfAssumptions;
  onChange: (next: DcfAssumptions) => void;
  result: DcfResult;
  marketData: DcfMarketData;
}

export function DcfOutputTable({ assumptions, onChange, result, marketData }: DcfOutputTableProps) {
  const tv = assumptions.terminalValue;

  function updateTv(patch: Partial<DcfAssumptions['terminalValue']>) {
    onChange({ ...assumptions, terminalValue: { ...tv, ...patch } });
  }

  return (
    <section className="mt-8">
      <h2 className="text-ink font-serif text-lg font-semibold">DCF Output</h2>

      {result.forecast.length > 0 ? (
        <div className="border-ink/10 mt-3 overflow-x-auto rounded-xl border">
          <table className="w-full min-w-max border-collapse text-sm">
            <thead>
              <tr className="border-ink/10 bg-paper border-b">
                <th className="bg-paper text-ink/40 sticky left-0 min-w-[180px] px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide">
                  Line item
                </th>
                {result.forecast.map((year) => (
                  <th
                    key={year.fiscalYear}
                    className="text-ink/60 min-w-[92px] px-4 py-2.5 text-right font-mono text-xs font-medium"
                  >
                    FY{year.fiscalYear}E
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FORECAST_ROWS.map((row) => (
                <tr key={row.key} className="border-ink/5 border-b last:border-0">
                  <td
                    className={`bg-paper sticky left-0 px-4 py-2.5 ${row.emphasis ? 'text-ink font-semibold' : 'text-ink/80'}`}
                  >
                    {row.label}
                  </td>
                  {result.forecast.map((year) => {
                    const value = row.get(year);
                    return (
                      <td
                        key={year.fiscalYear}
                        className={`px-4 py-2.5 text-right font-mono tabular-nums ${
                          row.emphasis ? 'text-ink font-semibold' : 'text-ink'
                        } ${value < 0 ? 'text-red-700' : ''}`}
                      >
                        {row.format(value)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="border-ink/10 bg-paper text-ink/50 mt-3 rounded-xl border p-6 text-center text-sm">
          The forecast can&apos;t be computed — see the issues above.
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="border-ink/10 bg-paper rounded-xl border p-4">
          <h3 className="text-ink text-sm font-semibold">Terminal Value</h3>
          <div className="mt-3 flex flex-col gap-3">
            <SelectField label="Method" value={tv.method} options={TV_METHODS} onChange={(method) => updateTv({ method })} />
            {tv.method === 'perpetuityGrowth' ? (
              <PercentField
                label="Long-Term Growth Rate (g)"
                value={tv.perpetuityGrowthRate}
                onChange={(value) => updateTv({ perpetuityGrowthRate: value })}
              />
            ) : (
              <NumberField
                label="Exit EV/EBITDA Multiple"
                step={0.5}
                suffix="x"
                value={tv.exitMultiple}
                onChange={(value) => updateTv({ exitMultiple: value })}
              />
            )}
          </div>
          <div className="divide-ink/5 mt-3 divide-y">
            <BridgeRow label="Undiscounted Terminal Value" value={formatCompactCurrency(result.terminalValue.undiscountedValue)} />
            <BridgeRow label="PV of Terminal Value" value={formatCompactCurrency(result.terminalValue.presentValue)} emphasis />
            {result.terminalValue.impliedExitMultiple !== null && (
              <BridgeRow label="Implied Exit Multiple (cross-check)" value={formatMultiple(result.terminalValue.impliedExitMultiple)} />
            )}
            {result.terminalValue.impliedPerpetuityGrowth !== null && (
              <BridgeRow label="Implied Perpetuity Growth (cross-check)" value={formatRatioAsPercent(result.terminalValue.impliedPerpetuityGrowth)} />
            )}
          </div>
        </div>

        <div className="border-ink/10 bg-paper rounded-xl border p-4">
          <h3 className="text-ink text-sm font-semibold">Enterprise Value → Implied Share Price</h3>
          <div className="divide-ink/5 mt-3 divide-y">
            <BridgeRow label="PV of Forecast FCF" value={formatCompactCurrency(result.pvOfForecastFcf)} />
            <BridgeRow label="+ PV of Terminal Value" value={formatCompactCurrency(result.terminalValue.presentValue)} />
            <BridgeRow label="= Enterprise Value" value={formatCompactCurrency(result.enterpriseValue)} emphasis />
          </div>
          <div className="mt-2 flex items-center justify-between py-1">
            <span className="text-ink/60 text-xs">+ Cash</span>
            <div className="flex items-center gap-2">
              <span className="text-ink font-mono text-sm tabular-nums">{formatCompactCurrency(marketData.cash)}</span>
              <ProvenanceBadge source="actual" note="Latest balance sheet" />
            </div>
          </div>
          <div className="flex items-center justify-between py-1">
            <span className="text-ink/60 text-xs">− Total Debt</span>
            <div className="flex items-center gap-2">
              <span className="text-ink font-mono text-sm tabular-nums">{formatCompactCurrency(marketData.totalDebt)}</span>
              <ProvenanceBadge source="actual" note="Latest balance sheet" />
            </div>
          </div>
          <div className="divide-ink/5 mt-1 divide-y">
            <BridgeRow label="= Equity Value" value={formatCompactCurrency(result.equityValue)} emphasis />
          </div>
          <div className="mt-2 flex items-center justify-between py-1">
            <span className="text-ink/60 text-xs">÷ Diluted Shares Outstanding</span>
            <div className="flex items-center gap-2">
              <span className="text-ink font-mono text-sm tabular-nums">{formatShares(marketData.dilutedSharesOutstanding)}</span>
              <ProvenanceBadge source="actual" note="Latest 10-K/10-Q" />
            </div>
          </div>
          <div className="border-ink/10 mt-3 flex items-center justify-between border-t pt-3">
            <span className="text-ink text-sm font-semibold">Implied Share Price</span>
            <span className="text-ink font-mono text-lg font-semibold tabular-nums">
              {formatPrice(result.impliedSharePrice)}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
