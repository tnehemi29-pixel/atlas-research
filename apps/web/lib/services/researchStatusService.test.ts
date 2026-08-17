import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/services/researchReportService', () => ({
  getLatestReport: vi.fn(),
}));
vi.mock('@/lib/services/secFilingService', () => ({
  listFilings: vi.fn(),
}));
vi.mock('@/lib/services/earningsCallService', () => ({
  listEarningsCalls: vi.fn(),
}));
vi.mock('@/lib/services/financialDataService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/financialDataService')>();
  return { ...actual, getFinancials: vi.fn() };
});

import { getLatestReport } from '@/lib/services/researchReportService';
import { listFilings } from '@/lib/services/secFilingService';
import { listEarningsCalls } from '@/lib/services/earningsCallService';
import { getFinancials } from '@/lib/services/financialDataService';
import { getResearchStatus } from './researchStatusService';

describe('getResearchStatus', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('marks research fresh when the latest report is within the staleness window', async () => {
    vi.mocked(getLatestReport).mockResolvedValue({
      id: 'r1',
      version: 2,
      status: 'SUCCESS',
      createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    } as never);
    vi.mocked(listFilings).mockResolvedValue([{ id: 'f1', formType: '10-Q', filingDate: new Date('2026-07-30') } as never]);
    vi.mocked(listEarningsCalls).mockResolvedValue([{ id: 'c1', fiscalYear: 2026, fiscalQuarter: 2, callDate: new Date('2026-07-01') } as never]);
    vi.mocked(getFinancials).mockResolvedValue({ ticker: 'ACME', periodType: 'annual', periods: [], stale: false, dataAsOf: '2026-08-01' });

    const status = await getResearchStatus('ACME', 45);

    expect(status.isStale).toBe(false);
    expect(status.researchAgeDays).toBe(5);
    expect(status.latestFiling?.formType).toBe('10-Q');
    expect(status.latestEarningsCall?.fiscalQuarter).toBe(2);
    expect(status.financialDataAsOf).toBe('2026-08-01');
  });

  it('marks research stale when older than the threshold', async () => {
    vi.mocked(getLatestReport).mockResolvedValue({
      id: 'r1',
      version: 1,
      status: 'SUCCESS',
      createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    } as never);
    vi.mocked(listFilings).mockResolvedValue([]);
    vi.mocked(listEarningsCalls).mockResolvedValue([]);
    vi.mocked(getFinancials).mockResolvedValue({ ticker: 'ACME', periodType: 'annual', periods: [], stale: false, dataAsOf: null });

    const status = await getResearchStatus('ACME', 45);
    expect(status.isStale).toBe(true);
    expect(status.researchAgeDays).toBe(90);
  });

  it('marks research stale (and age null) when no report has ever been generated', async () => {
    vi.mocked(getLatestReport).mockResolvedValue(null);
    vi.mocked(listFilings).mockResolvedValue([]);
    vi.mocked(listEarningsCalls).mockResolvedValue([]);
    vi.mocked(getFinancials).mockResolvedValue({ ticker: 'ACME', periodType: 'annual', periods: [], stale: false, dataAsOf: null });

    const status = await getResearchStatus('ACME');
    expect(status.latestReport).toBeNull();
    expect(status.researchAgeDays).toBeNull();
    expect(status.isStale).toBe(true);
  });

  it('degrades gracefully when filings/earnings/financials are unavailable', async () => {
    vi.mocked(getLatestReport).mockResolvedValue(null);
    vi.mocked(listFilings).mockRejectedValue(new Error('SEC unreachable'));
    vi.mocked(listEarningsCalls).mockRejectedValue(new Error('unreachable'));
    vi.mocked(getFinancials).mockRejectedValue(new Error('unreachable'));

    const status = await getResearchStatus('ACME');
    expect(status.latestFiling).toBeNull();
    expect(status.latestEarningsCall).toBeNull();
    expect(status.financialDataAsOf).toBeNull();
  });
});
