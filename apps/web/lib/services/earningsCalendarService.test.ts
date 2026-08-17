import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/services/followedCompaniesService', () => ({
  getFollowedCompanies: vi.fn(),
}));
vi.mock('@/lib/services/earningsCallService', () => ({
  listEarningsCalls: vi.fn(),
}));

import { getFollowedCompanies } from '@/lib/services/followedCompaniesService';
import { listEarningsCalls } from '@/lib/services/earningsCallService';
import { getEarningsCalendar } from './earningsCalendarService';

describe('getEarningsCalendar', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('estimates the next call ~91 days after the last one and clearly labels it as an estimate', async () => {
    vi.mocked(getFollowedCompanies).mockResolvedValue([{ id: 'c1', ticker: 'ACME', name: 'Acme Corp', sources: [{ type: 'watchlist', label: 'Tech' }] }]);
    vi.mocked(listEarningsCalls).mockResolvedValue([
      { id: 'call-1', fiscalYear: 2026, fiscalQuarter: 2, callDate: new Date('2026-07-01') } as never,
    ]);

    const calendar = await getEarningsCalendar('user-1');

    expect(calendar).toHaveLength(1);
    expect(calendar[0]?.isEstimate).toBe(true);
    expect(calendar[0]?.basis).toContain('not a confirmed date');
    expect(new Date(calendar[0]!.expectedDate!).toISOString().slice(0, 10)).toBe('2026-09-30');
  });

  it('never fabricates a date when there is no prior call on record', async () => {
    vi.mocked(getFollowedCompanies).mockResolvedValue([{ id: 'c1', ticker: 'ACME', name: 'Acme Corp', sources: [] }]);
    vi.mocked(listEarningsCalls).mockResolvedValue([]);

    const calendar = await getEarningsCalendar('user-1');
    expect(calendar[0]?.expectedDate).toBeNull();
    expect(calendar[0]?.isEstimate).toBe(false);
  });

  it('degrades gracefully when earnings-call data is unavailable for a company', async () => {
    vi.mocked(getFollowedCompanies).mockResolvedValue([{ id: 'c1', ticker: 'ACME', name: 'Acme Corp', sources: [] }]);
    vi.mocked(listEarningsCalls).mockRejectedValue(new Error('unreachable'));

    const calendar = await getEarningsCalendar('user-1');
    expect(calendar[0]?.expectedDate).toBeNull();
  });

  it('sorts entries by expected date, unknown dates last', async () => {
    vi.mocked(getFollowedCompanies).mockResolvedValue([
      { id: 'c1', ticker: 'LATER', name: 'Later Co', sources: [] },
      { id: 'c2', ticker: 'SOONER', name: 'Sooner Co', sources: [] },
      { id: 'c3', ticker: 'UNKNOWN', name: 'Unknown Co', sources: [] },
    ]);
    vi.mocked(listEarningsCalls).mockImplementation(async (ticker: string) => {
      if (ticker === 'LATER') return [{ id: 'l', fiscalYear: 2026, fiscalQuarter: 2, callDate: new Date('2026-08-01') } as never];
      if (ticker === 'SOONER') return [{ id: 's', fiscalYear: 2026, fiscalQuarter: 2, callDate: new Date('2026-06-01') } as never];
      return [];
    });

    const calendar = await getEarningsCalendar('user-1');
    expect(calendar.map((c) => c.ticker)).toEqual(['SOONER', 'LATER', 'UNKNOWN']);
  });
});
