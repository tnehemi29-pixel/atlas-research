import { describe, expect, it, vi } from 'vitest';

const findUnique = vi.fn();
vi.mock('@/lib/db', () => ({
  db: { company: { findUnique: (...args: unknown[]) => findUnique(...args) } },
  // Mirrors the real lib/db.ts implementation (one retry, then propagate).
  withRetry: async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch {
      return fn();
    }
  },
}));

import { runCompsModelAudit, runDcfModelAudit } from './modelAuditService';

/**
 * Covers runDcfModelAudit/runCompsModelAudit's own db.company.findUnique
 * read, which (like valuationOverrideService.ts's getCostOfDebtOverride
 * before commit 5722872) previously had no protection against a transient
 * Neon pooled-connection blip — see lib/db.ts. Kept in its own file, same
 * reason as valuationOverrideRetry.test.ts: the module-level vi.mock of
 * @/lib/db must not affect modelAuditService.test.ts's real-DB integration
 * suite.
 */
describe('modelAuditService company lookup retry behavior', () => {
  it('runDcfModelAudit: retries once and still proceeds after a single transient findUnique failure', async () => {
    findUnique.mockReset();
    findUnique.mockRejectedValueOnce(new Error('Connection terminated unexpectedly'));
    findUnique.mockResolvedValueOnce(null); // second attempt succeeds — company genuinely doesn't exist

    await expect(runDcfModelAudit('some-id')).resolves.toBeNull();
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it('runCompsModelAudit: retries once and still proceeds after a single transient findUnique failure', async () => {
    findUnique.mockReset();
    findUnique.mockRejectedValueOnce(new Error('Connection terminated unexpectedly'));
    findUnique.mockResolvedValueOnce(null);

    await expect(runCompsModelAudit('some-id')).resolves.toBeNull();
    expect(findUnique).toHaveBeenCalledTimes(2);
  });
});
