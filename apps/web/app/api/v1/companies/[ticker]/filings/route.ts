import { NextRequest, NextResponse } from 'next/server';
import { CompanyFilingsNotFoundError, listFilings } from '@/lib/services/secFilingService';
import { SecRateLimitError, SecRequestError } from '@/lib/providers/secEdgar';
import { classifyFilingImportance } from '@/lib/sec/importance';
import { parseItemCodes, type SecFilingTypeValue } from '@/lib/sec/types';

export const dynamic = 'force-dynamic';

const SUPPORTED_TYPES: SecFilingTypeValue[] = ['TEN_K', 'TEN_Q', 'EIGHT_K', 'DEF_14A', 'TWENTY_F', 'OTHER'];

function parseTypes(value: string | null): SecFilingTypeValue[] | undefined {
  if (!value) return undefined;
  const requested = value.split(',').map((t) => t.trim().toUpperCase());
  const valid = requested.filter((t): t is SecFilingTypeValue => SUPPORTED_TYPES.includes(t as SecFilingTypeValue));
  return valid.length > 0 ? valid : undefined;
}

function parseDate(value: string | null): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** GET /api/v1/companies/[ticker]/filings?type=TEN_K,EIGHT_K&from=&to=&material=true
 * The chronological filing feed. `material=true` narrows an already
 * type-filtered result to filings rule-classified as High or Medium
 * importance (see lib/sec/importance.ts) — never AI-classified here. */
export async function GET(request: NextRequest, { params }: { params: { ticker: string } }) {
  const searchParams = request.nextUrl.searchParams;
  const types = parseTypes(searchParams.get('type'));
  const from = parseDate(searchParams.get('from'));
  const to = parseDate(searchParams.get('to'));
  const materialOnly = searchParams.get('material') === 'true';

  try {
    // listFilings only takes a single filingType filter internally; when the
    // caller requests multiple types, fetch unfiltered and narrow in memory
    // — filing lists are small enough (MAX_SYNCED_FILINGS) that this is
    // simpler than teaching the service an "IN" filter for one call site.
    const allFilings = await listFilings(params.ticker, { from, to });
    const filtered = types ? allFilings.filter((f) => types.includes(f.filingType as SecFilingTypeValue)) : allFilings;

    const withImportance = filtered.map((filing) => ({
      ...filing,
      importance: classifyFilingImportance(filing.filingType as SecFilingTypeValue, parseItemCodes(filing.items)),
    }));

    const result = materialOnly ? withImportance.filter((f) => f.importance !== 'Low') : withImportance;

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CompanyFilingsNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof SecRateLimitError) {
      return NextResponse.json({ error: 'SEC EDGAR rate limit reached — try again shortly.' }, { status: 429 });
    }
    if (error instanceof SecRequestError) {
      return NextResponse.json({ error: 'SEC EDGAR is unavailable right now.' }, { status: 502 });
    }
    return NextResponse.json({ error: 'Unexpected error while loading SEC filings.' }, { status: 500 });
  }
}
