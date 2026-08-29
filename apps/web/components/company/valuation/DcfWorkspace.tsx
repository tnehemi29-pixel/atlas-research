'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { CompanyFinancialsResponse, CompanyOverview } from '@erp/types';
import { deriveHistoricalYears } from '@/lib/valuation/historicals';
import { buildMarketData } from '@/lib/valuation/marketData';
import { computeHistoricalAverages } from '@/lib/valuation/historicalAverages';
import { buildDefaultAssumptions, runDcf } from '@/lib/valuation/engine';
import { buildSensitivityGrid } from '@/lib/valuation/sensitivity';
import { DEFAULT_BEAR_DELTAS, DEFAULT_BULL_DELTAS, type ScenarioDeltas } from '@/lib/valuation/scenarios';
import type { DcfAssumptions } from '@/lib/valuation/types';
import { formatMultiple, formatRatioAsPercent } from '@/lib/utils/format';
import { clearCostOfDebtOverride, saveCostOfDebtOverride } from '@/lib/api/valuationOverride';
import { ValuationHeader } from './ValuationHeader';
import { ValidationIssues } from './ValidationIssues';
import { StaleFinancialDataWarning } from './StaleFinancialDataWarning';
import { HistoricalPerformanceTable } from './HistoricalPerformanceTable';
import { ForecastAssumptionsPanel } from './ForecastAssumptionsPanel';
import { WaccPanel } from './WaccPanel';
import { DcfOutputTable } from './DcfOutputTable';
import { ScenarioPanel } from './ScenarioPanel';
import { SensitivityTable } from './SensitivityTable';
import { ValuationCharts } from './charts/ValuationCharts';
import { CompanyNav } from '../CompanyNav';

interface DcfWorkspaceProps {
  ticker: string;
  overview: CompanyOverview;
  financials: CompanyFinancialsResponse;
  /** The company's saved manual cost-of-debt assumption, if any analyst has
   * ever explicitly saved one (null otherwise) — see
   * Company.costOfDebtOverride's schema comment. Only ever seeds the
   * initial WACC assumptions here; never affects buildDefaultAssumptions()
   * itself or any other DCF caller. */
  savedCostOfDebtOverride: number | null;
}

