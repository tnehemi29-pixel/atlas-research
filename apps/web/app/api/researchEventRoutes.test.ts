import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import type { User } from '@prisma/client';

/**
 * Route-shape tests for Milestone 11's API surface — query-param parsing,
 * 404 mapping, and FK-violation-to-404 mapping, mirroring the mocking
 * convention in app/api/v1/companies/[ticker]/financials/route.test.ts
 * (mock the service, exercise the route handler directly). Deep cross-user
 * isolation for the read/unread endpoints is covered separately in
 * app/api/crossUserAccess.test.ts against a real database.
 */

vi.mock('@/lib/auth/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/session')>();
  return { ...actual, getCurrentUser: vi.fn() };
});
vi.mock('@/lib/services/researchEventFeedService', () => ({
  getResearchFeed: vi.fn(),
  getResearchEventDetail: vi.fn(),
  markResearchEventRead: vi.fn(),
  markResearchEventUnread: vi.fn(),
  markAllResearchEventsRead: vi.fn(),
  getCompanyTimeline: vi.fn(),
  getCompanyRecentChanges: vi.fn(),
}));
vi.mock('@/lib/services/thesisMonitorService', () => ({ getThesisMonitor: vi.fn() }));

import { getCurrentUser } from '@/lib/auth/session';
import {
  getCompanyRecentChanges,
  getCompanyTimeline,
  getResearchEventDetail,
  getResearchFeed,
  markAllResearchEventsRead,
  markResearchEventRead,
  markResearchEventUnread,
} from '@/lib/services/researchEventFeedService';
import { getThesisMonitor } from '@/lib/services/thesisMonitorService';

function makeUser(): User {
  return { id: 'user-1', email: 'u@example.com', passwordHash: 'x', createdAt: new Date(), updatedAt: new Date() } as User;
}

function req(url: string, method = 'GET'): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'), { method });
}

describe('research-feed routes', () => {
  afterEach(() => {
    vi.mocked(getCurrentUser).mockReset();
    vi.mocked(getResearchFeed).mockReset();
    vi.mocked(getResearchEventDetail).mockReset();
    vi.mocked(markResearchEventRead).mockReset();
    vi.mocked(markResearchEventUnread).mockReset();
    vi.mocked(markAllResearchEventsRead).mockReset();
  });

  it('GET /api/research-feed returns 401 with no session', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const { GET } = await import('./research-feed/route');
    const response = await GET(req('/api/research-feed'));
    expect(response.status).toBe(401);
  });

  it('GET /api/research-feed parses query params into filters and ignores an invalid materiality value', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(makeUser());
    vi.mocked(getResearchFeed).mockResolvedValue({ items: [], unreadCount: 0 });
    const { GET } = await import('./research-feed/route');

    await GET(req('/api/research-feed?minMateriality=HIGH&category=EARNINGS&unreadOnly=true'));
    expect(getResearchFeed).toHaveBeenCalledWith('user-1', { minMateriality: 'HIGH', category: 'EARNINGS', unreadOnly: true });

    await GET(req('/api/research-feed?minMateriality=NOT_REAL'));
    expect(getResearchFeed).toHaveBeenCalledWith('user-1', { minMateriality: undefined, category: undefined, unreadOnly: false });
  });

  it('GET /api/research-feed/[eventId] returns 404 when the event does not exist', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(makeUser());
    vi.mocked(getResearchEventDetail).mockResolvedValue(null);
    const { GET } = await import('./research-feed/[eventId]/route');

    const response = await GET(req('/api/research-feed/nope'), { params: { eventId: 'nope' } });
    expect(response.status).toBe(404);
  });

  it('POST .../read maps a foreign-key violation (invalid eventId) to 404', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(makeUser());
    vi.mocked(markResearchEventRead).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('FK violation', { code: 'P2003', clientVersion: '5.19.0' }),
    );
    const { POST } = await import('./research-feed/[eventId]/read/route');

    const response = await POST(req('/api/research-feed/nope/read', 'POST'), { params: { eventId: 'nope' } });
    expect(response.status).toBe(404);
  });

  it('POST .../unread succeeds and returns ok', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(makeUser());
    vi.mocked(markResearchEventUnread).mockResolvedValue(undefined);
    const { POST } = await import('./research-feed/[eventId]/unread/route');

    const response = await POST(req('/api/research-feed/e1/unread', 'POST'), { params: { eventId: 'e1' } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(markResearchEventUnread).toHaveBeenCalledWith('user-1', 'e1');
  });

  it('POST /api/research-feed/mark-all-read returns the marked count', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(makeUser());
    vi.mocked(markAllResearchEventsRead).mockResolvedValue(4);
    const { POST } = await import('./research-feed/mark-all-read/route');

    const response = await POST();
    expect(await response.json()).toEqual({ markedCount: 4 });
  });
});

