'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchEventStudy, type EventStudySourceValue } from '@/lib/api/backtest';
import { ApiError } from '@/lib/api/companies';
import { Card, EmptyState, ErrorState, Field, LoadingState, MethodologyList, StatsGrid, formatPct, inputClass, selectClass } from '../shared';
import { RESEARCH_EVENT_TYPES } from './researchEventTypes';

export function EventsTab({ ticker }: { ticker: string }) {
  const [source, setSource] = useState<EventStudySourceValue>('EARNINGS_CALL');
  const [benchmarkTicker, setBenchmarkTicker] = useState('SPY');
  const [researchEventTypeFilter, setResearchEventTypeFilter] = useState('');

  const { data, isFetching, isError, error } = useQuery({
    queryKey: ['backtest-events', ticker, source, benchmarkTicker, researchEventTypeFilter],
    queryFn: ({ signal }) =>
      fetchEventStudy([ticker], source, { benchmarkTicker, researchEventTypeFilter: researchEventTypeFilter || undefined }, signal),
  });

  const errorMessage = isError ? (error instanceof ApiError ? error.message : 'Something went wrong loading the event study.') : null;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Event Source">
            <select value={source} onChange={(e) => setSource(e.target.value as EventStudySourceValue)} className={selectClass}>
              <option value="EARNINGS_CALL">Earnings Calls</option>
              <option value="RESEARCH_EVENT">Research Events</option>
            </select>
          </Field>
          <Field label="Benchmark">
            <input type="text" value={benchmarkTicker} onChange={(e) => setBenchmarkTicker(e.target.value.toUpperCase())} className={`${inputClass} w-24`} />
          </Field>
          {source === 'RESEARCH_EVENT' && (
            <Field label="Event Type Filter">
              <select value={researchEventTypeFilter} onChange={(e) => setResearchEventTypeFilter(e.target.value)} className={selectClass}>
                <option value="">All types</option>
                {RESEARCH_EVENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
      </Card>

      {isFetching && <LoadingState />}
      {errorMessage && <ErrorState message={errorMessage} />}

      {!isFetching && !errorMessage && data && (
        <>
          <StatsGrid entries={data.statsByWindow.map((s) => ({ label: s.windowLabel, stats: s.stats }))} />

          <Card title="Events">
            {data.events.length === 0 ? (
              <EmptyState message="No events with enough surrounding price data were found for this selection." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-ink/10 text-ink/50 border-b text-xs uppercase tracking-wide">
                      <th className="py-2 pr-4">Event Date</th>
                      <th className="py-2 pr-4">Label</th>
                      {data.statsByWindow.map((s) => (
                        <th key={s.windowLabel} className="py-2 pr-4">
                          {s.windowLabel} Abnormal Return
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.events.map((e) => (
                      <tr key={`${e.ticker}-${e.eventDate}-${e.label}`} className="border-ink/5 border-b">
                        <td className="text-ink py-2 pr-4">{e.eventDate}</td>
                        <td className="text-ink py-2 pr-4">{e.label}</td>
                        {data.statsByWindow.map((s) => {
                          const window = e.windows.find((w) => w.windowLabel === s.windowLabel);
                          return (
                            <td key={s.windowLabel} className="text-ink py-2 pr-4 tabular-nums">
                              {window?.abnormalReturn === null || window?.abnormalReturn === undefined ? '—' : formatPct(window.abnormalReturn)}
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

          <MethodologyList items={data.methodology} />
        </>
      )}
    </div>
  );
}
