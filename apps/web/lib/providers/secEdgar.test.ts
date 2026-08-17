import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildFilingUrl,
  getCompanyFacts,
  getFilingDocument,
  getSubmissions,
  resolveCik,
  SecNotFoundError,
  SecRateLimitError,
  SecRequestError,
} from './secEdgar';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('resolveCik', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          '0': { cik_str: 320193, ticker: 'AAPL', title: 'Fixture Fruit Co.' },
          '1': { cik_str: 19617, ticker: 'JPM', title: 'Fixture Bank Holding Co.' },
        }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves a known ticker to its zero-padded 10-digit CIK, case-insensitively', async () => {
    const identity = await resolveCik('aapl');
    expect(identity).toEqual({ cik: '0000320193', name: 'Fixture Fruit Co.' });
  });

  it('returns null for a ticker with no SEC filer', async () => {
    const identity = await resolveCik('NOSUCHTICKER');
    expect(identity).toBeNull();
  });
});

describe('getCompanyFacts', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws SecNotFoundError on a 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not found', { status: 404 })));
    await expect(getCompanyFacts('0000320193')).rejects.toBeInstanceOf(SecNotFoundError);
  });

  it('retries once on a 429, then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('rate limited', { status: 429 }))
      .mockResolvedValueOnce(
        jsonResponse({ cik: 320193, entityName: 'Fixture Fruit Co.', facts: {} }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await getCompanyFacts('0000320193');
    expect(result.entityName).toBe('Fixture Fruit Co.');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws SecRateLimitError after repeated 429s', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('rate limited', { status: 429 })),
    );
    await expect(getCompanyFacts('0000320193')).rejects.toBeInstanceOf(SecRateLimitError);
  });

  it('throws SecRequestError on other non-2xx statuses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('server error', { status: 500 })),
    );
    await expect(getCompanyFacts('0000320193')).rejects.toBeInstanceOf(SecRequestError);
  });
});

describe('getSubmissions', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reshapes SEC\'s columnar filings.recent arrays into one record per filing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          cik: '320193',
          name: 'Fixture Fruit Co.',
          filings: {
            recent: {
              accessionNumber: ['0000320193-24-000123', '0000320193-24-000099'],
              form: ['10-K', '8-K'],
              filingDate: ['2024-11-01', '2024-08-01'],
              reportDate: ['2024-09-28', ''],
              items: ['', '2.02,9.01'],
              primaryDocument: ['aapl-20240928.htm', 'aapl-8k.htm'],
              primaryDocDescription: ['10-K', '8-K'],
              size: [500000, 12000],
              isXBRL: [1, 0],
            },
          },
        }),
      ),
    );

    const result = await getSubmissions('0000320193');
    expect(result.cik).toBe('320193');
    expect(result.filings).toHaveLength(2);
    expect(result.filings[0]).toEqual({
      accessionNumber: '0000320193-24-000123',
      form: '10-K',
      filingDate: '2024-11-01',
      reportDate: '2024-09-28',
      items: null, // empty string -> null, not an empty-string "item"
      primaryDocument: 'aapl-20240928.htm',
      primaryDocDescription: '10-K',
      size: 500000,
      isXBRL: true,
    });
    expect(result.filings[1]?.items).toBe('2.02,9.01');
    expect(result.filings[1]?.reportDate).toBeNull();
  });

  it('throws SecNotFoundError for an unknown CIK', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not found', { status: 404 })));
    await expect(getSubmissions('0000000000')).rejects.toBeInstanceOf(SecNotFoundError);
  });
});

describe('buildFilingUrl', () => {
  it('strips leading zeros from the CIK and dashes from the accession number', () => {
    expect(buildFilingUrl('0000320193', '0000320193-24-000123', 'aapl-20240928.htm')).toBe(
      'https://www.sec.gov/Archives/edgar/data/320193/000032019324000123/aapl-20240928.htm',
    );
  });
});

describe('getFilingDocument', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the raw text body rather than parsing it as JSON', async () => {
    const html = '<html><body><h1>Item 1A. Risk Factors</h1><p>Some risk.</p></body></html>';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(html, { status: 200, headers: { 'Content-Type': 'text/html' } })),
    );
    const result = await getFilingDocument('https://www.sec.gov/Archives/edgar/data/320193/x/aapl.htm');
    expect(result).toBe(html);
  });

  it('still applies the same 404/429 handling as the JSON fetch path', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not found', { status: 404 })));
    await expect(getFilingDocument('https://www.sec.gov/Archives/edgar/data/x/y/z.htm')).rejects.toBeInstanceOf(
      SecNotFoundError,
    );
  });
});
