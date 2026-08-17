import { computeHistoricalAverages } from './historicalAverages';
import { computeNopat, computeUnleveredFcf } from './fcf';
import {
  computeForecastChangeInNwc,
  forecastDriverValues,
  forecastMargins,
  forecastNwcLevels,
  forecastRevenueGrowthRates,
  forecastTaxRate,
  projectRevenue,
} from './forecast';
import { discountFactor, presentValue, sumPresentValues } from './discounting';
import {
  exitMultipleTerminalValue,
  impliedExitMultiple,
  impliedPerpetuityGrowthRate,
  perpetuityGrowthTerminalValue,
} from './terminalValue';
import { buildWaccResult } from './wacc';
import { computeEnterpriseValue, computeEquityValue, computeImpliedSharePrice, computeUpsideDownside } from './bridge';
import { validateDcfInputs, validateForecast } from './validate';
import { shiftSeries, type ScenarioDeltas } from './scenarios';
import type {
  DcfAssumptions,
  DcfMarketData,
  DcfResult,
  ForecastYear,
  HistoricalYear,
  TerminalValueResult,
  ValidationIssue,
  WaccResult,
} from './types';

/**
 * The DCF engine's single entry point. Deterministic and side-effect free:
 * the same (historicals, marketData, assumptions) always produces the same
 * DcfResult, and every intermediate step — forecast, WACC, terminal value,
 * the equity bridge — is exposed on the result rather than collapsed into
 * just the final number, so the UI (and a test) can inspect any point in
 * the chain: Historical Data -> Assumptions -> Forecast -> FCF ->
 * Discounting -> Terminal Value -> Enterprise Value -> Equity Value ->
 * Implied Share Price.
 */

export interface RunDcfParams {
  historicals: HistoricalYear[];
  marketData: DcfMarketData;
  assumptions: DcfAssumptions;
  /** Applied for the Bear/Bull scenarios; omitted (or undefined) for Base. */
  scenarioDeltas?: ScenarioDeltas;
  /**
   * Sensitivity-analysis only: discounts the forecast at this rate instead of
   * the WACC computed from `assumptions.wacc`. `result.wacc` still reports the
   * full calculated breakdown for display — only the discounting math (and
   * anything downstream of it) uses the override. Lets a WACC-vs-terminal-growth
   * grid vary WACC directly, the same way a real sensitivity table does,
   * rather than back-solving it through the equity risk premium.
   */
  waccOverride?: number | null;
}

export function runDcf(params: RunDcfParams): DcfResult {
  const { historicals, marketData, assumptions } = params;

  const lastHistorical = historicals[historicals.length - 1];
  const baseRevenue = lastHistorical?.revenue ?? null;
  const lastHistoricalNwc = lastHistorical?.nwc ?? null;

  const {
    growth: historicalAverageGrowth,
    margin: historicalAverageMargin,
    taxRate: historicalAverageTaxRate,
    daPercent: historicalAverageDaPercent,
    capexPercent: historicalAverageCapexPercent,
    nwcPercent: historicalAverageNwcPercent,
  } = computeHistoricalAverages(historicals);

  // --- Revenue & margin (scenario deltas apply here) -----------------------
  let growthRates = forecastRevenueGrowthRates(assumptions.revenue, assumptions.forecastYears, historicalAverageGrowth);
  let margins = forecastMargins(assumptions.margin, assumptions.forecastYears, historicalAverageMargin);
  let waccAssumptions = assumptions.wacc;

  if (params.scenarioDeltas) {
    growthRates = shiftSeries(growthRates, params.scenarioDeltas.revenueGrowthDelta);
    margins = shiftSeries(margins, params.scenarioDeltas.marginDelta);
    waccAssumptions = {
      ...assumptions.wacc,
      equityRiskPremium: assumptions.wacc.equityRiskPremium + params.scenarioDeltas.equityRiskPremiumDelta,
    };
  }

  const revenues = projectRevenue(baseRevenue, growthRates);
  const taxRate = forecastTaxRate(assumptions.tax, historicalAverageTaxRate);
  const daValues = forecastDriverValues(assumptions.da, revenues, historicalAverageDaPercent);
  const capexValues = forecastDriverValues(assumptions.capex, revenues, historicalAverageCapexPercent);
  const nwcLevels = forecastNwcLevels(assumptions.nwc, revenues, historicalAverageNwcPercent);
  const changeInNwcValues = computeForecastChangeInNwc(nwcLevels, lastHistoricalNwc);

  // --- WACC (uses the same effective tax rate as NOPAT) --------------------
  const wacc: WaccResult = buildWaccResult(waccAssumptions, marketData, taxRate);
  const waccValue = params.waccOverride ?? wacc.wacc.value;

  // --- Forecast years: assembled all-or-nothing per year -------------------
  const forecast: ForecastYear[] = [];
  const startFiscalYear = (lastHistorical?.fiscalYear ?? new Date().getFullYear()) + 1;

  for (let i = 0; i < assumptions.forecastYears; i += 1) {
    const revenue = revenues[i] ?? null;
    const growth = growthRates[i] ?? null;
    const margin = margins[i] ?? null;
    const da = daValues[i] ?? null;
    const capex = capexValues[i] ?? null;
    const nwc = nwcLevels[i] ?? null;
    const changeInNwc = changeInNwcValues[i] ?? null;

    const ebit = revenue !== null && margin !== null ? revenue * margin : null;
    const nopat = computeNopat(ebit, taxRate);
    const unleveredFcf = computeUnleveredFcf(nopat, da, capex, changeInNwc);
    const factor = discountFactor(waccValue, i + 1);
    const pv = presentValue(unleveredFcf, factor);

    if (
      revenue === null ||
      growth === null ||
      margin === null ||
      ebit === null ||
      taxRate === null ||
      nopat === null ||
      da === null ||
      capex === null ||
      nwc === null ||
      changeInNwc === null ||
      unleveredFcf === null ||
      factor === null ||
      pv === null
    ) {
      // A missing input anywhere in the chain invalidates the whole
      // forecast table — partial rows would misrepresent the model.
      forecast.length = 0;
      break;
    }

    forecast.push({
      yearIndex: i + 1,
      fiscalYear: startFiscalYear + i,
      revenueGrowth: growth,
      revenue,
      ebitMargin: margin,
      ebit,
      taxRate,
      nopat,
      da,
      capex,
      nwc,
      changeInNwc,
      unleveredFcf,
      discountFactor: factor,
      presentValueOfFcf: pv,
    });
  }

  const finalYear = forecast[forecast.length - 1];
  const pvOfForecastFcf = forecast.length > 0 ? sumPresentValues(forecast.map((year) => year.presentValueOfFcf)) : null;

  // --- Terminal value --------------------------------------------------------
  const terminalValue = buildTerminalValueResult(assumptions, finalYear, waccValue, forecast.length);
  const discountedTerminalValue = presentValue(
    terminalValue.undiscountedValue,
    finalYear ? discountFactor(waccValue, finalYear.yearIndex) : null,
  );
  terminalValue.presentValue = discountedTerminalValue;

  // --- Enterprise value -> Equity value -> Implied share price ---------------
  const enterpriseValue = computeEnterpriseValue(pvOfForecastFcf, terminalValue.presentValue);
  const equityValue = computeEquityValue(enterpriseValue, marketData.cash, marketData.totalDebt);
  const impliedSharePrice = computeImpliedSharePrice(equityValue, marketData.dilutedSharesOutstanding);
  const upsideDownside = computeUpsideDownside(impliedSharePrice, marketData.currentSharePrice);

  // --- Validation --------------------------------------------------------
  const inputIssues = validateDcfInputs(historicals, marketData, assumptions, waccValue);
  const forecastIssues = validateForecast(forecast);
  const issues: ValidationIssue[] = [...inputIssues, ...forecastIssues];
  const isValid = issues.every((issue) => issue.severity !== 'ERROR');

  return {
    historicals,
    forecast,
    wacc,
    terminalValue,
    pvOfForecastFcf,
    enterpriseValue,
    equityValue,
    impliedSharePrice,
    currentSharePrice: marketData.currentSharePrice,
    upsideDownside,
    issues,
    isValid,
  };
}

