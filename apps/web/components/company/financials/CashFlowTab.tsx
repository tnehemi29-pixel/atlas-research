import type { FinancialPeriodData } from '@erp/types';
import { formatCompactCurrency } from '@/lib/utils/format';
import { StatementTable } from './StatementTable';
import { SourceFootnote } from './SourceFootnote';
import type { StatementRow } from './types';

const ROWS: StatementRow[] = [
  {
    key: 'netIncome',
    label: 'Net income',
    get: (p) => p.incomeStatement.netIncome,
    format: formatCompactCurrency,
  },
  {
    key: 'da',
    label: 'Depreciation & amortization',
    get: (p) => p.cashFlow.depreciationAmortization,
    format: formatCompactCurrency,
  },
  {
    key: 'sbc',
    label: 'Stock-based compensation',
    get: (p) => p.cashFlow.stockBasedCompensation,
    format: formatCompactCurrency,
  },
  {
    key: 'wc',
    label: 'Change in working capital',
    get: (p) => p.cashFlow.changeInWorkingCapital,
    format: formatCompactCurrency,
  },
  {
    key: 'ocf',
    label: 'Operating cash flow',
    get: (p) => p.cashFlow.operatingCashFlow,
    format: formatCompactCurrency,
    emphasis: true,
  },
  {
    key: 'capex',
    label: 'Capital expenditures',
    get: (p) => p.cashFlow.capex,
    format: formatCompactCurrency,
  },
  {
    key: 'icf',
    label: 'Investing cash flow',
    get: (p) => p.cashFlow.investingCashFlow,
    format: formatCompactCurrency,
  },
  {
    key: 'fcf_activities',
    label: 'Financing cash flow',
    get: (p) => p.cashFlow.financingCashFlow,
    format: formatCompactCurrency,
  },
  {
    key: 'fcf',
    label: 'Free cash flow',
    get: (p) => p.cashFlow.freeCashFlow,
    format: formatCompactCurrency,
    emphasis: true,
  },
];

interface CashFlowTabProps {
  periods: FinancialPeriodData[];
  allPeriods: FinancialPeriodData[];
  dataAsOf: string | null;
  stale: boolean;
}

export function CashFlowTab({ periods, allPeriods, dataAsOf, stale }: CashFlowTabProps) {
  return (
    <div>
      <StatementTable periods={periods} allPeriods={allPeriods} rows={ROWS} />
      <p className="text-ink/40 mt-3 text-xs">
        <strong className="text-ink/60 font-medium">Free cash flow formula:</strong> Operating Cash
        Flow − Capital Expenditures. Computed the same way everywhere it appears in Atlas Research
        (see the Key Metrics tab and the company overview).
      </p>
      <SourceFootnote dataAsOf={dataAsOf} stale={stale} />
    </div>
  );
}
