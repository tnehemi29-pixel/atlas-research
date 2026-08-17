'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchDcfForecastValidation, type DcfForecastMetricValue } from '@/lib/api/backtest';
import { ApiError } from '@/lib/api/companies';
import { formatCompactCurrency } from '@/lib/utils/format';
import { Card, EmptyState, ErrorState, Field, LoadingState, MethodologyList, StatsGrid, formatPct, selectClass } from '../shared';

const METRICS: { value: DcfForecastMetricValue; label: string }[] = [
  { value: 'revenue', label: 'Revenue' },
  { value: 'operatingMargin', label: 'Operating Margin' },
  { value: 'unleveredFcf', label: 'Unlevered FCF' },
];

function formatMetricValue(metric: DcfForecastMetricValue, value: number): string {
  return metric === 'operatingMargin' ? formatPct(value) : formatCompactCurrency(value);
}

export function DcfForecastTab({ ticker }: { ticker: string }) {
  const [metric, setMetric] = useState<DcfForecastMetricValue>('revenue');

  const { data, isFetching, isError, error } = useQuery({
    queryKey: ['backtest-dcf-forecast', ticker],
    queryFn: ({ signal }) => fetchDcfForecastValidation(ticker, signal),
  });

  const errorMessage = isError ? (error instanceof ApiError ? error.message : 'Something went wrong loading DCF forecast validation.') : null;
  const comparisons = data?.comparisons.filter((c) => c.metric === metric) ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <Field label="Metric">
          <select value={metric} onChange={(e) => setMetric(e.target.value as DcfForecastMetricValue)} className={selectClass}>
            {METRICS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
      </Card>

      {isFetching && <LoadingState />}
      {errorMessage && <ErrorState message={errorMessage} />}

      {!isFetching && !errorMessage && data && (
        <>
          <StatsGrid
            entries={data.statsByMetric.map((s) => ({ label: METRICS.find((m) => m.value === s.metric)?.label ?? s.metric, stats: s.stats }))}
          />

          <Card title="Forecast vs. Actual by Fiscal Year">
            {comparisons.length === 0 ? (
              <EmptyState message="No forecast has been scored against a reported actual yet for this metric — either not enough history exists, or the forecasted years haven't been reported yet." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-ink/10 text-ink/50 border-b text-xs uppercase tracking-wide">
                      <th className="py-2 pr-4">Forecast Made As Of</th>
                      <th className="py-2 pr-4">Fiscal Year</th>
                      <th className="py-2 pr-4">Years Out</th>
                      <th className="py-2 pr-4">Forecast</th>
                      <th className="py-2 pr-4">Actual</th>
                      <th className="py-2 pr-4">Error</th>
                      <th className="py-2 pr-4">Error %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisons.map((c) => (
                      <tr key={`${c.madeAsOfDate}-${c.forecastFiscalYear}`} className="border-ink/5 border-b">
                        <td className="text-ink py-2 pr-4">{c.madeAsOfDate}</td>
                        <td className="text-ink py-2 pr-4">{c.forecastFiscalYear}</td>
                        <td className="text-ink py-2 pr-4">{c.yearsOut}</td>
                        <td className="text-ink py-2 pr-4 tabular-nums">{formatMetricValue(metric, c.forecastValue)}</td>
                        <td className="text-ink py-2 pr-4 tabular-nums">{formatMetricValue(metric, c.actualValue)}</td>
                        <td className="text-ink py-2 pr-4 tabular-nums">{formatMetricValue(metric, c.forecastError)}</td>
                        <td className="text-ink py-2 pr-4 tabular-nums">{c.forecastErrorPct === null ? '—' : formatPct(c.forecastErrorPct)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <MethodologyList items={data.methodology} />
        </>
      )}
    </div>
  );
}
