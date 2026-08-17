import type { ConceptFieldDef } from './types';

/**
 * The normalization dictionary: standardized Atlas Research field -> the
 * XBRL us-gaap tags that might carry it, in priority order. The first
 * candidate with data for a given period wins for that period; a lower-
 * priority tag only fills periods the higher-priority one doesn't cover
 * (e.g. a company that switched tags after an ASC 606 transition).
 *
 * Verified against real SEC data for two structurally different filers:
 * Apple (RevenueFromContractWithCustomerExcludingAssessedTax, CostOfRevenue-
 * style tags, Inventory present) and JPMorgan Chase (no CostOfRevenue/
 * Inventory tags at all — banks don't report them — but Revenues,
 * NetIncomeLoss, Assets/Liabilities/StockholdersEquity present). A field
 * with no matching tag for a company resolves to null, never a guess.
 */
export const INCOME_STATEMENT_FIELDS: ConceptFieldDef[] = [
  {
    field: 'revenue',
    statementType: 'income',
    unit: 'USD',
    candidates: [
      'RevenueFromContractWithCustomerExcludingAssessedTax',
      'RevenueFromContractWithCustomerIncludingAssessedTax',
      'Revenues',
      'SalesRevenueNet',
      'SalesRevenueGoodsNet',
    ],
  },
  {
    field: 'costOfRevenue',
    statementType: 'income',
    unit: 'USD',
    candidates: [
      'CostOfRevenue',
      'CostOfGoodsAndServicesSold',
      'CostOfGoodsSold',
      'CostOfServices',
    ],
  },
  { field: 'grossProfit', statementType: 'income', unit: 'USD', candidates: ['GrossProfit'] },
  {
    field: 'operatingExpenses',
    statementType: 'income',
    unit: 'USD',
    candidates: ['OperatingExpenses', 'CostsAndExpenses'],
  },
  {
    field: 'operatingIncome',
    statementType: 'income',
    unit: 'USD',
    candidates: ['OperatingIncomeLoss'],
  },
  {
    field: 'interestExpense',
    statementType: 'income',
    unit: 'USD',
    candidates: ['InterestExpense', 'InterestExpenseDebt'],
  },
  {
    field: 'pretaxIncome',
    statementType: 'income',
    unit: 'USD',
    candidates: [
      'IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest',
      'IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments',
      'IncomeLossFromContinuingOperationsBeforeIncomeTaxesDomestic',
    ],
  },
  {
    field: 'incomeTax',
    statementType: 'income',
    unit: 'USD',
    candidates: ['IncomeTaxExpenseBenefit'],
  },
  {
    field: 'netIncome',
    statementType: 'income',
    unit: 'USD',
    candidates: ['NetIncomeLoss', 'ProfitLoss', 'NetIncomeLossAvailableToCommonStockholdersBasic'],
  },
  {
    field: 'eps',
    statementType: 'income',
    unit: 'USD/shares',
    candidates: ['EarningsPerShareBasic'],
  },
  {
    field: 'dilutedEps',
    statementType: 'income',
    unit: 'USD/shares',
    candidates: ['EarningsPerShareDiluted'],
  },
  {
    field: 'basicSharesOutstanding',
    statementType: 'income',
    unit: 'shares',
    candidates: ['WeightedAverageNumberOfSharesOutstandingBasic'],
  },
  {
    field: 'dilutedSharesOutstanding',
    statementType: 'income',
    unit: 'shares',
    candidates: ['WeightedAverageNumberOfDilutedSharesOutstanding'],
  },
];

