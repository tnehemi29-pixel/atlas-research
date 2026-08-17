'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DcfResult, ForecastYear, HistoricalYear } from '@/lib/valuation/types';
import type { SensitivityGrid } from '@/lib/valuation/sensitivity';
import { formatCompactCurrency, formatPrice, formatRatioAsPercent } from '@/lib/utils/format';
import { ChartCard, ChartTooltip } from '@/components/company/financials/charts/ChartCard';

/**
 * Four charts, matching the milestone's requirement list exactly: historical
 * + forecast revenue, historical + forecast FCF, implied-share-price
 * sensitivity, and a scenario comparison. Historical vs. forecast is
 * distinguished by BOTH color and line style (solid green vs. dashed
 * orange) — the same CVD-validated pair FinancialCharts already uses for
 * revenue/net-income, reused rather than inventing a new one.
 */

const COLOR_HISTORICAL = '#0d8a63';
const COLOR_FORECAST = '#c2660c';
const COLOR_BASE = '#1f6f5c';
const COLOR_BEAR = '#b91c1c';
const COLOR_BULL = '#059669';
const COLOR_CURRENT = '#7c848c';
const GRID_COLOR = '#e5e3dc';
const AXIS_TICK = { fontSize: 11, fill: '#7c848c' };

interface HistoricalForecastDatum {
  label: string;
  historical: number | null;
  forecast: number | null;
}

/** Builds one combined series where the last historical point also carries
 * the forecast value — the two differently-styled lines share that point,
 * so the dashed forecast line visually picks up exactly where the solid
 * historical line ends instead of leaving a gap. */
function buildHistoricalForecastSeries(
  historicals: HistoricalYear[],
  forecast: ForecastYear[],
  historicalGet: (year: HistoricalYear) => number | null,
  forecastGet: (year: ForecastYear) => number | null,
): HistoricalForecastDatum[] {
  const points: HistoricalForecastDatum[] = historicals.map((year, index) => ({
    label: `FY${year.fiscalYear}`,
    historical: historicalGet(year),
    forecast: index === historicals.length - 1 ? historicalGet(year) : null,
  }));
  forecast.forEach((year) => {
    points.push({ label: `FY${year.fiscalYear}E`, historical: null, forecast: forecastGet(year) });
  });
  return points;
}

interface ValuationChartsProps {
  historicals: HistoricalYear[];
  forecast: ForecastYear[];
  /** The WACC-vs-terminal-growth (or WACC-vs-exit-multiple) grid — the
   * sensitivity chart plots the row that matches the base-case terminal
   * assumption, i.e. "implied price vs. WACC, everything else held fixed." */
  sensitivityGrid: SensitivityGrid | null;
  currentPrice: number | null;
  scenarios: { bear: DcfResult; base: DcfResult; bull: DcfResult };
}

