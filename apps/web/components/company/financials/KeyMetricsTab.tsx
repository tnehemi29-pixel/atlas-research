import type { FinancialPeriodData, PeriodType } from '@erp/types';
import {
  fcfMargin,
  grossMargin,
  growthRate,
  netDebt,
  netMargin,
  operatingMargin,
  roa,
  roe,
  totalDebt,
} from '@/lib/analytics/ratios';
import { findAdjacentPriorPeriodByRef, findPriorYearPeriod } from '@/lib/analytics/periodMetrics';
import { formatCompactCurrency, formatPrice, formatRatioAsPercent } from '@/lib/utils/format';
import { StatementTable } from './StatementTable';
import { SourceFootnote } from './SourceFootnote';
import { FinancialCharts } from './charts/FinancialCharts';
import type { StatementRow } from './types';

const ROWS: StatementRow[] = [
  {
    key: 'revenue',
    label: 'Revenue',
    get: (p) => p.incomeStatement.revenue,
    format: formatCompactCurrency,
    emphasis: true,
  },
  {
    key: 'revenueGrowth',
    label: 'Revenue growth (YoY)',
    get: (p, all) =>
      growthRate(
        p.incomeStatement.revenue,
        findPriorYearPeriod(all, p)?.incomeStatement.revenue ?? null,
      ),
    format: formatRatioAsPercent,
    indent: true,
    isDerived: true,
  },
  {
    key: 'grossMargin',
    label: 'Gross margin',
    get: (p) => grossMargin(p.incomeStatement.grossProfit, p.incomeStatement.revenue),
    format: formatRatioAsPercent,
  },
  {
    key: 'operatingMargin',
    label: 'Operating margin',
    get: (p) => operatingMargin(p.incomeStatement.operatingIncome, p.incomeStatement.revenue),
    format: formatRatioAsPercent,
  },
  {
    key: 'netMargin',
    label: 'Net margin',
    get: (p) => netMargin(p.incomeStatement.netIncome, p.incomeStatement.revenue),
    format: formatRatioAsPercent,
  },
  {
    key: 'dilutedEps',
    label: 'Diluted EPS',
    get: (p) => p.incomeStatement.dilutedEps,
    format: formatPrice,
    emphasis: true,
  },
  {
    key: 'epsGrowth',
    label: 'EPS growth (YoY)',
    get: (p, all) =>
      growthRate(
        p.incomeStatement.dilutedEps,
        findPriorYearPeriod(all, p)?.incomeStatement.dilutedEps ?? null,
      ),
    format: formatRatioAsPercent,
    indent: true,
    isDerived: true,
  },
  {
    key: 'ocf',
    label: 'Operating cash flow',
    get: (p) => p.cashFlow.operatingCashFlow,
    format: formatCompactCurrency,
  },
  {
    key: 'fcf',
    label: 'Free cash flow',
    get: (p) => p.cashFlow.freeCashFlow,
    format: formatCompactCurrency,
    emphasis: true,
  },
  {
    key: 'fcfMargin',
    label: 'FCF margin',
    get: (p) => fcfMargin(p.cashFlow.freeCashFlow, p.incomeStatement.revenue),
    format: formatRatioAsPercent,
    indent: true,
    isDerived: true,
  },
  {
    key: 'totalDebt',
    label: 'Total debt',
    get: (p) => totalDebt(p.balanceSheet.shortTermDebt, p.balanceSheet.longTermDebt),
    format: formatCompactCurrency,
  },
  {
    key: 'cash',
    label: 'Cash',
    get: (p) => p.balanceSheet.cashAndEquivalents,
    format: formatCompactCurrency,
  },
  {
    key: 'netDebt',
    label: 'Net debt',
    get: (p) =>
      netDebt(
        totalDebt(p.balanceSheet.shortTermDebt, p.balanceSheet.longTermDebt),
        p.balanceSheet.cashAndEquivalents,
      ),
    format: formatCompactCurrency,
  },
  {
    key: 'roe',
    label: 'Return on equity',
    get: (p, all) =>
      roe(
        p.incomeStatement.netIncome,
        p.balanceSheet.stockholdersEquity,
        findAdjacentPriorPeriodByRef(all, p)?.balanceSheet.stockholdersEquity ?? null,
      ),
    format: formatRatioAsPercent,
  },
  {
    key: 'roa',
    label: 'Return on assets',
    get: (p, all) =>
      roa(
        p.incomeStatement.netIncome,
        p.balanceSheet.totalAssets,
        findAdjacentPriorPeriodByRef(all, p)?.balanceSheet.totalAssets ?? null,
      ),
    format: formatRatioAsPercent,
  },
];

interface KeyMetricsTabProps {
  periods: FinancialPeriodData[];
  allPeriods: FinancialPeriodData[];
  periodType: PeriodType;
  dataAsOf: string | null;
  stale: boolean;
}

export function KeyMetricsTab({
  periods,
  allPeriods,
  periodType,
  dataAsOf,
  stale,
}: KeyMetricsTabProps) {
  return (
    <div>
      <FinancialCharts periods={periods} periodType={periodType} />

      <h3 className="text-ink mt-8 text-sm font-semibold">Historical metrics</h3>
      <div className="mt-3">
        <StatementTable periods={periods} allPeriods={allPeriods} rows={ROWS} />
      </div>
      <p className="text-ink/40 mt-3 text-xs">
        ROE/ROA use the average of the current and immediately prior period&apos;s balance — falling
        back to the single ending balance for the earliest period in the data, where there is no
        prior balance to average with.
      </p>
      <SourceFootnote dataAsOf={dataAsOf} stale={stale} />
    </div>
  );
}
