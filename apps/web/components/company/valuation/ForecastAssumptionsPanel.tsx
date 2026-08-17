'use client';

import type {
  DcfAssumptions,
  DriverAssumptions,
  DriverMethod,
  ForecastHorizon,
  MarginAssumptions,
  MarginMethod,
  RateMethod,
  RevenueAssumptions,
  RevenueForecastMethod,
  TaxAssumptions,
} from '@/lib/valuation/types';
import type { HistoricalAverages } from '@/lib/valuation/historicalAverages';
import { formatRatioAsPercent } from '@/lib/utils/format';
import { NumberField, PercentField, SelectField } from './fields';

const HORIZON_OPTIONS: ReadonlyArray<{ value: '3' | '5' | '7' | '10'; label: string }> = [
  { value: '3', label: '3 years' },
  { value: '5', label: '5 years' },
  { value: '7', label: '7 years' },
  { value: '10', label: '10 years' },
];

const REVENUE_METHODS: ReadonlyArray<{ value: RevenueForecastMethod; label: string }> = [
  { value: 'historicalGrowth', label: 'Historical Growth' },
  { value: 'userGrowth', label: 'User Assumption (per year)' },
  { value: 'fade', label: 'Fade to Normalized Rate' },
];

const MARGIN_METHODS: ReadonlyArray<{ value: MarginMethod; label: string }> = [
  { value: 'historicalAverage', label: 'Historical Average' },
  { value: 'user', label: 'User-Defined' },
  { value: 'gradual', label: 'Gradual Expansion / Contraction' },
];

const RATE_METHODS: ReadonlyArray<{ value: RateMethod; label: string }> = [
  { value: 'historical', label: 'Historical' },
  { value: 'user', label: 'User-Defined' },
];

const DRIVER_METHODS: ReadonlyArray<{ value: DriverMethod; label: string }> = [
  { value: 'historicalAverage', label: 'Historical Average % of Revenue' },
  { value: 'percentOfRevenue', label: 'User % of Revenue' },
  { value: 'flatAmount', label: 'Flat $ Amount' },
];

function referenceNote(label: string, value: number | null): string {
  return `${label}: ${formatRatioAsPercent(value)}`;
}

interface ForecastAssumptionsPanelProps {
  assumptions: DcfAssumptions;
  onChange: (next: DcfAssumptions) => void;
  averages: HistoricalAverages;
}

