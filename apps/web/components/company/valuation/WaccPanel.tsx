'use client';

import type { DcfAssumptions, DcfMarketData, RateMethod, WaccResult } from '@/lib/valuation/types';
import { formatCompactCurrency, formatRatioAsPercent } from '@/lib/utils/format';
import { NumberField, PercentField, SelectField } from './fields';
import { ProvenanceBadge } from './ProvenanceBadge';

const COST_OF_DEBT_METHODS: ReadonlyArray<{ value: RateMethod; label: string }> = [
  { value: 'historical', label: 'Calculated (interest expense / total debt)' },
  { value: 'user', label: 'User-Defined' },
];

interface WaccPanelProps {
  assumptions: DcfAssumptions;
  onChange: (next: DcfAssumptions) => void;
  wacc: WaccResult;
  /** The raw, un-overridden market data — used only to decide whether the
   * market-cap override field should be visible (when the retrieved value
   * is null) and to seed a sensible starting label, independent of whatever
   * value `wacc.marketCapitalization` currently resolves to. */
  marketData: DcfMarketData;
}

function OutputRow({
  label,
  value,
  source,
  note,
}: {
  label: string;
  value: string;
  source: WaccResult['wacc']['source'];
  note?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-ink/60 text-xs">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-ink font-mono text-sm tabular-nums">{value}</span>
        <ProvenanceBadge source={source} note={note} />
      </div>
    </div>
  );
}

export function WaccPanel({ assumptions, onChange, wacc, marketData }: WaccPanelProps) {
  const w = assumptions.wacc;

  function update(patch: Partial<DcfAssumptions['wacc']>) {
    onChange({ ...assumptions, wacc: { ...w, ...patch } });
  }

  return (
    <section className="mt-8">
      <h2 className="text-ink font-serif text-lg font-semibold">WACC</h2>
      <p className="text-ink/50 mt-1 text-xs">
        Cost of Equity = Risk-Free Rate + Beta x Equity Risk Premium. WACC = (Equity Weight x Cost
        of Equity) + (Debt Weight x After-Tax Cost of Debt). Nothing here is fabricated — market
        inputs are retrieved where available and otherwise left for you to enter.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="border-ink/10 bg-paper rounded-xl border p-4">
          <h3 className="text-ink text-sm font-semibold">Inputs</h3>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <PercentField
              label="Risk-Free Rate"
              value={w.riskFreeRate}
              onChange={(value) => update({ riskFreeRate: value })}
            />
            <PercentField
              label="Equity Risk Premium"
              value={w.equityRiskPremium}
              onChange={(value) => update({ equityRiskPremium: value })}
            />
            <NumberField
              label="Beta"
              step={0.05}
              value={w.beta}
              onChange={(value) => update({ beta: value, betaSource: 'user' })}
            />
            <SelectField
              label="Cost of Debt Method"
              value={w.costOfDebtMethod}
              options={COST_OF_DEBT_METHODS}
              onChange={(method) => update({ costOfDebtMethod: method })}
            />
            {(w.costOfDebtMethod === 'user' || wacc.preTaxCostOfDebt.value === null) && (
              <PercentField
                label={
                  w.costOfDebtMethod === 'historical'
                    ? 'Pre-Tax Cost of Debt (not broken out in this company’s filings — enter it to unblock WACC)'
                    : 'Pre-Tax Cost of Debt'
                }
                value={w.costOfDebtUser}
                onChange={(value) => update({ costOfDebtUser: value, costOfDebtMethod: 'user' })}
              />
            )}
          </div>
          <p className="text-ink/40 mt-3 text-xs">
            Beta {assumptions.wacc.betaSource === 'estimate' ? 'was retrieved from Financial Modeling Prep' : 'is a user assumption'}
            {' — '}editing it always switches to a user assumption.
          </p>

          {(marketData.marketCapitalization === null || w.marketCapOverride != null) && (
            <div className="border-ink/10 mt-4 border-t pt-4">
              <NumberField
                label={
                  marketData.marketCapitalization === null
                    ? 'Market Capitalization (not available from the data provider — enter it to unblock WACC)'
                    : 'Market Capitalization (override)'
                }
                prefix="$"
                step={1_000_000}
                value={w.marketCapOverride ?? 0}
                onChange={(value) => update({ marketCapOverride: value })}
              />
            </div>
          )}
        </div>

        <div className="border-ink/10 bg-paper rounded-xl border p-4">
          <h3 className="text-ink text-sm font-semibold">Calculation</h3>
          <div className="divide-ink/5 mt-2 divide-y">
            <OutputRow label="Risk-Free Rate" value={formatRatioAsPercent(wacc.riskFreeRate.value)} source={wacc.riskFreeRate.source} note={wacc.riskFreeRate.note} />
            <OutputRow label="Equity Risk Premium" value={formatRatioAsPercent(wacc.equityRiskPremium.value)} source={wacc.equityRiskPremium.source} note={wacc.equityRiskPremium.note} />
            <OutputRow label="Beta" value={wacc.beta.value.toFixed(2)} source={wacc.beta.source} note={wacc.beta.note} />
            <OutputRow label="Cost of Equity" value={formatRatioAsPercent(wacc.costOfEquity.value)} source={wacc.costOfEquity.source} note={wacc.costOfEquity.note} />
            <OutputRow label="Pre-Tax Cost of Debt" value={formatRatioAsPercent(wacc.preTaxCostOfDebt.value)} source={wacc.preTaxCostOfDebt.source} note={wacc.preTaxCostOfDebt.note} />
            <OutputRow label="Effective Tax Rate" value={formatRatioAsPercent(wacc.effectiveTaxRate.value)} source={wacc.effectiveTaxRate.source} note={wacc.effectiveTaxRate.note} />
            <OutputRow label="After-Tax Cost of Debt" value={formatRatioAsPercent(wacc.afterTaxCostOfDebt.value)} source={wacc.afterTaxCostOfDebt.source} note={wacc.afterTaxCostOfDebt.note} />
            <OutputRow label="Market Capitalization" value={formatCompactCurrency(wacc.marketCapitalization.value)} source={wacc.marketCapitalization.source} note={wacc.marketCapitalization.note} />
            <OutputRow label="Total Debt" value={formatCompactCurrency(wacc.totalDebt.value)} source={wacc.totalDebt.source} note={wacc.totalDebt.note} />
            <OutputRow label="Equity Weight" value={formatRatioAsPercent(wacc.equityWeight.value)} source={wacc.equityWeight.source} note={wacc.equityWeight.note} />
            <OutputRow label="Debt Weight" value={formatRatioAsPercent(wacc.debtWeight.value)} source={wacc.debtWeight.source} note={wacc.debtWeight.note} />
          </div>
          <div className="border-ink/10 mt-3 flex items-center justify-between border-t pt-3">
            <span className="text-ink text-sm font-semibold">WACC</span>
            <div className="flex items-center gap-2">
              <span className="text-ink font-mono text-lg font-semibold tabular-nums">
                {formatRatioAsPercent(wacc.wacc.value)}
              </span>
              <ProvenanceBadge source={wacc.wacc.source} note={wacc.wacc.note} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
