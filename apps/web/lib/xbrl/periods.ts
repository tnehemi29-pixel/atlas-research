import type { FiscalPeriod } from '@erp/types';
import type { SecXbrlConcept } from '@/lib/providers/secEdgar';
import type { PeriodKey } from './types';

/**
 * Builds the company's reporting-period calendar directly from the calendar
 * dates on its XBRL facts, rather than trusting SEC's `fy`/`fp` metadata.
 *
 * That metadata describes which *filing* a fact was submitted in, not which
 * period it reports on — a 10-K shows three years of comparative income
 * statement data, and every fact in it (current year and both prior-year
 * comparatives) carries the *filing's* fy/fp, not its own. Verified against
 * real Apple data: a fact with start=2016-09-25/end=2017-09-30 (Apple's
 * actual FY2017) is tagged fy:2019/fp:FY because it appears as a comparative
 * figure inside the FY2019 10-K. Deriving periods from start/end dates
 * avoids that trap entirely.
 */

const ANNUAL_MIN_DAYS = 350;
const ANNUAL_MAX_DAYS = 380;
const QUARTER_MIN_DAYS = 80;
const QUARTER_MAX_DAYS = 100;
const DATE_MATCH_TOLERANCE_DAYS = 3;
const DAY_MS = 86_400_000;

function daysBetween(startIso: string, endIso: string): number {
  return Math.round((Date.parse(endIso) - Date.parse(startIso)) / DAY_MS);
}

/**
 * Classifies a duration fact by its length. Anything outside these windows
 * (e.g. a 9-month YTD figure, a stub period from a fiscal-year change) is
 * deliberately not classified — better to drop it than silently mislabel a
 * partial period as a clean quarter or year.
 */
export function classifyDuration(startIso: string, endIso: string): 'ANNUAL' | 'QUARTERLY' | null {
  const days = daysBetween(startIso, endIso);
  if (days >= ANNUAL_MIN_DAYS && days <= ANNUAL_MAX_DAYS) return 'ANNUAL';
  if (days >= QUARTER_MIN_DAYS && days <= QUARTER_MAX_DAYS) return 'QUARTERLY';
  return null;
}

interface Span {
  start: string;
  end: string;
}

/**
 * Scans every us-gaap concept's duration facts (any tag, any unit) to find
 * the company's actual annual and quarterly period boundaries, independent
 * of which specific line items we end up mapping.
 */
export function buildPeriodCalendar(usGaap: Record<string, SecXbrlConcept>): PeriodKey[] {
  const annualSpans = new Map<string, Span>();
  const quarterlySpans = new Map<string, Span>();

  for (const concept of Object.values(usGaap)) {
    for (const facts of Object.values(concept.units)) {
      for (const fact of facts) {
        if (!fact.start) continue;
        const kind = classifyDuration(fact.start, fact.end);
        if (kind === 'ANNUAL') annualSpans.set(fact.end, { start: fact.start, end: fact.end });
        if (kind === 'QUARTERLY')
          quarterlySpans.set(fact.end, { start: fact.start, end: fact.end });
      }
    }
  }

  const annualPeriods: PeriodKey[] = [...annualSpans.values()]
    .sort((a, b) => a.end.localeCompare(b.end))
    .map((span) => ({
      fiscalYear: new Date(span.end).getUTCFullYear(),
      fiscalPeriod: 'FY',
      periodType: 'annual',
      periodStart: new Date(span.start),
      periodEnd: new Date(span.end),
    }));

  // Assign each quarter to the next annual end date on or after it (its
  // fiscal year), then rank quarters chronologically within that fiscal
  // year to label Q1/Q2/Q3. A standalone "Q4" duration fact is rare in XBRL
  // — most filers only report it implicitly as FY minus Q1+Q2+Q3 — so a
  // 4th ranked quarter is labeled Q4 if one genuinely appears, but deriving
  // it when absent is out of scope here (see README limitations).
  const annualEndTimes = annualPeriods.map((p) => p.periodEnd.getTime()).sort((a, b) => a - b);
  const quarterlyByFiscalYear = new Map<number, Span[]>();

  for (const span of [...quarterlySpans.values()].sort((a, b) => a.end.localeCompare(b.end))) {
    const endTime = Date.parse(span.end);
    const fiscalYearEnd = annualEndTimes.find(
      (annualEnd) => annualEnd >= endTime && annualEnd - endTime < 370 * DAY_MS,
    );
    const fiscalYear = fiscalYearEnd
      ? new Date(fiscalYearEnd).getUTCFullYear()
      : new Date(span.end).getUTCFullYear();

    const bucket = quarterlyByFiscalYear.get(fiscalYear) ?? [];
    bucket.push(span);
    quarterlyByFiscalYear.set(fiscalYear, bucket);
  }

  const quarterLabels: FiscalPeriod[] = ['Q1', 'Q2', 'Q3', 'Q4'];
  const quarterlyPeriods: PeriodKey[] = [];
  for (const [fiscalYear, spans] of quarterlyByFiscalYear) {
    const sorted = spans.sort((a, b) => a.end.localeCompare(b.end)).slice(0, 4);
    sorted.forEach((span, index) => {
      quarterlyPeriods.push({
        fiscalYear,
        fiscalPeriod: quarterLabels[index] ?? 'Q4',
        periodType: 'quarterly',
        periodStart: new Date(span.start),
        periodEnd: new Date(span.end),
      });
    });
  }

  return [...annualPeriods, ...quarterlyPeriods];
}

export function periodKeyOf(period: Pick<PeriodKey, 'fiscalYear' | 'fiscalPeriod'>): string {
  return `${period.fiscalYear}-${period.fiscalPeriod}`;
}

/** Finds the calendar period whose end date matches (within tolerance), optionally constrained to a period type. */
export function findPeriodByEndDate(
  calendar: PeriodKey[],
  endIso: string,
  periodType?: 'annual' | 'quarterly',
): PeriodKey | undefined {
  const target = Date.parse(endIso);
  let best: { period: PeriodKey; diff: number } | undefined;

  for (const period of calendar) {
    if (periodType && period.periodType !== periodType) continue;
    const diff = Math.abs(period.periodEnd.getTime() - target);
    if (diff > DATE_MATCH_TOLERANCE_DAYS * DAY_MS) continue;
    if (!best || diff < best.diff) best = { period, diff };
  }

  return best?.period;
}
