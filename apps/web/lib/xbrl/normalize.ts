import type { SecCompanyFacts, SecXbrlConcept, SecXbrlFact } from '@/lib/providers/secEdgar';
import { calculateFreeCashFlow } from '@/lib/analytics/ratios';
import { buildPeriodCalendar, classifyDuration, findPeriodByEndDate, periodKeyOf } from './periods';
import {
  ALL_CONCEPT_FIELDS,
  BALANCE_SHEET_FIELDS,
  CASH_FLOW_FIELDS,
  INCOME_STATEMENT_FIELDS,
} from './conceptMap';
import {
  readField,
  type ConceptFieldDef,
  type ExtractedValue,
  type NormalizedPeriod,
  type PeriodKey,
  type StatementType,
} from './types';

/**
 * The normalization engine: raw SEC XBRL company facts -> a standardized,
 * provider-agnostic period list. This is the only place that reconciles
 * "many possible XBRL tags" and "many possible filings per period" into one
 * answer per (standardized field, fiscal period) pair. Nothing downstream of
 * this module ever sees an XBRL tag name.
 */

function matchPeriodForFact(
  fact: SecXbrlFact,
  calendar: PeriodKey[],
  statementType: StatementType,
): PeriodKey | undefined {
  if (statementType === 'balance') {
    return findPeriodByEndDate(calendar, fact.end);
  }

  if (!fact.start) return undefined;
  const kind = classifyDuration(fact.start, fact.end);
  if (!kind) return undefined;

  return findPeriodByEndDate(calendar, fact.end, kind === 'ANNUAL' ? 'annual' : 'quarterly');
}

/**
 * Resolves one standardized field across its candidate tags. Within a tag,
 * the latest-filed fact per period wins (restatements/10-K-A amendments
 * supersede the original). Across tags, a higher-priority tag's coverage is
 * never overridden by a lower-priority one — a lower-priority tag only fills
 * periods the higher-priority tag has no data for at all.
 */
function extractField(
  gaap: Record<string, SecXbrlConcept>,
  fieldDef: ConceptFieldDef,
  calendar: PeriodKey[],
): Map<string, ExtractedValue> {
  const result = new Map<string, ExtractedValue>();

  for (const tag of fieldDef.candidates) {
    const concept = gaap[tag];
    if (!concept) continue;
    const facts = concept.units[fieldDef.unit] ?? [];

    const bestForTag = new Map<string, SecXbrlFact>();
    for (const fact of facts) {
      const period = matchPeriodForFact(fact, calendar, fieldDef.statementType);
      if (!period) continue;

      const key = periodKeyOf(period);
      const existing = bestForTag.get(key);
      if (!existing || fact.filed > existing.filed) {
        bestForTag.set(key, fact);
      }
    }

    for (const [key, fact] of bestForTag) {
      if (result.has(key)) continue;
      result.set(key, {
        value: fact.val,
        tag,
        filing: { form: fact.form, filed: fact.filed, accn: fact.accn },
      });
    }
  }

  return result;
}

const STATEMENT_BUCKET: Record<StatementType, 'incomeStatement' | 'balanceSheet' | 'cashFlow'> = {
  income: 'incomeStatement',
  balance: 'balanceSheet',
  cashflow: 'cashFlow',
};

export function normalizeCompanyFacts(secFacts: SecCompanyFacts): NormalizedPeriod[] {
  const gaap = secFacts.facts['us-gaap'];
  if (!gaap) return [];

  const calendar = buildPeriodCalendar(gaap);
  const periods = new Map<string, NormalizedPeriod>();
  for (const period of calendar) {
    periods.set(periodKeyOf(period), {
      ...period,
      filingType: null,
      filingDate: null,
      accessionNumber: null,
      incomeStatement: {},
      balanceSheet: {},
      cashFlow: {},
      sources: {},
    });
  }

  for (const fieldDef of ALL_CONCEPT_FIELDS) {
    const extracted = extractField(gaap, fieldDef, calendar);

    for (const [key, extractedValue] of extracted) {
      const period = periods.get(key);
      if (!period) continue;

      const bucket = STATEMENT_BUCKET[fieldDef.statementType];
      period[bucket][fieldDef.field] = extractedValue.value;
      period.sources[fieldDef.field] = extractedValue;

      // The period's representative filing = the freshest filing touching it.
      if (!period.filingDate || extractedValue.filing.filed > period.filingDate) {
        period.filingType = extractedValue.filing.form;
        period.filingDate = extractedValue.filing.filed;
        period.accessionNumber = extractedValue.filing.accn;
      }
    }
  }

  // Every field is explicitly null (not undefined) when unmapped, so callers
  // never have to distinguish "not fetched yet" from "genuinely unavailable."
  for (const period of periods.values()) {
    for (const fieldDef of INCOME_STATEMENT_FIELDS) {
      if (!(fieldDef.field in period.incomeStatement))
        period.incomeStatement[fieldDef.field] = null;
    }
    for (const fieldDef of BALANCE_SHEET_FIELDS) {
      if (!(fieldDef.field in period.balanceSheet)) period.balanceSheet[fieldDef.field] = null;
    }
    for (const fieldDef of CASH_FLOW_FIELDS) {
      if (!(fieldDef.field in period.cashFlow)) period.cashFlow[fieldDef.field] = null;
    }
  }

  // Free cash flow is derived (OCF - capex), never a raw XBRL concept — see
  // lib/analytics/ratios.ts's calculateFreeCashFlow for the one formula
  // every FCF figure in the app traces back to.
  for (const period of periods.values()) {
    period.cashFlow.freeCashFlow = calculateFreeCashFlow(
      readField(period.cashFlow, 'operatingCashFlow'),
      readField(period.cashFlow, 'capex'),
    );
  }

  return [...periods.values()].sort((a, b) => b.periodEnd.getTime() - a.periodEnd.getTime());
}
