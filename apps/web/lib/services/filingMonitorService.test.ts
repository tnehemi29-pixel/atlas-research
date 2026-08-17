import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/services/followedCompaniesService', () => ({
  getFollowedCompanies: vi.fn(),
}));
vi.mock('@/lib/services/secFilingService', () => ({
  listFilings: vi.fn(),
}));

import { getFollowedCompanies } from '@/lib/services/followedCompaniesService';
import { listFilings } from '@/lib/services/secFilingService';
import { getFilingMonitor } from './filingMonitorService';

describe('getFilingMonitor', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('flags a recent filing as new and an old one as not new', async () => {
    vi.mocked(getFollowedCompanies).mockResolvedValue([{ id: 'c1', ticker: 'ACME', name: 'Acme Corp', sources: [] }]);
    vi.mocked(listFilings).mockResolvedValue([
      { id: 'f1', formType: '10-Q', filingDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) } as never,
      { id: 'f2', formType: '10-K', filingDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) } as never,
    ]);

    const monitor = await getFilingMonitor('user-1');
    expect(monitor.find((f) => f.filingId === 'f1')?.isNew).toBe(true);
    expect(monitor.find((f) => f.filingId === 'f2')?.isNew).toBe(false);
  });

  it('sorts across companies by filing date, most recent first', async () => {
    vi.mocked(getFollowedCompanies).mockResolvedValue([
      { id: 'c1', ticker: 'AAPL', name: 'Apple', sources: [] },
      { id: 'c2', ticker: 'TSLA', name: 'Tesla', sources: [] },
    ]);
    vi.mocked(listFilings).mockImplementation(async (ticker: string) => {
      if (ticker === 'AAPL') return [{ id: 'a1', formType: '10-Q', filingDate: new Date('2026-08-08') } as never];
      return [{ id: 't1', formType: '8-K', filingDate: new Date('2026-08-07') } as never];
    });

    const monitor = await getFilingMonitor('user-1');
    expect(monitor.map((f) => f.ticker)).toEqual(['AAPL', 'TSLA']);
  });

  it('degrades gracefully when a company has no accessible filings', async () => {
    vi.mocked(getFollowedCompanies).mockResolvedValue([{ id: 'c1', ticker: 'ACME', name: 'Acme Corp', sources: [] }]);
    vi.mocked(listFilings).mockRejectedValue(new Error('unreachable'));

    expect(await getFilingMonitor('user-1')).toEqual([]);
  });
});
