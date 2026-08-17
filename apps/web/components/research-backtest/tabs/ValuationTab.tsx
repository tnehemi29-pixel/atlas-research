'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  fetchValuationValidation,
  fetchValuationValidationOutOfSample,
  fetchValuationValidationWalkForward,
  type ValuationValidationResponse,
  type TrainTestSplitResponse,
  type WalkForwardValidationResponse,
} from '@/lib/api/backtest';
import { ApiError } from '@/lib/api/companies';
import { formatPrice } from '@/lib/utils/format';
import { Card, CappedNotice, EmptyState, ErrorState, Field, LoadingState, MethodologyList, StatsGrid, formatPct, inputClass, selectClass, todayIso, yearsAgoIso } from '../shared';

type Mode = 'standard' | 'outOfSample' | 'walkForward';
const HORIZONS = [1, 3, 6, 12] as const;

function ObservationsTable({ data, horizon }: { data: ValuationValidationResponse; horizon: number }) {
  if (data.observations.length === 0) return <EmptyState message="No point-in-time DCF could be computed for this range — likely too little financial history was known as of these dates." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-ink/10 text-ink/50 border-b text-xs uppercase tracking-wide">
            <th className="py-2 pr-4">As Of</th>
            <th className="py-2 pr-4">DCF Value</th>
            <th className="py-2 pr-4">Market Price</th>
            <th className="py-2 pr-4">Premium / Discount</th>
            <th className="py-2 pr-4">{horizon}M Return</th>
            <th className="py-2 pr-4">Excess vs. SPY</th>
          </tr>
        </thead>
        <tbody>
          {data.observations.map((o) => {
            const outcome = o.forwardOutcomes.find((f) => f.horizonMonths === horizon);
            return (
              <tr key={o.asOfDate} className="border-ink/5 border-b">
                <td className="text-ink py-2 pr-4">{o.asOfDate}</td>
                <td className="text-ink py-2 pr-4 tabular-nums">{formatPrice(o.dcfImpliedValue)}</td>
                <td className="text-ink py-2 pr-4 tabular-nums">{formatPrice(o.marketPrice)}</td>
                <td className="text-ink py-2 pr-4 tabular-nums">{formatPct(o.premiumDiscountPct)}</td>
                <td className="text-ink py-2 pr-4 tabular-nums">{outcome ? formatPct(outcome.returnPct) : '—'}</td>
                <td className="text-ink py-2 pr-4 tabular-nums">{outcome ? formatPct(outcome.excessReturnPct) : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StandardResults({ data, horizon }: { data: ValuationValidationResponse; horizon: number }) {
  return (
    <div className="space-y-4">
      <CappedNotice wasCapped={data.wasCapped} sampledDates={data.sampledDates} />
      <StatsGrid entries={data.statsByHorizon.map((s) => ({ label: `${s.horizonMonths}M`, stats: s.stats }))} />
      <Card title="Observations by Period">
        <ObservationsTable data={data} horizon={horizon} />
      </Card>
      <MethodologyList items={data.methodology} />
    </div>
  );
}

function OutOfSampleResults({ data, horizon }: { data: TrainTestSplitResponse<ValuationValidationResponse>; horizon: number }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Card title={`IN-SAMPLE (${data.trainPeriod.fromDate} → ${data.trainPeriod.toDate})`}>
          <StatsGrid entries={data.inSample.statsByHorizon.map((s) => ({ label: `${s.horizonMonths}M`, stats: s.stats }))} />
        </Card>
        <Card title={`OUT-OF-SAMPLE (${data.testPeriod.fromDate} → ${data.testPeriod.toDate})`}>
          <StatsGrid entries={data.outOfSample.statsByHorizon.map((s) => ({ label: `${s.horizonMonths}M`, stats: s.stats }))} />
        </Card>
      </div>
      <Card title="Out-of-Sample Observations by Period">
        <ObservationsTable data={data.outOfSample} horizon={horizon} />
      </Card>
      <MethodologyList items={data.methodology} />
    </div>
  );
}

function WalkForwardResults({ data }: { data: WalkForwardValidationResponse<ValuationValidationResponse> }) {
  if (data.windows.length === 0) {
    return <EmptyState message="No walk-forward windows fit within this date range — widen the range or reduce the training/test window sizes." />;
  }
  return (
    <div className="space-y-4">
      {data.windows.map(({ window, testResult }) => (
        <Card key={window.testStart} title={`Test window: ${window.testStart} → ${window.testEnd} (trained on ${window.trainStart} → ${window.trainEnd})`}>
          <StatsGrid entries={testResult.statsByHorizon.map((s) => ({ label: `${s.horizonMonths}M`, stats: s.stats }))} />
        </Card>
      ))}
      <MethodologyList items={data.methodology} />
    </div>
  );
}

export function ValuationTab({ ticker }: { ticker: string }) {
  const [mode, setMode] = useState<Mode>('standard');
  const [from, setFrom] = useState(yearsAgoIso(3));
  const [to, setTo] = useState(todayIso());
  const [horizon, setHorizon] = useState<number>(3);

  const [trainFrom, setTrainFrom] = useState(yearsAgoIso(6));
  const [trainTo, setTrainTo] = useState(yearsAgoIso(3));
  const [testFrom, setTestFrom] = useState(yearsAgoIso(3));
  const [testTo, setTestTo] = useState(todayIso());

  const [wfFrom, setWfFrom] = useState(yearsAgoIso(8));
  const [wfTo, setWfTo] = useState(todayIso());
  const [initialTrainYears, setInitialTrainYears] = useState(4);
  const [testYears, setTestYears] = useState(1);

  const standardQuery = useQuery({
    queryKey: ['backtest-valuation', ticker, from, to],
    queryFn: ({ signal }) => fetchValuationValidation(ticker, from, to, signal),
    enabled: mode === 'standard',
  });
  const oosQuery = useQuery({
    queryKey: ['backtest-valuation-oos', ticker, trainFrom, trainTo, testFrom, testTo],
    queryFn: ({ signal }) => fetchValuationValidationOutOfSample(ticker, trainFrom, trainTo, testFrom, testTo, signal),
    enabled: mode === 'outOfSample',
  });
  const wfQuery = useQuery({
    queryKey: ['backtest-valuation-wf', ticker, wfFrom, wfTo, initialTrainYears, testYears],
    queryFn: ({ signal }) => fetchValuationValidationWalkForward(ticker, wfFrom, wfTo, initialTrainYears, testYears, signal),
    enabled: mode === 'walkForward',
  });

  const active = mode === 'standard' ? standardQuery : mode === 'outOfSample' ? oosQuery : wfQuery;
  const errorMessage = active.isError ? (active.error instanceof ApiError ? active.error.message : 'Something went wrong loading valuation validation.') : null;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Mode">
            <select value={mode} onChange={(e) => setMode(e.target.value as Mode)} className={selectClass}>
              <option value="standard">Standard</option>
              <option value="outOfSample">Out-of-Sample</option>
              <option value="walkForward">Walk-Forward</option>
            </select>
          </Field>

          {mode === 'standard' && (
            <>
              <Field label="From">
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
              </Field>
              <Field label="To">
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
              </Field>
            </>
          )}

          {mode === 'outOfSample' && (
            <>
              <Field label="Train From">
                <input type="date" value={trainFrom} onChange={(e) => setTrainFrom(e.target.value)} className={inputClass} />
              </Field>
              <Field label="Train To">
                <input type="date" value={trainTo} onChange={(e) => setTrainTo(e.target.value)} className={inputClass} />
              </Field>
              <Field label="Test From">
                <input type="date" value={testFrom} onChange={(e) => setTestFrom(e.target.value)} className={inputClass} />
              </Field>
              <Field label="Test To">
                <input type="date" value={testTo} onChange={(e) => setTestTo(e.target.value)} className={inputClass} />
              </Field>
            </>
          )}

          {mode === 'walkForward' && (
            <>
              <Field label="Full Range From">
                <input type="date" value={wfFrom} onChange={(e) => setWfFrom(e.target.value)} className={inputClass} />
              </Field>
              <Field label="Full Range To">
                <input type="date" value={wfTo} onChange={(e) => setWfTo(e.target.value)} className={inputClass} />
              </Field>
              <Field label="Initial Train Years">
                <input type="number" min={1} max={20} value={initialTrainYears} onChange={(e) => setInitialTrainYears(Number(e.target.value))} className={`${inputClass} w-20`} />
              </Field>
              <Field label="Test Years / Step">
                <input type="number" min={1} max={10} value={testYears} onChange={(e) => setTestYears(Number(e.target.value))} className={`${inputClass} w-20`} />
              </Field>
            </>
          )}

          {mode !== 'walkForward' && (
            <Field label="Table Horizon">
              <select value={horizon} onChange={(e) => setHorizon(Number(e.target.value))} className={selectClass}>
                {HORIZONS.map((h) => (
                  <option key={h} value={h}>
                    {h}M
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
      </Card>

      {active.isFetching && <LoadingState />}
      {errorMessage && <ErrorState message={errorMessage} />}

      {!active.isFetching && !errorMessage && mode === 'standard' && standardQuery.data && <StandardResults data={standardQuery.data} horizon={horizon} />}
      {!active.isFetching && !errorMessage && mode === 'outOfSample' && oosQuery.data && <OutOfSampleResults data={oosQuery.data} horizon={horizon} />}
      {!active.isFetching && !errorMessage && mode === 'walkForward' && wfQuery.data && <WalkForwardResults data={wfQuery.data} />}
    </div>
  );
}
