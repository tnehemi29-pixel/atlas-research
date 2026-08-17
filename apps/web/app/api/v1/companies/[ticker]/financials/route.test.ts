import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/services/financialDataService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/financialDataService')>();
  return { ...actual, getFinancials: vi.fn() };
});

import { GET } from './route';
import { getFinancials, CompanyNotFoundError } from '@/lib/services/financialDataService';
import { SecRateLimitError, SecRequestError } from '@/lib/providers/secEdgar';

function makeRequest(url: string): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'));
}

describe('GET /api/v1/companies/[ticker]/financials', () => {
  it('returns 200 with the financials payload on success', async () => {
    const payload = {
      ticker: 'AAPL',
      periodType: 'annual' as const,
      periods: [],
      stale: false,
      dataAsOf: null,
    };
    vi.mocked(getFinancials).mockResolvedValueOnce(payload);

    const response = await GET(makeRequest('/api/v1/companies/AAPL/financials'), {
      params: { ticker: 'AAPL' },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(payload);
  });

  it('defaults period to "annual" when the query param is absent', async () => {
    vi.mocked(getFinancials).mockResolvedValueOnce({
      ticker: 'AAPL',
      periodType: 'annual',
      periods: [],
      stale: false,
      dataAsOf: null,
    });

    await GET(makeRequest('/api/v1/companies/AAPL/financials'), { params: { ticker: 'AAPL' } });
    expect(vi.mocked(getFinancials)).toHaveBeenCalledWith('AAPL', 'annual');
  });

  it('passes through period=quarterly', async () => {
    vi.mocked(getFinancials).mockResolvedValueOnce({
      ticker: 'AAPL',
      periodType: 'quarterly',
      periods: [],
      stale: false,
      dataAsOf: null,
    });

    await GET(makeRequest('/api/v1/companies/AAPL/financials?period=quarterly'), {
      params: { ticker: 'AAPL' },
    });
    expect(vi.mocked(getFinancials)).toHaveBeenCalledWith('AAPL', 'quarterly');
  });

  it('maps CompanyNotFoundError to 404', async () => {
    vi.mocked(getFinancials).mockRejectedValueOnce(new CompanyNotFoundError('no filer'));
    const response = await GET(makeRequest('/api/v1/companies/ZZZ/financials'), {
      params: { ticker: 'ZZZ' },
    });
    expect(response.status).toBe(404);
  });

  it('maps SecRateLimitError to 429', async () => {
    vi.mocked(getFinancials).mockRejectedValueOnce(new SecRateLimitError());
    const response = await GET(makeRequest('/api/v1/companies/AAPL/financials'), {
      params: { ticker: 'AAPL' },
    });
    expect(response.status).toBe(429);
  });

  it('maps a generic SecRequestError to 502', async () => {
    vi.mocked(getFinancials).mockRejectedValueOnce(new SecRequestError('down'));
    const response = await GET(makeRequest('/api/v1/companies/AAPL/financials'), {
      params: { ticker: 'AAPL' },
    });
    expect(response.status).toBe(502);
  });

  it('maps an unrecognized error to 500 without leaking internals', async () => {
    vi.mocked(getFinancials).mockRejectedValueOnce(
      new Error('something exploded with a stack trace'),
    );
    const response = await GET(makeRequest('/api/v1/companies/AAPL/financials'), {
      params: { ticker: 'AAPL' },
    });
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).not.toContain('stack trace');
  });
});
