import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/requireUser', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/requireUser')>();
  return { ...actual, requireUser: vi.fn() };
});
vi.mock('@/lib/services/valuationOverrideService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/valuationOverrideService')>();
  return { ...actual, saveCostOfDebtOverride: vi.fn(), clearCostOfDebtOverride: vi.fn() };
});
vi.mock('@/lib/services/integritySnapshotService', () => ({ computeIntegritySnapshot: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: { company: { findUnique: vi.fn() } } }));

import { DELETE, PUT } from './route';
import { requireUser } from '@/lib/auth/requireUser';
import { CompanyNotFoundError, InvalidCostOfDebtOverrideError, clearCostOfDebtOverride, saveCostOfDebtOverride } from '@/lib/services/valuationOverrideService';
import { computeIntegritySnapshot } from '@/lib/services/integritySnapshotService';
import { db } from '@/lib/db';

function makeRequest(url: string, body?: unknown): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'), {
    method: 'PUT',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/**
 * Covers the Phase 10 cache-consistency gap: saving/clearing a cost-of-debt
 * override changes the DCF's own validity, but IntegritySnapshot was
 * otherwise only recomputed on a 15-minute TTL or an explicit "Refresh"
 * click — so a company could show a valid, unblocked WACC on the Valuation
 * page while Research Integrity kept reporting the old, stale DCF finding
 * for up to that window. This route now proactively recomputes the
 * snapshot right after a successful save/clear.
 */
describe('PUT/DELETE /api/v1/companies/[ticker]/valuation/cost-of-debt', () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockReset();
    vi.mocked(saveCostOfDebtOverride).mockReset();
    vi.mocked(clearCostOfDebtOverride).mockReset();
    vi.mocked(db.company.findUnique).mockReset();
    vi.mocked(computeIntegritySnapshot).mockReset();
  });

  it('PUT: recomputes the integrity snapshot for this company after a successful save', async () => {
    vi.mocked(requireUser).mockResolvedValue({ id: 'user-1' } as never);
    vi.mocked(saveCostOfDebtOverride).mockResolvedValue(0.0578);
    vi.mocked(db.company.findUnique).mockResolvedValue({ id: 'company-1' } as never);
    vi.mocked(computeIntegritySnapshot).mockResolvedValue({} as never);

    const response = await PUT(makeRequest('/api/v1/companies/AAPL/valuation/cost-of-debt', { costOfDebtOverride: 0.0578 }), {
      params: { ticker: 'AAPL' },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ costOfDebtOverride: 0.0578 });
    expect(computeIntegritySnapshot).toHaveBeenCalledWith('company-1');
  });

  it('DELETE: recomputes the integrity snapshot for this company after a successful clear', async () => {
    vi.mocked(requireUser).mockResolvedValue({ id: 'user-1' } as never);
    vi.mocked(clearCostOfDebtOverride).mockResolvedValue(undefined);
    vi.mocked(db.company.findUnique).mockResolvedValue({ id: 'company-1' } as never);
    vi.mocked(computeIntegritySnapshot).mockResolvedValue({} as never);

    const response = await DELETE(makeRequest('/api/v1/companies/AAPL/valuation/cost-of-debt'), { params: { ticker: 'AAPL' } });

    expect(response.status).toBe(200);
    expect(computeIntegritySnapshot).toHaveBeenCalledWith('company-1');
  });

  it('a transient failure recomputing the snapshot never turns a successful save into an error response', async () => {
    vi.mocked(requireUser).mockResolvedValue({ id: 'user-1' } as never);
    vi.mocked(saveCostOfDebtOverride).mockResolvedValue(0.05);
    vi.mocked(db.company.findUnique).mockResolvedValue({ id: 'company-1' } as never);
    vi.mocked(computeIntegritySnapshot).mockRejectedValue(new Error('transient DB blip'));

    const response = await PUT(makeRequest('/api/v1/companies/AAPL/valuation/cost-of-debt', { costOfDebtOverride: 0.05 }), {
      params: { ticker: 'AAPL' },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ costOfDebtOverride: 0.05 });
  });

  it('does not attempt to recompute a snapshot for a company that no longer resolves by ticker', async () => {
    vi.mocked(requireUser).mockResolvedValue({ id: 'user-1' } as never);
    vi.mocked(saveCostOfDebtOverride).mockResolvedValue(0.05);
    vi.mocked(db.company.findUnique).mockResolvedValue(null);

    const response = await PUT(makeRequest('/api/v1/companies/AAPL/valuation/cost-of-debt', { costOfDebtOverride: 0.05 }), {
      params: { ticker: 'AAPL' },
    });

    expect(response.status).toBe(200);
    expect(computeIntegritySnapshot).not.toHaveBeenCalled();
  });

  it('still maps InvalidCostOfDebtOverrideError to 400 and never attempts a snapshot recompute', async () => {
    vi.mocked(requireUser).mockResolvedValue({ id: 'user-1' } as never);
    vi.mocked(saveCostOfDebtOverride).mockRejectedValue(new InvalidCostOfDebtOverrideError('bad rate'));

    const response = await PUT(makeRequest('/api/v1/companies/AAPL/valuation/cost-of-debt', { costOfDebtOverride: 6.5 }), {
      params: { ticker: 'AAPL' },
    });

    expect(response.status).toBe(400);
    expect(computeIntegritySnapshot).not.toHaveBeenCalled();
  });

  it('still maps CompanyNotFoundError to 404 and never attempts a snapshot recompute', async () => {
    vi.mocked(requireUser).mockResolvedValue({ id: 'user-1' } as never);
    vi.mocked(saveCostOfDebtOverride).mockRejectedValue(new CompanyNotFoundError('no such company'));

    const response = await PUT(makeRequest('/api/v1/companies/ZZZ/valuation/cost-of-debt', { costOfDebtOverride: 0.05 }), {
      params: { ticker: 'ZZZ' },
    });

    expect(response.status).toBe(404);
    expect(computeIntegritySnapshot).not.toHaveBeenCalled();
  });
});
