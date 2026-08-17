import type { FinancialPeriodData } from '@erp/types';
import { growthRate } from '@/lib/analytics/ratios';
import { findPriorYearPeriod } from '@/lib/analytics/periodMetrics';
import {
  formatCompactCurrency,
  formatPrice,
  formatRatioAsPercent,
  formatShares,
} from '@/lib/utils/format';
import { StatementTable } from './StatementTable';
import { SourceFootnote } from './SourceFootnote';
import type { StatementRow } from './types';

function priorYearRevenue(
  period: FinancialPeriodData,
  allPeriods: FinancialPeriodData[],
): number | null {
  return findPriorYearPeriod(allPeriods, period)?.incomeStatement.revenue ?? null;
}

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
    get: (p, all) => growthRate(p.incomeStatement.revenue, priorYearRevenue(p, all)),
    format: formatRatioAsPercent,
    indent: true,
    isDerived: true,
  },
  {
    key: 'costOfRevenue',
    label: 'Cost of revenue',
    get: (p) => p.incomeStatement.costOfRevenue,
    format: formatCompactCurrency,
  },
  {
    key: 'grossProfit',
    label: 'Gross profit',
    get: (p) => p.incomeStatement.grossProfit,
    format: formatCompactCurrency,
    emphasis: true,
  },
  {
    key: 'operatingExpenses',
    label: 'Operating expenses',
    get: (p) => p.incomeStatement.operatingExpenses,
    format: formatCompactCurrency,
  },
  {
    key: 'operatingIncome',
    label: 'Operating income',
    get: (p) => p.incomeStatement.operatingIncome,
    format: formatCompactCurrency,
    emphasis: true,
  },
  {
    key: 'interestExpense',
    label: 'Interest expense',
    get: (p) => p.incomeStatement.interestExpense,
    format: formatCompactCurrency,
  },
  {
    key: 'pretaxIncome',
    label: 'Pretax income',
    get: (p) => p.incomeStatement.pretaxIncome,
    format: formatCompactCurrency,
  },
  {
    key: 'incomeTax',
    label: 'Income tax',
    get: (p) => p.incomeStatement.incomeTax,
    format: formatCompactCurrency,
  },
  {
    key: 'netIncome',
    label: 'Net income',
    get: (p) => p.incomeStatement.netIncome,
    format: formatCompactCurrency,
    emphasis: true,
  },
  {
    key: 'eps',
    label: 'Basic EPS',
    get: (p) => p.incomeStatement.eps,
    format: formatPrice,
  },
  {
    key: 'dilutedEps',
    label: 'Diluted EPS',
    get: (p) => p.incomeStatement.dilutedEps,
    format: formatPrice,
  },
  {
    key: 'basicShares',
    label: 'Basic shares outstanding',
    get: (p) => p.incomeStatement.basicSharesOutstanding,
    format: formatShares,
  },
  {
    key: 'dilutedShares',
    label: 'Diluted shares outstanding',
    get: (p) => p.incomeStatement.dilutedSharesOutstanding,
    format: formatShares,
  },
];

interface IncomeStatementTabProps {
  periods: FinancialPeriodData[];
  allPeriods: FinancialPeriodData[];
  dataAsOf: string | null;
  stale: boolean;
}

export function IncomeStatementTab({
  periods,
  allPeriods,
  dataAsOf,
  stale,
}: IncomeStatementTabProps) {
  return (
    <div>
      <StatementTable periods={periods} allPeriods={allPeriods} rows={ROWS} />
      <SourceFootnote
        dataAsOf={dataAsOf}
        stale={stale}
        note="EPS and per-share figures are dollars, not scaled"
      />
    </div>
  );
}