export function ValuationCharts({ historicals, forecast, sensitivityGrid, currentPrice, scenarios }: ValuationChartsProps) {
  const revenueData = buildHistoricalForecastSeries(historicals, forecast, (y) => y.revenue, (y) => y.revenue);
  const fcfData = buildHistoricalForecastSeries(historicals, forecast, (y) => y.unleveredFcf, (y) => y.unleveredFcf);

  const baseSensitivityRow = sensitivityGrid?.cells.find((row) => row.some((cell) => cell.isBaseCase)) ?? null;
  const sensitivityData =
    baseSensitivityRow?.map((cell) => ({ wacc: cell.columnValue, price: cell.impliedSharePrice })) ?? [];

  const scenarioData = [
    { label: 'Bear', price: scenarios.bear.impliedSharePrice, fill: COLOR_BEAR },
    { label: 'Base', price: scenarios.base.impliedSharePrice, fill: COLOR_BASE },
    { label: 'Bull', price: scenarios.bull.impliedSharePrice, fill: COLOR_BULL },
  ];

  return (
    <section className="mt-8">
      <h2 className="text-ink font-serif text-lg font-semibold">Charts</h2>
      <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
        <ChartCard title="Revenue: Historical vs. Forecast">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={revenueData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <CartesianGrid stroke={GRID_COLOR} vertical={false} />
              <XAxis dataKey="label" tick={AXIS_TICK} axisLine={{ stroke: GRID_COLOR }} tickLine={false} />
              <YAxis
                tickFormatter={(v: number) => formatCompactCurrency(v)}
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
                width={56}
              />
              <Tooltip
                content={
                  <ChartTooltip
                    formatters={{ historical: formatCompactCurrency, forecast: formatCompactCurrency }}
                    labels={{ historical: 'Historical', forecast: 'Forecast' }}
                  />
                }
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line
                type="monotone"
                dataKey="historical"
                name="Historical"
                stroke={COLOR_HISTORICAL}
                strokeWidth={2}
                dot={{ r: 3, fill: COLOR_HISTORICAL, strokeWidth: 0 }}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="forecast"
                name="Forecast"
                stroke={COLOR_FORECAST}
                strokeWidth={2}
                strokeDasharray="5 3"
                dot={{ r: 3, fill: COLOR_FORECAST, strokeWidth: 0 }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Unlevered FCF: Historical vs. Forecast">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={fcfData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <CartesianGrid stroke={GRID_COLOR} vertical={false} />
              <XAxis dataKey="label" tick={AXIS_TICK} axisLine={{ stroke: GRID_COLOR }} tickLine={false} />
              <YAxis
                tickFormatter={(v: number) => formatCompactCurrency(v)}
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
                width={56}
              />
              <Tooltip
                content={
                  <ChartTooltip
                    formatters={{ historical: formatCompactCurrency, forecast: formatCompactCurrency }}
                    labels={{ historical: 'Historical', forecast: 'Forecast' }}
                  />
                }
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line
                type="monotone"
                dataKey="historical"
                name="Historical"
                stroke={COLOR_HISTORICAL}
                strokeWidth={2}
                dot={{ r: 3, fill: COLOR_HISTORICAL, strokeWidth: 0 }}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="forecast"
                name="Forecast"
                stroke={COLOR_FORECAST}
                strokeWidth={2}
                strokeDasharray="5 3"
                dot={{ r: 3, fill: COLOR_FORECAST, strokeWidth: 0 }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Implied Share Price vs. WACC (base-case terminal assumptions)">
          {sensitivityData.length > 1 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sensitivityData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                <CartesianGrid stroke={GRID_COLOR} vertical={false} />
                <XAxis
                  dataKey="wacc"
                  tickFormatter={(v: number) => formatRatioAsPercent(v)}
                  tick={AXIS_TICK}
                  axisLine={{ stroke: GRID_COLOR }}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v: number) => formatPrice(v)}
                  tick={AXIS_TICK}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                />
                <Tooltip content={<ChartTooltip formatters={{ price: formatPrice }} labels={{ price: 'Implied share price' }} />} />
                {currentPrice !== null && (
                  <ReferenceLine
                    y={currentPrice}
                    stroke={COLOR_CURRENT}
                    strokeDasharray="3 3"
                    label={{ value: 'Current price', position: 'insideTopRight', fill: COLOR_CURRENT, fontSize: 10 }}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="price"
                  name="Implied share price"
                  stroke={COLOR_BASE}
                  strokeWidth={2}
                  dot={{ r: 3, fill: COLOR_BASE, strokeWidth: 0 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-ink/40 flex h-full items-center justify-center text-center text-xs">
              Not enough resolved data to plot — see the issues above.
            </div>
          )}
        </ChartCard>

        <ChartCard title="Scenario Comparison">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={scenarioData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <CartesianGrid stroke={GRID_COLOR} vertical={false} />
              <XAxis dataKey="label" tick={AXIS_TICK} axisLine={{ stroke: GRID_COLOR }} tickLine={false} />
              <YAxis
                tickFormatter={(v: number) => formatPrice(v)}
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
                width={56}
              />
              <Tooltip content={<ChartTooltip formatters={{ price: formatPrice }} labels={{ price: 'Implied share price' }} />} />
              {currentPrice !== null && (
                <ReferenceLine
                  y={currentPrice}
                  stroke={COLOR_CURRENT}
                  strokeDasharray="3 3"
                  label={{ value: 'Current price', position: 'insideTopRight', fill: COLOR_CURRENT, fontSize: 10 }}
                />
              )}
              <Bar dataKey="price" name="Implied share price" radius={[2, 2, 0, 0]} maxBarSize={56}>
                {scenarioData.map((d) => (
                  <Cell key={d.label} fill={d.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </section>
  );
}
