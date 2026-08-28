import type { DcfAssumptions, DcfMarketData, ForecastYear, HistoricalYear, ValidationIssue, WaccResult } from './types';

const MAX_SANE_PERPETUITY_GROWTH = 0.06; // above long-run GDP/inflation growth is a red flag, not a hard error

/**
 * Pre-flight checks against the raw inputs — run before (or independent of)
 * computing the forecast. ERROR-severity issues mean the engine cannot
 * produce a trustworthy number and every downstream value field will be
 * null; WARNING issues are surfaced but don't block computation.
 */
interface MissingWaccInputsDescription {
  message: string;
  /** True only for the "has debt, no disclosed interest expense" case — a
   * real company with genuine data, where an analyst's sourced assumption
   * is the missing ingredient, not a sign that something is broken. See
   * ValidationIssue.assumptionRequired's doc comment for how this is used. */
  assumptionRequired: boolean;
}

/** Picks the specific reason WACC is null when the caller has the full
 * breakdown available, rather than the generic catch-all — e.g. "market cap
 * is unavailable" vs. "total debt is unavailable" vs. "this company has debt
 * but no verified cost of debt" are different, differently-actionable facts,
 * and conflating them into one sentence makes the message useless for
 * deciding what to do next. Never fabricates a cause: falls through to the
 * generic message for any combination this doesn't specifically recognize,
 * and never changes whether WACC is valid — only how the failure is worded. */
function describeMissingWaccInputs(wacc: WaccResult): MissingWaccInputsDescription {
  if (wacc.marketCapitalization.value === null) {
    return { message: 'WACC could not be calculated — market capitalization is unavailable; provide a value to continue.', assumptionRequired: false };
  }
  if (wacc.totalDebt.value === null) {
    return { message: 'WACC could not be calculated — total debt is unavailable; provide a value (0 if the company is genuinely debt-free) to continue.', assumptionRequired: false };
  }
  if (wacc.debtWeight.value !== null && wacc.debtWeight.value > 0 && wacc.afterTaxCostOfDebt.value === null) {
    return {
      message:
        'Analyst assumption required — historical cost of debt is unavailable in the latest filing (interest expense is not broken out). Enter a sourced pre-tax cost-of-debt assumption to complete WACC.',
      assumptionRequired: true,
    };
  }
  return { message: 'WACC could not be calculated — check that market cap, total debt, and cost of equity/debt inputs are all provided.', assumptionRequired: false };
}

export function validateDcfInputs(
  historicals: HistoricalYear[],
  marketData: DcfMarketData,
  assumptions: DcfAssumptions,
  waccValue: number | null,
  wacc?: WaccResult,
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
    const description = wacc
      ? describeMissingWaccInputs(wacc)
      : { message: 'WACC could not be calculated — check that market cap, total debt, and cost of equity/debt inputs are all provided.', assumptionRequired: false };
    issues.push({
      severity: 'ERROR',
      field: 'wacc',
      message: description.message,
      assumptionRequired: description.assumptionRequired,
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