export function ForecastAssumptionsPanel({ assumptions, onChange, averages }: ForecastAssumptionsPanelProps) {
  const years = Array.from({ length: assumptions.forecastYears }, (_, i) => i + 1);

  function updateRevenue(patch: Partial<RevenueAssumptions>) {
    onChange({ ...assumptions, revenue: { ...assumptions.revenue, ...patch } });
  }
  function updateMargin(patch: Partial<MarginAssumptions>) {
    onChange({ ...assumptions, margin: { ...assumptions.margin, ...patch } });
  }
  function updateTax(patch: Partial<TaxAssumptions>) {
    onChange({ ...assumptions, tax: { ...assumptions.tax, ...patch } });
  }
  function updateDriver(key: 'da' | 'capex' | 'nwc', patch: Partial<DriverAssumptions>) {
    onChange({ ...assumptions, [key]: { ...assumptions[key], ...patch } });
  }

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-ink font-serif text-lg font-semibold">Forecast Assumptions</h2>
          <p className="text-ink/50 mt-1 text-xs">
            Every figure below is editable. Nothing here is a prediction the model makes on its
            own — it&apos;s what you tell the model to assume.
          </p>
        </div>
        <SelectField
          label="Forecast Horizon"
          value={String(assumptions.forecastYears) as '3' | '5' | '7' | '10'}
          options={HORIZON_OPTIONS}
          onChange={(value) => onChange({ ...assumptions, forecastYears: Number(value) as ForecastHorizon })}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="border-ink/10 bg-paper rounded-xl border p-4">
          <h3 className="text-ink text-sm font-semibold">Revenue Growth</h3>
          <p className="text-ink/40 mt-0.5 text-xs">{referenceNote('Historical average', averages.growth)}</p>
          <div className="mt-3 flex flex-col gap-3">
            <SelectField
              label="Method"
              value={assumptions.revenue.method}
              options={REVENUE_METHODS}
              onChange={(method) => updateRevenue({ method })}
            />
            {assumptions.revenue.method === 'userGrowth' && (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {years.map((yearIndex) => (
                  <PercentField
                    key={yearIndex}
                    label={`Year ${yearIndex}`}
                    value={assumptions.revenue.userGrowthRates[yearIndex - 1] ?? 0}
                    onChange={(value) => {
                      const next = [...assumptions.revenue.userGrowthRates];
                      next[yearIndex - 1] = value;
                      updateRevenue({ userGrowthRates: next });
                    }}
                  />
                ))}
              </div>
            )}
            {assumptions.revenue.method === 'fade' && (
              <div className="grid grid-cols-2 gap-2">
                <PercentField
                  label="Starting growth (Yr 1)"
                  value={assumptions.revenue.fadeStartGrowth}
                  onChange={(value) => updateRevenue({ fadeStartGrowth: value })}
                />
                <PercentField
                  label="Long-term normalized growth"
                  value={assumptions.revenue.fadeEndGrowth}
                  onChange={(value) => updateRevenue({ fadeEndGrowth: value })}
                />
              </div>
            )}
          </div>
        </div>

        <div className="border-ink/10 bg-paper rounded-xl border p-4">
          <h3 className="text-ink text-sm font-semibold">EBIT Margin</h3>
          <p className="text-ink/40 mt-0.5 text-xs">{referenceNote('Historical average', averages.margin)}</p>
          <div className="mt-3 flex flex-col gap-3">
            <SelectField
              label="Method"
              value={assumptions.margin.method}
              options={MARGIN_METHODS}
              onChange={(method) => updateMargin({ method })}
            />
            {assumptions.margin.method === 'user' && (
              <PercentField
                label="EBIT margin"
                value={assumptions.margin.userMargin}
                onChange={(value) => updateMargin({ userMargin: value })}
              />
            )}
            {assumptions.margin.method === 'gradual' && (
              <div className="grid grid-cols-2 gap-2">
                <PercentField
                  label="Starting margin (Yr 1)"
                  value={assumptions.margin.gradualStartMargin}
                  onChange={(value) => updateMargin({ gradualStartMargin: value })}
                />
                <PercentField
                  label="Ending margin (final year)"
                  value={assumptions.margin.gradualEndMargin}
                  onChange={(value) => updateMargin({ gradualEndMargin: value })}
                />
              </div>
            )}
          </div>
        </div>

        <div className="border-ink/10 bg-paper rounded-xl border p-4">
          <h3 className="text-ink text-sm font-semibold">Tax Rate</h3>
          <p className="text-ink/40 mt-0.5 text-xs">{referenceNote('Historical effective rate', averages.taxRate)}</p>
          <div className="mt-3 flex flex-col gap-3">
            <SelectField
              label="Method"
              value={assumptions.tax.method}
              options={RATE_METHODS}
              onChange={(method) => updateTax({ method })}
            />
            {assumptions.tax.method === 'user' && (
              <PercentField
                label="Tax rate"
                value={assumptions.tax.userRate}
                onChange={(value) => updateTax({ userRate: value })}
              />
            )}
          </div>
        </div>

        <DriverCard
          title="D&A (% of Revenue)"
          referenceValue={averages.daPercent}
          driver={assumptions.da}
          onChange={(patch) => updateDriver('da', patch)}
        />
        <DriverCard
          title="CapEx (% of Revenue)"
          referenceValue={averages.capexPercent}
          driver={assumptions.capex}
          onChange={(patch) => updateDriver('capex', patch)}
        />
        <DriverCard
          title="Net Working Capital (% of Revenue)"
          referenceValue={averages.nwcPercent}
          driver={assumptions.nwc}
          onChange={(patch) => updateDriver('nwc', patch)}
        />
      </div>
    </section>
  );
}

interface DriverCardProps {
  title: string;
  referenceValue: number | null;
  driver: DriverAssumptions;
  onChange: (patch: Partial<DriverAssumptions>) => void;
}

function DriverCard({ title, referenceValue, driver, onChange }: DriverCardProps) {
  return (
    <div className="border-ink/10 bg-paper rounded-xl border p-4">
      <h3 className="text-ink text-sm font-semibold">{title}</h3>
      <p className="text-ink/40 mt-0.5 text-xs">{referenceNote('Historical average', referenceValue)}</p>
      <div className="mt-3 flex flex-col gap-3">
        <SelectField
          label="Method"
          value={driver.method}
          options={DRIVER_METHODS}
          onChange={(method) => onChange({ method })}
        />
        {driver.method === 'percentOfRevenue' && (
          <PercentField
            label="% of revenue"
            value={driver.percentOfRevenue}
            onChange={(value) => onChange({ percentOfRevenue: value })}
          />
        )}
        {driver.method === 'flatAmount' && (
          <NumberField
            label="Flat amount per year"
            prefix="$"
            value={driver.flatAmount}
            onChange={(value) => onChange({ flatAmount: value })}
          />
        )}
      </div>
    </div>
  );
}
