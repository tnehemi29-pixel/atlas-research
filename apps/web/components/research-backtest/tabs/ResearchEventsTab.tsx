'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchResearchEventOutcomeValidation } from '@/lib/api/backtest';
import { ApiError } from '@/lib/api/companies';
import { formatMarketCap } from '@/lib/utils/format';
import { Card, EmptyState, ErrorState, Field, LoadingState, MethodologyList, StatsGrid, formatPct, selectClass } from '../shared';
import { RESEARCH_EVENT_TYPES } from './researchEventTypes';

const HORIZONS = [1, 3, 6];

export function ResearchEventsTab({ ticker }: { ticker: string }) {
  const [eventType, setEventType] = useState(RESEARCH_EVENT_TYPES[3]!.value); // GUIDANCE_CHANGE default
  const [segment, setSegment] = useState(false);

  const { data, isFetching, isError, error } = useQuery({
    queryKey: ['backtest-research-events', ticker, eventType, segment],
    queryFn: ({ signal }) => fetchResearchEventOutcomeValidation([ticker], eventType, { horizonsMonths: HORIZONS, segment }, signal),
  });

  const errorMessage = isError ? (error instanceof ApiError ? error.message : 'Something went wrong loading research event outcome validation.') : null;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Event Type">
            <select value={eventType} onChange={(e) => setEventType(e.target.value)} className={selectClass}>
              {RESEARCH_EVENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
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
              <EmptyState message="No events of this type have been detected for this company yet." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-ink/10 text-ink/50 border-b text-xs uppercase tracking-wide">
                      <th className="py-2 pr-4">Event Date</th>
                      <th className="py-2 pr-4">Title</th>
                      <th className="py-2 pr-4">Market Cap</th>
                      {HORIZONS.map((h) => (
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
                        {HORIZONS.map((h) => {
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
              <Card title="By Calendar Year (1M horizon)">
                <StatsGrid entries={(data.robustness.byYear.find((y) => y.horizonMonths === 1)?.segments ?? []).map((s) => ({ label: s.segment, stats: s.stats }))} />
              </Card>
              <Card title="By Market-Cap Bucket (1M horizon)">
                <StatsGrid entries={(data.robustness.byMarketCapBucket.find((y) => y.horizonMonths === 1)?.segments ?? []).map((s) => ({ label: s.segment, stats: s.stats }))} />
              </Card>
            </div>
          )}

          <MethodologyList items={data.methodology} />
        </>
      )}
    </div>
  );
}
