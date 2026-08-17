'use client';

import { useState } from 'react';
import { fetchPortfolio, fetchPortfolioAnalytics, type PortfolioAnalyticsResponse, type PortfolioDetailResponse } from '@/lib/api/portfolio';
import { PortfolioSummary } from './PortfolioSummary';
import { HoldingsTable } from './HoldingsTable';
import { AllocationSection } from './AllocationSection';
import { FundamentalsSection } from './FundamentalsSection';
import { ValuationMonitorSection } from './ValuationMonitorSection';

export function PortfolioWorkspace({
  initialDetail,
  initialAnalytics,
}: {
  initialDetail: PortfolioDetailResponse;
  initialAnalytics: PortfolioAnalyticsResponse;
}) {
  const [detail, setDetail] = useState(initialDetail);
  const [analytics, setAnalytics] = useState(initialAnalytics);
  const [refreshing, setRefreshing] = useState(false);

  async function handleChanged() {
    setRefreshing(true);
    try {
      const [freshDetail, freshAnalytics] = await Promise.all([fetchPortfolio(), fetchPortfolioAnalytics()]);
      setDetail(freshDetail);
      setAnalytics(freshAnalytics);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-ink font-serif text-2xl">{detail.portfolio.name}</h1>
          <p className="text-ink/50 mt-1 max-w-xl text-sm">
            Manual position tracking — not connected to a brokerage. Every calculation is documented in{' '}
            <a href="/portfolio/methodology" className="text-accent hover:underline">
              how portfolio calculations work
            </a>
            .
          </p>
        </div>
        {refreshing && <span className="text-ink/40 text-xs">Refreshing…</span>}
      </div>

      <div className="space-y-10">
        <PortfolioSummary summary={detail.summary} />
        <HoldingsTable holdings={detail.holdings} onChanged={handleChanged} />
        <AllocationSection sectorAllocation={analytics.sectorAllocation} industryAllocation={analytics.industryAllocation} />
        <FundamentalsSection fundamentals={analytics.weightedFundamentals} />
        <ValuationMonitorSection rows={analytics.valuationMonitor} />
      </div>
    </main>
  );
}
