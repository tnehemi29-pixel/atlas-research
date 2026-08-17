import type { FiscalPeriod, PeriodType } from '@erp/types';

/** A canonical reporting period derived purely from calendar dates — see periods.ts. */
export interface PeriodKey {
  fiscalYear: number;
  fiscalPeriod: FiscalPeriod;
  periodType: PeriodType;
  periodStart: Date | null;
  periodEnd: Date;
}

export interface FilingRef {
  form: string;
  filed: string;
  accn: string;
}

export type StatementType = 'income' | 'balance' | 'cashflow';
export type XbrlUnit = 'USD' | 'USD/shares' | 'shares';

export interface ConceptFieldDef {
  field: string;
  statementType: StatementType;
  unit: XbrlUnit;
  /** XBRL tags to try, in priority order — the first with data for a given period wins. */
  candidates: string[];
}

export interface ExtractedValue {
  value: number;
  tag: string;
  filing: FilingRef;
}

/** One fully-assembled period: canonical dates + every field resolved (or null) for it. */
export interface NormalizedPeriod extends PeriodKey {
  filingType: string | null;
  filingDate: string | null;
  accessionNumber: string | null;
  incomeStatement: Record<string, number | null>;
  balanceSheet: Record<string, number | null>;
  cashFlow: Record<string, number | null>;
  /** Provenance: standardizedField -> which XBRL tag/filing produced the value. */
  sources: Record<string, ExtractedValue>;
}

export interface ValidationIssue {
  severity: 'WARNING' | 'ERROR';
  fiscalYear: number;
  fiscalPeriod: FiscalPeriod;
  field: string | null;
  message: string;
}

// normalize.ts guarantees every declared field on incomeStatement/balanceSheet/
// cashFlow is set to a number or explicit null (never left undefined) — this
// accessor just gives that guarantee a type that satisfies
// noUncheckedIndexedAccess at call sites, instead of every caller re-deriving it.
export function readField(record: Record<string, number | null>, key: string): number | null {
  return record[key] ?? null;
}
