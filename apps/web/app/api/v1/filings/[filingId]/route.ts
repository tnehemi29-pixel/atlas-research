import { NextResponse } from 'next/server';
import { FilingNotFoundError, getFilingWithSections } from '@/lib/services/secFilingService';
import { SecRateLimitError, SecRequestError } from '@/lib/providers/secEdgar';

export const dynamic = 'force-dynamic';

/** GET /api/v1/filings/[filingId]
 * Filing detail + sections. Triggers the fetch/extract/section pipeline if
 * this filing hasn't been processed yet (PENDING) — the response's
 * `filing.processingStatus` tells the UI whether that succeeded (COMPLETE),
 * is still the original SEC metadata only (unsupported form type, no
 * sections extracted), or failed (FAILED + processingError) — the original
 * filing metadata and secUrl are always present regardless. */
export async function GET(_request: Request, { params }: { params: { filingId: string } }) {
  try {
    const result = await getFilingWithSections(params.filingId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof FilingNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof SecRateLimitError) {
      return NextResponse.json({ error: 'SEC EDGAR rate limit reached — try again shortly.' }, { status: 429 });
    }
    if (error instanceof SecRequestError) {
      return NextResponse.json({ error: 'SEC EDGAR is unavailable right now.' }, { status: 502 });
    }
    return NextResponse.json({ error: 'Unexpected error while loading the filing.' }, { status: 500 });
  }
}