export const BALANCE_SHEET_FIELDS: ConceptFieldDef[] = [
  {
    field: 'cashAndEquivalents',
    statementType: 'balance',
    unit: 'USD',
    candidates: [
      'CashAndCashEquivalentsAtCarryingValue',
      'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents',
    ],
  },
  {
    field: 'shortTermInvestments',
    statementType: 'balance',
    unit: 'USD',
    candidates: ['ShortTermInvestments', 'MarketableSecuritiesCurrent'],
  },
  {
    field: 'accountsReceivable',
    statementType: 'balance',
    unit: 'USD',
    candidates: ['AccountsReceivableNetCurrent', 'ReceivablesNetCurrent'],
  },
  { field: 'inventory', statementType: 'balance', unit: 'USD', candidates: ['InventoryNet'] },
  {
    field: 'totalCurrentAssets',
    statementType: 'balance',
    unit: 'USD',
    candidates: ['AssetsCurrent'],
  },
  {
    field: 'ppe',
    statementType: 'balance',
    unit: 'USD',
    candidates: ['PropertyPlantAndEquipmentNet'],
  },
  { field: 'goodwill', statementType: 'balance', unit: 'USD', candidates: ['Goodwill'] },
  {
    field: 'intangibleAssets',
    statementType: 'balance',
    unit: 'USD',
    candidates: ['FiniteLivedIntangibleAssetsNet', 'IntangibleAssetsNetExcludingGoodwill'],
  },
  { field: 'totalAssets', statementType: 'balance', unit: 'USD', candidates: ['Assets'] },
  {
    field: 'accountsPayable',
    statementType: 'balance',
    unit: 'USD',
    candidates: ['AccountsPayableCurrent', 'AccountsPayableTradeCurrent'],
  },
  {
    field: 'shortTermDebt',
    statementType: 'balance',
    unit: 'USD',
    candidates: ['ShortTermBorrowings', 'DebtCurrent', 'LongTermDebtCurrent'],
  },
  {
    field: 'longTermDebt',
    statementType: 'balance',
    unit: 'USD',
    candidates: ['LongTermDebtNoncurrent', 'LongTermDebt'],
  },
  {
    field: 'totalCurrentLiabilities',
    statementType: 'balance',
    unit: 'USD',
    candidates: ['LiabilitiesCurrent'],
  },
  { field: 'totalLiabilities', statementType: 'balance', unit: 'USD', candidates: ['Liabilities'] },
  {
    field: 'stockholdersEquity',
    statementType: 'balance',
    unit: 'USD',
    candidates: [
      'StockholdersEquity',
      'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest',
    ],
  },
];

export const CASH_FLOW_FIELDS: ConceptFieldDef[] = [
  {
    field: 'operatingCashFlow',
    statementType: 'cashflow',
    unit: 'USD',
    candidates: [
      'NetCashProvidedByUsedInOperatingActivities',
      'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations',
    ],
  },
  {
    field: 'capex',
    statementType: 'cashflow',
    unit: 'USD',
    candidates: [
      'PaymentsToAcquirePropertyPlantAndEquipment',
      'PaymentsForCapitalImprovements',
      'PaymentsToAcquireProductiveAssets',
    ],
  },
  {
    field: 'investingCashFlow',
    statementType: 'cashflow',
    unit: 'USD',
    candidates: [
      'NetCashProvidedByUsedInInvestingActivities',
      'NetCashProvidedByUsedInInvestingActivitiesContinuingOperations',
    ],
  },
  {
    field: 'financingCashFlow',
    statementType: 'cashflow',
    unit: 'USD',
    candidates: [
      'NetCashProvidedByUsedInFinancingActivities',
      'NetCashProvidedByUsedInFinancingActivitiesContinuingOperations',
    ],
  },
  {
    field: 'depreciationAmortization',
    statementType: 'cashflow',
    unit: 'USD',
    candidates: [
      'DepreciationDepletionAndAmortization',
      'DepreciationAmortizationAndAccretionNet',
      'DepreciationAndAmortization',
      'Depreciation',
    ],
  },
  {
    field: 'stockBasedCompensation',
    statementType: 'cashflow',
    unit: 'USD',
    candidates: ['ShareBasedCompensation'],
  },
  {
    field: 'changeInWorkingCapital',
    statementType: 'cashflow',
    unit: 'USD',
    candidates: ['IncreaseDecreaseInOperatingCapital'],
  },
];

export const ALL_CONCEPT_FIELDS: ConceptFieldDef[] = [
  ...INCOME_STATEMENT_FIELDS,
  ...BALANCE_SHEET_FIELDS,
  ...CASH_FLOW_FIELDS,
];