describe('company research-intelligence routes', () => {
  afterEach(() => {
    vi.mocked(getCompanyTimeline).mockReset();
    vi.mocked(getCompanyRecentChanges).mockReset();
    vi.mocked(getThesisMonitor).mockReset();
  });

  it('GET /api/companies/[ticker]/timeline requires no auth and forwards a valid category filter', async () => {
    vi.mocked(getCompanyTimeline).mockResolvedValue([]);
    const { GET } = await import('./companies/[ticker]/timeline/route');

    await GET(req('/api/companies/ACME/timeline?category=SEC_FILING'), { params: { ticker: 'ACME' } });
    expect(getCompanyTimeline).toHaveBeenCalledWith('ACME', { category: 'SEC_FILING' });

    await GET(req('/api/companies/ACME/timeline?category=bogus'), { params: { ticker: 'ACME' } });
    expect(getCompanyTimeline).toHaveBeenCalledWith('ACME', { category: undefined });
  });

  it('GET /api/companies/[ticker]/changes returns the recent-changes list', async () => {
    vi.mocked(getCompanyRecentChanges).mockResolvedValue([{ id: 'e1', category: 'FINANCIAL', type: 'FINANCIAL_CHANGE', title: 't', description: 'd', materiality: 'HIGH', confidence: 'HIGH', eventDate: new Date().toISOString() }]);
    const { GET } = await import('./companies/[ticker]/changes/route');

    const response = await GET(req('/api/companies/ACME/changes'), { params: { ticker: 'ACME' } });
    const body = await response.json();
    expect(body).toHaveLength(1);
  });

  it('GET /api/companies/[ticker]/thesis-monitor returns 404 when there is no research report', async () => {
    vi.mocked(getThesisMonitor).mockResolvedValue(null);
    const { GET } = await import('./companies/[ticker]/thesis-monitor/route');

    const response = await GET(req('/api/companies/ACME/thesis-monitor'), { params: { ticker: 'ACME' } });
    expect(response.status).toBe(404);
  });

  it('GET /api/companies/[ticker]/assumption-changes flattens only assumptions with a recorded comparison', async () => {
    vi.mocked(getThesisMonitor).mockResolvedValue({
      reportId: 'r1',
      reportVersion: 1,
      assumptions: [
        { key: 'WACC', label: 'WACC', originalValue: 0.09, unit: 'ratio', extractedFrom: 'DCF Base case', latestComparison: null },
        {
          key: 'REVENUE_GUIDANCE',
          label: 'Revenue Guidance (FY2026)',
          originalValue: 11,
          unit: 'usd',
          extractedFrom: 'Latest earnings-call guidance',
          latestComparison: { newValue: 9.2, changeAbsolute: -1.8, changePercent: -0.1636, flagged: true, note: 'Potentially inconsistent...', comparedAt: new Date().toISOString(), researchEventId: 'e1' },
        },
      ],
    });
    const { GET } = await import('./companies/[ticker]/assumption-changes/route');

    const response = await GET(req('/api/companies/ACME/assumption-changes'), { params: { ticker: 'ACME' } });
    const body = await response.json();
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ key: 'REVENUE_GUIDANCE', flagged: true, newValue: 9.2 });
  });

  it('GET /api/companies/[ticker]/assumption-changes returns an empty array (never 404) when there is no report', async () => {
    vi.mocked(getThesisMonitor).mockResolvedValue(null);
    const { GET } = await import('./companies/[ticker]/assumption-changes/route');

    const response = await GET(req('/api/companies/ACME/assumption-changes'), { params: { ticker: 'ACME' } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });
});