function buildTerminalValueResult(
  assumptions: DcfAssumptions,
  finalYear: ForecastYear | undefined,
  waccValue: number | null,
  forecastLength: number,
): TerminalValueResult {
  if (forecastLength === 0 || !finalYear) {
    return {
      method: assumptions.terminalValue.method,
      undiscountedValue: null,
      presentValue: null,
      impliedExitMultiple: null,
      impliedPerpetuityGrowth: null,
    };
  }

  if (assumptions.terminalValue.method === 'perpetuityGrowth') {
    const undiscountedValue = perpetuityGrowthTerminalValue(
      finalYear.unleveredFcf,
      waccValue,
      assumptions.terminalValue.perpetuityGrowthRate,
    );
    return {
      method: 'perpetuityGrowth',
      undiscountedValue,
      presentValue: null, // filled in by the caller once the discount factor is known
      impliedExitMultiple: impliedExitMultiple(undiscountedValue, finalYear.ebit, finalYear.da),
      impliedPerpetuityGrowth: null,
    };
  }

  const undiscountedValue = exitMultipleTerminalValue(finalYear.ebit, finalYear.da, assumptions.terminalValue.exitMultiple);
  return {
    method: 'exitMultiple',
    undiscountedValue,
    presentValue: null,
    impliedExitMultiple: null,
    impliedPerpetuityGrowth: impliedPerpetuityGrowthRate(undiscountedValue, finalYear.unleveredFcf, waccValue),
  };
}

/**
 * Builds sensible, neutral starting assumptions from the company's own
 * history — never an assumption that automatically bets on improvement.
 * Every method here defaults to "continue what the company has actually
 * done" (historical averages), not an optimistic fade or margin expansion.
 */
export function buildDefaultAssumptions(marketData: DcfMarketData): DcfAssumptions {
  return {
    forecastYears: 5,
    revenue: { method: 'historicalGrowth', userGrowthRates: [], fadeStartGrowth: 0.05, fadeEndGrowth: 0.025 },
    margin: { method: 'historicalAverage', userMargin: 0.15, gradualStartMargin: 0.15, gradualEndMargin: 0.15 },
    tax: { method: 'historical', userRate: 0.21 },
    da: { method: 'historicalAverage', percentOfRevenue: 0.03, flatAmount: 0 },
    capex: { method: 'historicalAverage', percentOfRevenue: 0.04, flatAmount: 0 },
    nwc: { method: 'historicalAverage', percentOfRevenue: 0.1, flatAmount: 0 },
    wacc: {
      riskFreeRate: 0.045,
      equityRiskPremium: 0.05,
      beta: marketData.beta ?? 1.0,
      betaSource: marketData.beta !== null ? 'estimate' : 'user',
      costOfDebtMethod: 'historical',
      costOfDebtUser: 0.05,
      marketCapOverride: null,
    },
    terminalValue: { method: 'perpetuityGrowth', perpetuityGrowthRate: 0.025, exitMultiple: 10 },
  };
}