export function DcfWorkspace({ ticker, overview, financials, savedCostOfDebtOverride }: DcfWorkspaceProps) {
  const historicals = useMemo(() => deriveHistoricalYears(financials.periods), [financials]);
  const marketData = useMemo(() => buildMarketData(overview, financials.periods), [overview, financials]);
  const averages = useMemo(() => computeHistoricalAverages(historicals), [historicals]);

  const [assumptions, setAssumptions] = useState<DcfAssumptions>(() => {
    const defaults = buildDefaultAssumptions(marketData);
    if (savedCostOfDebtOverride === null) return defaults;
    return {
      ...defaults,
      wacc: { ...defaults.wacc, costOfDebtMethod: 'user', costOfDebtUser: savedCostOfDebtOverride },
    };
  });
  const [bearDeltas, setBearDeltas] = useState<ScenarioDeltas>(DEFAULT_BEAR_DELTAS);
  const [bullDeltas, setBullDeltas] = useState<ScenarioDeltas>(DEFAULT_BULL_DELTAS);
  const [savedOverride, setSavedOverride] = useState<number | null>(savedCostOfDebtOverride);

  async function handleSaveCostOfDebtOverride(value: number) {
    const saved = await saveCostOfDebtOverride(ticker, value);
    setSavedOverride(saved);
  }

  async function handleClearCostOfDebtOverride() {
    await clearCostOfDebtOverride(ticker);
    setSavedOverride(null);
  }

  const result = useMemo(
    () => runDcf({ historicals, marketData, assumptions }),
    [historicals, marketData, assumptions],
  );
  const bearResult = useMemo(
    () => runDcf({ historicals, marketData, assumptions, scenarioDeltas: bearDeltas }),
    [historicals, marketData, assumptions, bearDeltas],
  );
  const bullResult = useMemo(
    () => runDcf({ historicals, marketData, assumptions, scenarioDeltas: bullDeltas }),
    [historicals, marketData, assumptions, bullDeltas],
  );

  const baseWacc = result.wacc.wacc.value;
  const isExitMultiple = assumptions.terminalValue.method === 'exitMultiple';

  const sensitivityGrid = useMemo(() => {
    if (baseWacc === null) return null;
    const baseRow = isExitMultiple ? assumptions.terminalValue.exitMultiple : assumptions.terminalValue.perpetuityGrowthRate;

    return buildSensitivityGrid({
      rowLabel: isExitMultiple ? 'Exit Multiple' : 'Terminal Growth',
      columnLabel: 'WACC',
      baseRow,
      baseColumn: baseWacc,
      rowStepCount: 2,
      rowStep: isExitMultiple ? 1 : 0.005,
      columnStepCount: 2,
      columnStep: 0.0075,
      recompute: (rowValue, waccValue) => {
        const cellAssumptions: DcfAssumptions = isExitMultiple
          ? { ...assumptions, terminalValue: { ...assumptions.terminalValue, exitMultiple: rowValue } }
          : { ...assumptions, terminalValue: { ...assumptions.terminalValue, perpetuityGrowthRate: rowValue } };
        return runDcf({ historicals, marketData, assumptions: cellAssumptions, waccOverride: waccValue }).impliedSharePrice;
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historicals, marketData, assumptions, baseWacc, isExitMultiple]);

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <div className="mb-2 flex items-center justify-between">
        <CompanyNav ticker={ticker} active="valuation" />
        <Link href={`/company/${ticker}/valuation/methodology`} className="text-accent text-sm hover:underline">
          Methodology →
        </Link>
      </div>

      <ValuationHeader overview={overview} result={result} />
      <ValidationIssues issues={result.issues} />
      <StaleFinancialDataWarning stale={financials.stale} dataAsOf={financials.dataAsOf} />

      <HistoricalPerformanceTable historicals={historicals} />

      <ForecastAssumptionsPanel assumptions={assumptions} onChange={setAssumptions} averages={averages} />

      <WaccPanel
        assumptions={assumptions}
        onChange={setAssumptions}
        wacc={result.wacc}
        marketData={marketData}
        savedCostOfDebtOverride={savedOverride}
        onSaveCostOfDebtOverride={handleSaveCostOfDebtOverride}
        onClearCostOfDebtOverride={handleClearCostOfDebtOverride}
      />

      <DcfOutputTable assumptions={assumptions} onChange={setAssumptions} result={result} marketData={marketData} />

      <ScenarioPanel
        base={result}
        bear={bearResult}
        bull={bullResult}
        bearDeltas={bearDeltas}
        bullDeltas={bullDeltas}
        onChangeBearDeltas={setBearDeltas}
        onChangeBullDeltas={setBullDeltas}
      />

      <section className="mt-8">
        <h2 className="text-ink font-serif text-lg font-semibold">Sensitivity Analysis</h2>
        <p className="text-ink/50 mt-1 text-xs">
          Implied share price at each combination of WACC and{' '}
          {isExitMultiple ? 'the exit EV/EBITDA multiple' : 'the long-term (terminal) growth rate'}, holding every
          other assumption at its current value. The range is centered on the current base case, not a fixed
          absolute range, and the base-case cell is outlined.
        </p>
        {sensitivityGrid ? (
          <div className="mt-3">
            <SensitivityTable
              grid={sensitivityGrid}
              currentPrice={result.currentSharePrice}
              formatRowValue={isExitMultiple ? formatMultiple : formatRatioAsPercent}
              formatColumnValue={formatRatioAsPercent}
            />
          </div>
        ) : (
          <div className="border-ink/10 bg-paper text-ink/50 mt-3 rounded-xl border p-6 text-center text-sm">
            WACC couldn&apos;t be resolved — sensitivity analysis needs a valid discount rate first.
          </div>
        )}
      </section>

      <ValuationCharts
        historicals={historicals}
        forecast={result.forecast}
        sensitivityGrid={sensitivityGrid}
        currentPrice={result.currentSharePrice}
        scenarios={{ bear: bearResult, base: result, bull: bullResult }}
      />
    </main>
  );
}
