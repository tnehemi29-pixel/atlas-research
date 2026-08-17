import type { DcfAssumptions, DcfMarketData, ForecastYear, HistoricalYear, ValidationIssue } from './types';

const MAX_SANE_PERPETUITY_GROWTH = 0.06; // above long-run GDP/inflation growth is a red flag, not a hard error

/**
 * Pre-flight checks against the raw inputs — run before (or independent of)
 * computing the forecast. ERROR-severity issues mean the engine cannot
 * produce a trustworthy number and every downstream value field will be
 * null; WARNING issues are surfaced but don't block computation.
 */
export function validateDcfInputs(
  historicals: HistoricalYear[],
  marketData: DcfMarketData,
  assumptions: DcfAssumptions,
  waccValue: number | null,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!historicals.some((year) => year.revenue !== null)) {
    issues.push({
      severity: 'ERROR',
      field: 'historicals',
      message: 'No historical revenue data is available for this company — a DCF needs a revenue baseline to forecast from.',
    });
  }

  if (marketData.dilutedSharesOutstanding === null) {
    issues.push({
      severity: 'ERROR',
      field: 'dilutedSharesOutstanding',
      message: 'Diluted shares outstanding is unavailable — provide a value to compute an implied share price.',
    });
  }

  if (marketData.totalDebt === null) {
    issues.push({
      severity: 'ERROR',
      field: 'totalDebt',
      message: 'Total debt is unavailable — provide a value (0 if the company is genuinely debt-free) to compute equity value.',
    });
  }

  if (marketData.cash === null) {
    issues.push({
      severity: 'ERROR',
      field: 'cash',
      message: 'Cash & equivalents is unavailable — provide a value to compute equity value.',
    });
  }

  if (marketData.currentSharePrice === null) {
    issues.push({
      severity: 'WARNING',
      field: 'currentSharePrice',
      message: 'Current share price is unavailable — the implied price will show, but upside/downside cannot.',
    });
  }

  if (![3, 5, 7, 10].includes(assumptions.forecastYears)) {
    issues.push({ severity: 'ERROR', field: 'forecastYears', message: 'Forecast horizon must be 3, 5, 7, or 10 years.' });
  }

  if (waccValue === null) {
    issues.push({
      severity: 'ERROR',
      field: 'wacc',
      message: 'WACC could not be calculated — check that market cap, total debt, and cost of equity/debt inputs are all provided.',
    });
  } else if (waccValue <= 0) {
    issues.push({ severity: 'ERROR', field: 'wacc', message: 'WACC must be positive.' });
  }

  if (assumptions.terminalValue.method === 'perpetuityGrowth') {
    const growth = assumptions.terminalValue.perpetuityGrowthRate;

    if (waccValue !== null && waccValue <= growth) {
      issues.push({
        severity: 'ERROR',
        field: 'terminalValue.perpetuityGrowthRate',
        message: `Perpetuity growth rate (${(growth * 100).toFixed(1)}%) must be less than WACC (${(waccValue * 100).toFixed(1)}%) — the terminal value formula divides by (WACC - g), which is undefined or negative otherwise.`,
      });
    }

    if (growth > MAX_SANE_PERPETUITY_GROWTH) {
      issues.push({
        severity: 'WARNING',
        field: 'terminalValue.perpetuityGrowthRate',
        message: `A ${(growth * 100).toFixed(1)}% long-term growth rate is unusually high for a perpetuity — most practitioners cap this near long-run GDP/inflation growth (~2-4%).`,
      });
    }
  }

  if (assumptions.terminalValue.method === 'exitMultiple' && assumptions.terminalValue.exitMultiple <= 0) {
    issues.push({ severity: 'ERROR', field: 'terminalValue.exitMultiple', message: 'Exit EV/EBITDA multiple must be positive.' });
  }

  return issues;
}

/** Post-forecast checks — run once the revenue/EBIT/FCF projection exists. */
export function validateForecast(forecast: ForecastYear[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const year of forecast) {
    if (!Number.isFinite(year.revenue) || year.revenue <= 0) {
      issues.push({
        severity: 'ERROR',
        field: `forecast.fy${year.fiscalYear}.revenue`,
        message: `Projected revenue for fiscal year ${year.fiscalYear} is zero or negative — check the growth assumptions.`,
      });
    }
  }

  return issues;
}
