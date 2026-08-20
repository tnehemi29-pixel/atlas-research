import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  CompanyNotFoundError,
  InvalidCostOfDebtOverrideError,
  clearCostOfDebtOverride,
  getCostOfDebtOverride,
  saveCostOfDebtOverride,
} from './valuationOverrideService';

const TICKER = 'ZZVOS1';

async function cleanup() {
  await db.company.deleteMany({ where: { ticker: TICKER } });
}

describe('valuationOverrideService', () => {
  beforeAll(cleanup);
  afterAll(cleanup);
  afterEach(cleanup);

  describe('getCostOfDebtOverride', () => {
    it('returns null when no override has ever been saved', async () => {
      await db.company.create({ data: { ticker: TICKER, name: 'Cost of Debt Test Co.' } });
      expect(await getCostOfDebtOverride(TICKER)).toBeNull();
    });

    it('returns null for a company that does not exist', async () => {
      expect(await getCostOfDebtOverride('NOSUCHCO')).toBeNull();
    });
  });

  describe('saveCostOfDebtOverride', () => {
    it('saves a valid decimal rate and it can be read back', async () => {
      await db.company.create({ data: { ticker: TICKER, name: 'Cost of Debt Test Co.' } });
      const saved = await saveCostOfDebtOverride(TICKER, 0.065);
      expect(saved).toBe(0.065);
      expect(await getCostOfDebtOverride(TICKER)).toBe(0.065);
    });

    it('accepts a lowercase ticker the same as an uppercase one', async () => {
      await db.company.create({ data: { ticker: TICKER, name: 'Cost of Debt Test Co.' } });
      await saveCostOfDebtOverride(TICKER.toLowerCase(), 0.04);
      expect(await getCostOfDebtOverride(TICKER)).toBe(0.04);
    });

    it('rejects NaN', async () => {
      await db.company.create({ data: { ticker: TICKER, name: 'Cost of Debt Test Co.' } });
      await expect(saveCostOfDebtOverride(TICKER, NaN)).rejects.toThrow(InvalidCostOfDebtOverrideError);
    });

    it('rejects Infinity', async () => {
      await db.company.create({ data: { ticker: TICKER, name: 'Cost of Debt Test Co.' } });
      await expect(saveCostOfDebtOverride(TICKER, Infinity)).rejects.toThrow(InvalidCostOfDebtOverrideError);
    });

    it('rejects a non-numeric value', async () => {
      await db.company.create({ data: { ticker: TICKER, name: 'Cost of Debt Test Co.' } });
      await expect(saveCostOfDebtOverride(TICKER, '0.05' as unknown as number)).rejects.toThrow(InvalidCostOfDebtOverrideError);
    });

    it('rejects a negative rate', async () => {
      await db.company.create({ data: { ticker: TICKER, name: 'Cost of Debt Test Co.' } });
      await expect(saveCostOfDebtOverride(TICKER, -0.01)).rejects.toThrow(InvalidCostOfDebtOverrideError);
    });

    it('rejects an obviously invalid rate above 100% (a likely percent/decimal mistake)', async () => {
      await db.company.create({ data: { ticker: TICKER, name: 'Cost of Debt Test Co.' } });
      await expect(saveCostOfDebtOverride(TICKER, 6.5)).rejects.toThrow(InvalidCostOfDebtOverrideError);
    });

    it('throws CompanyNotFoundError for a nonexistent company and does not create one', async () => {
      await expect(saveCostOfDebtOverride('NOSUCHCO', 0.05)).rejects.toThrow(CompanyNotFoundError);
      expect(await db.company.findUnique({ where: { ticker: 'NOSUCHCO' } })).toBeNull();
    });
  });

  describe('clearCostOfDebtOverride', () => {
    it('clears a previously saved override back to null', async () => {
      await db.company.create({ data: { ticker: TICKER, name: 'Cost of Debt Test Co.' } });
      await saveCostOfDebtOverride(TICKER, 0.07);
      expect(await getCostOfDebtOverride(TICKER)).toBe(0.07);

      await clearCostOfDebtOverride(TICKER);
      expect(await getCostOfDebtOverride(TICKER)).toBeNull();
    });

    it('throws CompanyNotFoundError for a nonexistent company', async () => {
      await expect(clearCostOfDebtOverride('NOSUCHCO')).rejects.toThrow(CompanyNotFoundError);
    });
  });
});
