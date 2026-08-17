import { NextRequest, NextResponse } from 'next/server';
import { searchCompanies } from '@/lib/services/companyService';
import { ProviderNotConfiguredError, ProviderRequestError } from '@/lib/providers/fmp';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q') ?? '';

  if (query.trim().length === 0) {
    return NextResponse.json([]);
  }

  try {
    const results = await searchCompanies(query);
    return NextResponse.json(results);
  } catch (error) {
    if (error instanceof ProviderNotConfiguredError) {
      return NextResponse.json({ error: 'Search is temporarily unavailable.' }, { status: 503 });
    }
    if (error instanceof ProviderRequestError) {
      return NextResponse.json(
        { error: 'Search provider is unavailable right now.' },
        { status: 502 },
      );
    }
    return NextResponse.json({ error: 'Unexpected error while searching.' }, { status: 500 });
  }
}
