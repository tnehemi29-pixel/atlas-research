import { beforeEach, describe, expect, it, vi } from 'vitest';

const findUnique = vi.fn();
vi.mock('@/lib/db', () => ({
  db: { company: { findUnique: (...args: unknown[]) => findUnique(...args) } },
}));

import { getCostOfDebtOverride } from './valuationOverrideService';

/**
 * Covers the production bug where the Valuation page showed a blocking
 * "WACC could not be calculated" banner while Research Integrity
 * simultaneously reported the DCF dimension as OK for the same company. Root
 * cause: the page's caller (app/company/[ticker]/valuation/page.tsx) used to
 * catch any failure from this lookup and default to `null`, which is
 * indistinguishable from "no override was ever saved" — so a transient Neon
 * pooled-connection blip (see lib/db.ts) silently produced a false negative,
 * even though the saved override was untouched in the database and
 * modelAuditService's own independent query for it succeeded fine.
 *
 * This file mocks `@/lib/db` directly (rather than hitting the real test
 * database, as valuationOverrideService.test.ts does) because the failure
 * mode under test — a transient error on the first attempt, success on the
 * second — can't be deterministically forced against a real database. Kept
 * in its own file specifically so this module-level vi.mock cannot affect
 * that other, real-DB integration suite.
 */
describe('getCostOfDebtOverride retry/error-propagation behavior', () => {
  beforeEach(() => {
    findUnique.mockReset();
  });

  it('returns the saved override on a normal successful lookup', async () => {
    findUnique.mockResolvedValueOnce({ costOfDebtOverride: 0.0578 });
    await expect(getCostOfDebtOverride('AAPL')).resolves.toBe(0.0578);
  });

  it('returns null when the company genuinely has no saved override', async () => {
    findUnique.mockResolvedValueOnce({ costOfDebtOverride: null });
    await expect(getCostOfDebtOverride('AAPL')).resolves.toBeNull();
  });

  it('retries once and still returns the saved override after a single transient failure', async () => {
    findUnique.mockRejectedValueOnce(new Error('Connection terminated unexpectedly'));
    findUnique.mockResolvedValueOnce({ costOfDebtOverride: 0.0578 });

    await expect(getCostOfDebtOverride('AAPL')).resolves.toBe(0.0578);
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it('propagates the error (does not silently return null) when the lookup fails twice in a row', async () => {
    findUnique.mockRejectedValueOnce(new Error('Connection terminated unexpectedly'));
    findUnique.mockRejectedValueOnce(new Error('Connection terminated unexpectedly'));

    await expect(getCostOfDebtOverride('AAPL')).rejects.toThrow('Connection terminated unexpectedly');
  });
});
