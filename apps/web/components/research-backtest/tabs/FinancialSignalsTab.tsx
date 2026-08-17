'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchFinancialSignalValidation, type FinancialSignalTypeValue } from '@/lib/api/backtest';
import { ApiError } from '@/lib/api/companies';
import { formatMarketCap } from '@/lib/utils/format';
import { Card, EmptyState, ErrorState, Field, LoadingState, MethodologyList, StatsGrid, formatPct, selectClass } from '../shared';

const SIGNALS: { value: FinancialSignalTypeValue; label: string }[] = [
  { value: 'REVENUE_ACCELERATION', label: 'Revenue Acceleration' },
  { value: 'REVENUE_DECELERATION', label: 'Revenue Deceleration' },
  { value: 'MARGIN_EXPANSION', label: 'Margin Expansion' },
  { value: 'MARGIN_CONTRACTION', label: 'Margin Contraction' },
  { value: 'FCF_GROWTH', label: 'FCF Growth' },
  { value: 'DEBT_REDUCTION', label: 'Debt Reduction' },
  { value: 'GUIDANCE_INCREASE', label: 'Guidance Increase' },
  { value: 'GUIDANCE_DECREASE', label: 'Guidance Decrease' },
];

export function FinancialSignalsTab({ ticker }: { ticker: string }) {
  const [signal, setSignal] = useState<FinancialSignalTypeValue>('REVENUE_ACCELERATION');
  const [segment, setSegment] = useState(false);

  const { data, isFetching, isError, error } = useQuery({
    queryKey: ['backtest-financial-signals', ticker, signal, segment],
    queryFn: ({ signal: abortSignal }) => fetchFinancialSignalValidation([ticker], signal, { segment }, abortSignal),
  });

  const errorMessage = isError ? (error instanceof ApiError ? error.message : 'Something went wrong loading financial signal validation.') : null;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Signal">
            <select value={signal} onChange={(e) => setSignal(e.target.value as FinancialSignalTypeValue)} className={selectClass}>
              {SIGNALS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          <label className="text-ink/70 flex items-center gap-2 pb-1.5 text-sm">
            <input type="checkbox" checked={segment} onChange={(e) => setSegment(e.target.checked)} />
            Show robustness segmentation
          </label>
        </div>
      </Card>

      {isFetching && <LoadingState />}
      {errorMessage && <ErrorState message={errorMessage} />}

      {!isFetching && !errorMessage && data && (
        <>
          <StatsGrid entries={data.statsByHorizon.map((s) => ({ label: `${s.horizonMonths}M`, stats: s.stats }))} />

          <Card title="Observations">
            {data.observations.length === 0 ? (
              <EmptyState message="No qualifying signal was detected for this company, or forward-return data wasn't available for it." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-ink/10 text-ink/50 border-b text-xs uppercase tracking-wide">
                      <th className="py-2 pr-4">Signal Date</th>
                      <th className="py-2 pr-4">Period</th>
                      <th className="py-2 pr-4">Market Cap</th>
                      {[1, 3, 6, 12].map((h) => (
                        <th key={h} className="py-2 pr-4">
                          {h}M
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.observations.map((o) => (
                      <tr key={`${o.ticker}-${o.signalDate}`} className="border-ink/5 border-b">
                        <td className="text-ink py-2 pr-4">{o.signalDate}</td>
                        <td className="text-ink py-2 pr-4">{o.label}</td>
                        <td className="text-ink py-2 pr-4 tabular-nums">{formatMarketCap(o.marketCap)}</td>
                        {[1, 3, 6, 12].map((h) => {
                          const outcome = o.forwardOutcomes.find((f) => f.horizonMonths === h);
                          return (
                            <td key={h} className="text-ink py-2 pr-4 tabular-nums">
                              {outcome ? formatPct(outcome.returnPct) : '—'}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {segment && data.robustness && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Card title="By Calendar Year (3M horizon)">
                <StatsGrid entries={(data.robustness.byYear.find((y) => y.horizonMonths === 3)?.segments ?? []).map((s) => ({ label: s.segment, stats: s.stats }))} />
              </Card>
              <Card title="By Market-Cap Bucket (3M horizon)">
                <StatsGrid entries={(data.robustness.byMarketCapBucket.find((y) => y.horizonMonths === 3)?.segments ?? []).map((s) => ({ label: s.segment, stats: s.stats }))} />
              </Card>
            </div>
          )}

          <MethodologyList items={data.methodology} />
        </>
      )}
    </div>
  );
}
