import type { FinancialPeriodData } from '@erp/types';
import { checkBalanceSheetEquation, totalDebt } from '@/lib/analytics/ratios';
import { formatCompactCurrency } from '@/lib/utils/format';
import { StatementTable } from './StatementTable';
import { SourceFootnote } from './SourceFootnote';
import type { StatementRow } from './types';

const ROWS: StatementRow[] = [
  {
    key: 'cash',
    label: 'Cash & equivalents',
    get: (p) => p.balanceSheet.cashAndEquivalents,
    format: formatCompactCurrency,
  },
  {
    key: 'shortTermInvestments',
    label: 'Short-term investments',
    get: (p) => p.balanceSheet.shortTermInvestments,
    format: formatCompactCurrency,
  },
  {
    key: 'accountsReceivable',
    label: 'Accounts receivable',
    get: (p) => p.balanceSheet.accountsReceivable,
    format: formatCompactCurrency,
  },
  {
    key: 'inventory',
    label: 'Inventory',
    get: (p) => p.balanceSheet.inventory,
    format: formatCompactCurrency,
  },
  {
    key: 'totalCurrentAssets',
    label: 'Total current assets',
    get: (p) => p.balanceSheet.totalCurrentAssets,
    format: formatCompactCurrency,
    emphasis: true,
  },
  {
    key: 'ppe',
    label: 'Property, plant & equipment',
    get: (p) => p.balanceSheet.ppe,
    format: formatCompactCurrency,
  },
  {
    key: 'goodwill',
    label: 'Goodwill',
    get: (p) => p.balanceSheet.goodwill,
    format: formatCompactCurrency,
  },
  {
    key: 'intangibleAssets',
    label: 'Intangible assets',
    get: (p) => p.balanceSheet.intangibleAssets,
    format: formatCompactCurrency,
  },
  {
    key: 'totalAssets',
    label: 'Total assets',
    get: (p) => p.balanceSheet.totalAssets,
    format: formatCompactCurrency,
    emphasis: true,
  },
  {
    key: 'accountsPayable',
    label: 'Accounts payable',
    get: (p) => p.balanceSheet.accountsPayable,
    format: formatCompactCurrency,
  },
  {
    key: 'shortTermDebt',
    label: 'Short-term debt',
    get: (p) => p.balanceSheet.shortTermDebt,
    format: formatCompactCurrency,
  },
  {
    key: 'totalCurrentLiabilities',
    label: 'Total current liabilities',
    get: (p) => p.balanceSheet.totalCurrentLiabilities,
    format: formatCompactCurrency,
    emphasis: true,
  },
  {
    key: 'longTermDebt',
    label: 'Long-term debt',
    get: (p) => p.balanceSheet.longTermDebt,
    format: formatCompactCurrency,
  },
  {
    key: 'totalDebt',
    label: 'Total debt',
    get: (p) => totalDebt(p.balanceSheet.shortTermDebt, p.balanceSheet.longTermDebt),
    format: formatCompactCurrency,
  },
  {
    key: 'totalLiabilities',
    label: 'Total liabilities',
    get: (p) => p.balanceSheet.totalLiabilities,
    format: formatCompactCurrency,
    emphasis: true,
  },
  {
    key: 'stockholdersEquity',
    label: "Stockholders' equity",
    get: (p) => p.balanceSheet.stockholdersEquity,
    format: formatCompactCurrency,
    emphasis: true,
  },
];

function columnLabel(period: FinancialPeriodData): string {
  return period.periodType === 'annual'
    ? `FY${period.fiscalYear}`
    : `${period.fiscalPeriod}'${String(period.fiscalYear).slice(-2)}`;
}

/** Assets = Liabilities + Equity, checked per displayed period. Quiet when
 * everything reconciles (the common case); explicit and specific when it
 * doesn't — never silently adjusts the underlying numbers. */
function BalanceCheckStrip({ periods }: { periods: FinancialPeriodData[] }) {
  const checks = periods
    .map((period) => ({
      period,
      result: checkBalanceSheetEquation(
        period.balanceSheet.totalAssets,
        period.balanceSheet.totalLiabilities,
        period.balanceSheet.stockholdersEquity,
      ),
    }))
    .filter((check) => check.result.diffRatio !== null);

  if (checks.length === 0) return null;

  const failing = checks.filter((check) => !check.result.balanced);

  if (failing.length === 0) {
    return (
      <div className="border-accent/20 bg-accent-soft text-accent mt-3 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs">
        <span aria-hidden>✓</span>
        <span>
          Assets = Liabilities + Equity reconciles within tolerance for every period shown.
        </span>
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs text-amber-700">
        <span aria-hidden>⚠</span>
        <span>Data requires review — the balance-sheet equation doesn&apos;t reconcile for:</span>
      </span>
      {failing.map(({ period, result }) => (
        <span
          key={`${period.fiscalYear}-${period.fiscalPeriod}`}
          className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 font-mono text-xs text-amber-700"
        >
          {columnLabel(period)}: off by {((result.diffRatio ?? 0) * 100).toFixed(1)}%
        </span>
      ))}
    </div>
  );
}

interface BalanceSheetTabProps {
  periods: FinancialPeriodData[];
  allPeriods: FinancialPeriodData[];
  dataAsOf: string | null;
  stale: boolean;
}

export function BalanceSheetTab({ periods, allPeriods, dataAsOf, stale }: BalanceSheetTabProps) {
  return (
    <div>
      <StatementTable periods={periods} allPeriods={allPeriods} rows={ROWS} />
      <BalanceCheckStrip periods={periods} />
      <SourceFootnote
        dataAsOf={dataAsOf}
        stale={stale}
        note="balance sheet figures are as of each period's end date"
      />
    </div>
  );
}
