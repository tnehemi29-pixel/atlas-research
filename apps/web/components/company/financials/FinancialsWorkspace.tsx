'use client';

import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { CompanyFinancialsResponse, PeriodType } from '@erp/types';
import { fetchCompanyFinancials } from '@/lib/api/financials';
import { ApiError } from '@/lib/api/companies';
import { sliceByRange, type RangeSelection } from '@/lib/analytics/periodMetrics';
import { PeriodControls } from './PeriodControls';
import { StatementSkeleton } from './StatementSkeleton';
import { IncomeStatementTab } from './IncomeStatementTab';
import { BalanceSheetTab } from './BalanceSheetTab';
import { CashFlowTab } from './CashFlowTab';
import { KeyMetricsTab } from './KeyMetricsTab';

type TabKey = 'income' | 'balance' | 'cashflow' | 'metrics';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'income', label: 'Income Statement' },
  { key: 'balance', label: 'Balance Sheet' },
  { key: 'cashflow', label: 'Cash Flow' },
  { key: 'metrics', label: 'Key Metrics' },
];

interface FinancialsWorkspaceProps {
  ticker: string;
  /** Server-fetched annual data (Milestone 3's page.tsx fetch) — seeds the
   * 'annual' query so the default view never re-fetches on mount. Switching
   * to quarterly is the only thing that triggers a new network request. */
  initialAnnualData: CompanyFinancialsResponse | undefined;
}

export function FinancialsWorkspace({ ticker, initialAnnualData }: FinancialsWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('income');
  const [periodType, setPeriodType] = useState<PeriodType>('annual');
  const [range, setRange] = useState<RangeSelection>(5);

  const { data, isFetching, isError, error } = useQuery({
    queryKey: ['financials', ticker, periodType],
    queryFn: ({ signal }) => fetchCompanyFinancials(ticker, periodType, signal),
    initialData: periodType === 'annual' ? initialAnnualData : undefined,
    placeholderData: keepPreviousData,
  });

  const allPeriods = useMemo(() => data?.periods ?? [], [data]);
  const visiblePeriods = useMemo(
    () => sliceByRange(allPeriods, range, periodType),
    [allPeriods, range, periodType],
  );

  const errorMessage = isError
    ? error instanceof ApiError
      ? error.message
      : 'Something went wrong loading financial data.'
    : null;
  const showSkeleton = isFetching && !data;
  const showEmpty = Boolean(data) && !showSkeleton && visiblePeriods.length === 0;
  const showContent = Boolean(data) && !showSkeleton && visiblePeriods.length > 0;

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-ink font-serif text-lg font-semibold">Financials</h2>
        <PeriodControls
          periodType={periodType}
          onPeriodTypeChange={setPeriodType}
          range={range}
          onRangeChange={setRange}
        />
      </div>

      <div
        role="tablist"
        aria-label="Financial statement type"
        className="border-ink/10 mt-4 flex gap-1 border-b"
      >
        {TABS.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            id={`financials-tab-${tab.key}`}
            aria-selected={activeTab === tab.key}
            aria-controls={`financials-panel-${tab.key}`}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'border-accent text-ink'
                : 'text-ink/50 hover:text-ink/70 border-transparent'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`financials-panel-${activeTab}`}
        aria-labelledby={`financials-tab-${activeTab}`}
        className="mt-4"
      >
        {showSkeleton && <StatementSkeleton />}

        {errorMessage && (
          <div
            className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
            role="alert"
          >
            {errorMessage}
          </div>
        )}

        {showEmpty && (
          <div className="border-ink/10 bg-paper text-ink/50 rounded-xl border p-6 text-center text-sm">
            No {periodType} financial data is available for {ticker}.
          </div>
        )}

        {showContent && data && (
          <>
            {activeTab === 'income' && (
              <IncomeStatementTab
                periods={visiblePeriods}
                allPeriods={allPeriods}
                dataAsOf={data.dataAsOf}
                stale={data.stale}
              />
            )}
            {activeTab === 'balance' && (
              <BalanceSheetTab
                periods={visiblePeriods}
                allPeriods={allPeriods}
                dataAsOf={data.dataAsOf}
                stale={data.stale}
              />
            )}
            {activeTab === 'cashflow' && (
              <CashFlowTab
                periods={visiblePeriods}
                allPeriods={allPeriods}
                dataAsOf={data.dataAsOf}
                stale={data.stale}
              />
            )}
            {activeTab === 'metrics' && (
              <KeyMetricsTab
                periods={visiblePeriods}
                allPeriods={allPeriods}
                periodType={periodType}
                dataAsOf={data.dataAsOf}
                stale={data.stale}
              />
            )}
          </>
        )}
      </div>
    </section>
  );
}
