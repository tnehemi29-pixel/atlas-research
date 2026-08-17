export type FiscalPeriod = 'FY' | 'Q1' | 'Q2' | 'Q3' | 'Q4';
export type PeriodType = 'annual' | 'quarterly';

export interface IncomeStatementData {
  revenue: number | null;
  costOfRevenue: number | null;
  grossProfit: number | null;
  operatingExpenses: number | null;
  operatingIncome: number | null;
  interestExpense: number | null;
  pretaxIncome: number | null;
  incomeTax: number | null;
  netIncome: number | null;
  eps: number | null;
  dilutedEps: number | null;
  basicSharesOutstanding: number | null;
  dilutedSharesOutstanding: number | null;
}

export interface BalanceSheetData {
  cashAndEquivalents: number | null;
  shortTermInvestments: number | null;
  accountsReceivable: number | null;
  inventory: number | null;
  totalCurrentAssets: number | null;
  ppe: number | null;
  goodwill: number | null;
  intangibleAssets: number | null;
  totalAssets: number | null;
  accountsPayable: number | null;
  shortTermDebt: number | null;
  longTermDebt: number | null;
  totalCurrentLiabilities: number | null;
  totalLiabilities: number | null;
  stockholdersEquity: number | null;
}

export interface CashFlowData {
  operatingCashFlow: number | null;
  capex: number | null;
  investingCashFlow: number | null;
  financingCashFlow: number | null;
  /** Derived as operatingCashFlow - capex, not a raw reported figure. */
  freeCashFlow: number | null;
  depreciationAmortization: number | null;
  stockBasedCompensation: number | null;
  changeInWorkingCapital: number | null;
}

export interface FinancialPeriodData {
  fiscalYear: number;
  fiscalPeriod: FiscalPeriod;
  periodType: PeriodType;
  periodStart: string | null;
  periodEnd: string;
  filingType: string | null;
  filingDate: string | null;
  incomeStatement: IncomeStatementData;
  balanceSheet: BalanceSheetData;
  cashFlow: CashFlowData;
}

export interface CompanyFinancialsResponse {
  ticker: string;
  periodType: PeriodType;
  periods: FinancialPeriodData[];
  /** true when this is a cached snapshot and the live refresh failed. */
  stale: boolean;
  /** ISO timestamp of the last successful data sync, or null if never synced. */
  dataAsOf: string | null;
}
