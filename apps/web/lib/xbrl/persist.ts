import type { IncomeStatement, BalanceSheet, CashFlowStatement } from '@prisma/client';
import type { BalanceSheetData, CashFlowData, IncomeStatementData } from '@erp/types';
import { readField, type NormalizedPeriod } from './types';

/**
 * Maps a NormalizedPeriod's loosely-typed field records onto the exact,
 * fully-typed shapes financialDataService writes to Prisma (and returns to
 * the API). Field names are shared 1:1 across lib/xbrl/conceptMap.ts, these
 * interfaces, and the Prisma schema by construction — this is the one place
 * that treats that as a guarantee instead of re-deriving it ad hoc.
 */

export function toIncomeStatementInput(period: NormalizedPeriod): IncomeStatementData {
  const s = period.incomeStatement;
  return {
    revenue: readField(s, 'revenue'),
    costOfRevenue: readField(s, 'costOfRevenue'),
    grossProfit: readField(s, 'grossProfit'),
    operatingExpenses: readField(s, 'operatingExpenses'),
    operatingIncome: readField(s, 'operatingIncome'),
    interestExpense: readField(s, 'interestExpense'),
    pretaxIncome: readField(s, 'pretaxIncome'),
    incomeTax: readField(s, 'incomeTax'),
    netIncome: readField(s, 'netIncome'),
    eps: readField(s, 'eps'),
    dilutedEps: readField(s, 'dilutedEps'),
    basicSharesOutstanding: readField(s, 'basicSharesOutstanding'),
    dilutedSharesOutstanding: readField(s, 'dilutedSharesOutstanding'),
  };
}

export function toBalanceSheetInput(period: NormalizedPeriod): BalanceSheetData {
  const s = period.balanceSheet;
  return {
    cashAndEquivalents: readField(s, 'cashAndEquivalents'),
    shortTermInvestments: readField(s, 'shortTermInvestments'),
    accountsReceivable: readField(s, 'accountsReceivable'),
    inventory: readField(s, 'inventory'),
    totalCurrentAssets: readField(s, 'totalCurrentAssets'),
    ppe: readField(s, 'ppe'),
    goodwill: readField(s, 'goodwill'),
    intangibleAssets: readField(s, 'intangibleAssets'),
    totalAssets: readField(s, 'totalAssets'),
    accountsPayable: readField(s, 'accountsPayable'),
    shortTermDebt: readField(s, 'shortTermDebt'),
    longTermDebt: readField(s, 'longTermDebt'),
    totalCurrentLiabilities: readField(s, 'totalCurrentLiabilities'),
    totalLiabilities: readField(s, 'totalLiabilities'),
    stockholdersEquity: readField(s, 'stockholdersEquity'),
  };
}

export function toCashFlowInput(period: NormalizedPeriod): CashFlowData {
  const s = period.cashFlow;
  return {
    operatingCashFlow: readField(s, 'operatingCashFlow'),
    capex: readField(s, 'capex'),
    investingCashFlow: readField(s, 'investingCashFlow'),
    financingCashFlow: readField(s, 'financingCashFlow'),
    freeCashFlow: readField(s, 'freeCashFlow'),
    depreciationAmortization: readField(s, 'depreciationAmortization'),
    stockBasedCompensation: readField(s, 'stockBasedCompensation'),
    changeInWorkingCapital: readField(s, 'changeInWorkingCapital'),
  };
}

// Reverse direction — DB row -> API shape. Explicit field-by-field (rather
// than spreading and stripping id/periodId/timestamps) so the API contract
// can't accidentally leak a DB-only column.

export const EMPTY_INCOME_STATEMENT: IncomeStatementData = {
  revenue: null,
  costOfRevenue: null,
  grossProfit: null,
  operatingExpenses: null,
  operatingIncome: null,
  interestExpense: null,
  pretaxIncome: null,
  incomeTax: null,
  netIncome: null,
  eps: null,
  dilutedEps: null,
  basicSharesOutstanding: null,
  dilutedSharesOutstanding: null,
};

export const EMPTY_BALANCE_SHEET: BalanceSheetData = {
  cashAndEquivalents: null,
  shortTermInvestments: null,
  accountsReceivable: null,
  inventory: null,
  totalCurrentAssets: null,
  ppe: null,
  goodwill: null,
  intangibleAssets: null,
  totalAssets: null,
  accountsPayable: null,
  shortTermDebt: null,
  longTermDebt: null,
  totalCurrentLiabilities: null,
  totalLiabilities: null,
  stockholdersEquity: null,
};

export const EMPTY_CASH_FLOW: CashFlowData = {
  operatingCashFlow: null,
  capex: null,
  investingCashFlow: null,
  financingCashFlow: null,
  freeCashFlow: null,
  depreciationAmortization: null,
  stockBasedCompensation: null,
  changeInWorkingCapital: null,
};

export function fromIncomeStatementRow(row: IncomeStatement): IncomeStatementData {
  return {
    revenue: row.revenue,
    costOfRevenue: row.costOfRevenue,
    grossProfit: row.grossProfit,
    operatingExpenses: row.operatingExpenses,
    operatingIncome: row.operatingIncome,
    interestExpense: row.interestExpense,
    pretaxIncome: row.pretaxIncome,
    incomeTax: row.incomeTax,
    netIncome: row.netIncome,
    eps: row.eps,
    dilutedEps: row.dilutedEps,
    basicSharesOutstanding: row.basicSharesOutstanding,
    dilutedSharesOutstanding: row.dilutedSharesOutstanding,
  };
}

export function fromBalanceSheetRow(row: BalanceSheet): BalanceSheetData {
  return {
    cashAndEquivalents: row.cashAndEquivalents,
    shortTermInvestments: row.shortTermInvestments,
    accountsReceivable: row.accountsReceivable,
    inventory: row.inventory,
    totalCurrentAssets: row.totalCurrentAssets,
    ppe: row.ppe,
    goodwill: row.goodwill,
    intangibleAssets: row.intangibleAssets,
    totalAssets: row.totalAssets,
    accountsPayable: row.accountsPayable,
    shortTermDebt: row.shortTermDebt,
    longTermDebt: row.longTermDebt,
    totalCurrentLiabilities: row.totalCurrentLiabilities,
    totalLiabilities: row.totalLiabilities,
    stockholdersEquity: row.stockholdersEquity,
  };
}

export function fromCashFlowRow(row: CashFlowStatement): CashFlowData {
  return {
    operatingCashFlow: row.operatingCashFlow,
    capex: row.capex,
    investingCashFlow: row.investingCashFlow,
    financingCashFlow: row.financingCashFlow,
    freeCashFlow: row.freeCashFlow,
    depreciationAmortization: row.depreciationAmortization,
    stockBasedCompensation: row.stockBasedCompensation,
    changeInWorkingCapital: row.changeInWorkingCapital,
  };
}
