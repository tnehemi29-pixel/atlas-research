'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { FinancialPeriodData, PeriodType } from '@erp/types';
import { growthRate, operatingMargin as calcOperatingMargin } from '@/lib/analytics/ratios';
import { findPriorYearPeriod } from '@/lib/analytics/periodMetrics';
import { formatCompactCurrency, formatPrice, formatRatioAsPercent } from '@/lib/utils/format';
import { ChartCard, ChartTooltip } from './ChartCard';

/**
 * Five small multiples covering the chart requirement: Revenue & Net Income,
 * Revenue Growth, Operating Margin, Free Cash Flow, EPS. All five read the
 * same `periods` prop already fetched for the active tab/period-type/range —
 * no chart makes its own network request (see FinancialsWorkspace).
 *
 * Colors were run through the dataviz skill's CVD validator
 * (scripts/validate_palette.js) rather than picked by eye: the two-series
 * revenue/net-income pair passes every check (chroma floor, CVD ΔE 8.4
 * protan / 21.8 normal-vision, contrast) on a white surface. Sign-colored
 * bars (growth, FCF) reuse the app's existing emerald/red convention from
 * the price-change indicator (Milestone 2) rather than inventing a new pair.
 */

const COLOR_REVENUE = '#0d8a63';
const COLOR_NET_INCOME = '#c2660c';
const COLOR_POSITIVE = '#059669';
const COLOR_NEGATIVE = '#b91c1c';
const COLOR_LINE = '#0d8a63';
const GRID_COLOR = '#e5e3dc';
const AXIS_TICK = { fontSize: 11, fill: '#7c848c' };

function periodLabel(period: FinancialPeriodData): string {
  return period.periodType === 'annual'
    ? `FY${period.fiscalYear}`
    : `${period.fiscalPeriod}'${String(period.fiscalYear).slice(-2)}`;
}

interface ChartDatum {
  label: string;
  revenue: number | null;
  netIncome: number | null;
  revenueGrowth: number | null;
  operatingMargin: number | null;
  fcf: number | null;
  eps: number | null;
}

function buildChartData(periods: FinancialPeriodData[]): ChartDatum[] {
  // periods arrives newest-first (matches the tables); charts read
  // left-to-right as oldest-to-newest, so reverse for display only.
  return [...periods].reverse().map((period) => ({
    label: periodLabel(period),
    revenue: period.incomeStatement.revenue,
    netIncome: period.incomeStatement.netIncome,
    revenueGrowth: growthRate(
      period.incomeStatement.revenue,
      findPriorYearPeriod(periods, period)?.incomeStatement.revenue ?? null,
    ),
    operatingMargin: calcOperatingMargin(
      period.incomeStatement.operatingIncome,
      period.incomeStatement.revenue,
    ),
    fcf: period.cashFlow.freeCashFlow,
    eps: period.incomeStatement.dilutedEps,
  }));
}

function signColor(value: number | null): string {
  return value !== null && value < 0 ? COLOR_NEGATIVE : COLOR_POSITIVE;
}

interface FinancialChartsProps {
  periods: FinancialPeriodData[];
  periodType: PeriodType;
}

export function FinancialCharts({ periods, periodType }: FinancialChartsProps) {
  if (periods.length === 0) return null;

  const data = buildChartData(periods);

  return (
    <div>
      <h3 className="text-ink text-sm font-semibold">
        Trends ({periodType === 'annual' ? 'annual' : 'quarterly'})
      </h3>
      <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
        <ChartCard title="Revenue & Net Income">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <CartesianGrid stroke={GRID_COLOR} vertical={false} />
              <XAxis
                dataKey="label"
                tick={AXIS_TICK}
                axisLine={{ stroke: GRID_COLOR }}
                tickLine={false}
              />
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
                    formatters={{
                      revenue: formatCompactCurrency,
                      netIncome: formatCompactCurrency,
                    }}
                    labels={{ revenue: 'Revenue', netIncome: 'Net income' }}
                  />
                }
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar
                dataKey="revenue"
                name="Revenue"
                fill={COLOR_REVENUE}
                radius={[2, 2, 0, 0]}
                maxBarSize={28}
              />
              <Bar
                dataKey="netIncome"
                name="Net income"
                fill={COLOR_NET_INCOME}
                radius={[2, 2, 0, 0]}
                maxBarSize={28}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Revenue Growth (YoY)">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <CartesianGrid stroke={GRID_COLOR} vertical={false} />
              <XAxis
                dataKey="label"
                tick={AXIS_TICK}
                axisLine={{ stroke: GRID_COLOR }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v: number) => formatRatioAsPercent(v)}
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
                width={56}
              />
              <Tooltip
                content={
                  <ChartTooltip
                    formatters={{ revenueGrowth: formatRatioAsPercent }}
                    labels={{ revenueGrowth: 'Revenue growth' }}
                  />
                }
              />
              <Bar
                dataKey="revenueGrowth"
                name="Revenue growth"
                radius={[2, 2, 0, 0]}
                maxBarSize={28}
              >
                {data.map((d) => (
                  <Cell key={d.label} fill={signColor(d.revenueGrowth)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Operating Margin">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <CartesianGrid stroke={GRID_COLOR} vertical={false} />
              <XAxis
                dataKey="label"
                tick={AXIS_TICK}
                axisLine={{ stroke: GRID_COLOR }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v: number) => formatRatioAsPercent(v)}
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
                width={56}
              />
              <Tooltip
                content={
                  <ChartTooltip
                    formatters={{ operatingMargin: formatRatioAsPercent }}
                    labels={{ operatingMargin: 'Operating margin' }}
                  />
                }
              />
              <Line
                type="monotone"
                dataKey="operatingMargin"
                name="Operating margin"
                stroke={COLOR_LINE}
                strokeWidth={2}
                dot={{ r: 3, fill: COLOR_LINE, strokeWidth: 0 }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Free Cash Flow">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <CartesianGrid stroke={GRID_COLOR} vertical={false} />
              <XAxis
                dataKey="label"
                tick={AXIS_TICK}
                axisLine={{ stroke: GRID_COLOR }}
                tickLine={false}
              />
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
                    formatters={{ fcf: formatCompactCurrency }}
                    labels={{ fcf: 'Free cash flow' }}
                  />
                }
              />
              <Bar dataKey="fcf" name="Free cash flow" radius={[2, 2, 0, 0]} maxBarSize={28}>
                {data.map((d) => (
                  <Cell key={d.label} fill={signColor(d.fcf)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Diluted EPS">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <CartesianGrid stroke={GRID_COLOR} vertical={false} />
              <XAxis
                dataKey="label"
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
              <Tooltip
                content={
                  <ChartTooltip formatters={{ eps: formatPrice }} labels={{ eps: 'Diluted EPS' }} />
                }
              />
              <Line
                type="monotone"
                dataKey="eps"
                name="Diluted EPS"
                stroke={COLOR_LINE}
                strokeWidth={2}
                dot={{ r: 3, fill: COLOR_LINE, strokeWidth: 0 }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}
