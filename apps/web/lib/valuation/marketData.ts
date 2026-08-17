import type { CompanyOverview, FinancialPeriodData } from '@erp/types';
import type { DcfMarketData } from './types';

/**
 * The boundary between Atlas Research's existing company/financials data
 * (Milestones 2-4) and the DCF engine's inputs. Nothing here invents a
 * number — every field either passes through an actual field from the
 * overview/latest balance sheet, sums two actual fields, or is null when the
 * underlying data is unavailable.
 */

function latestAnnualPeriod(periods: FinancialPeriodData[]): FinancialPeriodData | null {
  const annual = periods.filter((period) => period.periodType === 'annual');
  if (annual.length === 0) return null;
  return annual.reduce((latest, period) => (period.fiscalYear > latest.fiscalYear ? period : latest));
}

/** Total debt = short-term + long-term debt from the latest balance sheet.
 * Null only when BOTH breakouts are missing — a company that reports one but
 * not the other still yields a real (if partial) total rather than nulling
 * out the whole figure. */
function totalDebtFrom(period: FinancialPeriodData | null): number | null {
  if (!period) return null;
  const { shortTermDebt, longTermDebt } = period.balanceSheet;
  if (shortTermDebt === null && longTermDebt === null) return null;
  return (shortTermDebt ?? 0) + (longTermDebt ?? 0);
}

export function buildMarketData(overview: CompanyOverview, periods: FinancialPeriodData[]): DcfMarketData {
  const latest = latestAnnualPeriod(periods);

  return {
    currentSharePrice: overview.price,
    marketCapitalization: overview.marketCap,
    totalDebt: totalDebtFrom(latest),
    cash: latest?.balanceSheet.cashAndEquivalents ?? null,
    dilutedSharesOutstanding: latest?.incomeStatement.dilutedSharesOutstanding ?? null,
    beta: overview.beta,
    interestExpense: latest?.incomeStatement.interestExpense ?? null,
  };
}
