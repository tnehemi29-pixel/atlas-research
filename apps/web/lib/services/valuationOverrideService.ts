import { db } from '@/lib/db';
import { CompanyNotFoundError } from '@/lib/services/financialDataService';

export { CompanyNotFoundError };

/**
 * A saved cost-of-debt override is a decimal pre-tax rate (0.065 = 6.5%),
 * the same convention as every other rate in lib/valuation/. Negative rates
 * are nonsensical; anything above 100% is almost certainly a fat-fingered
 * percent-vs-decimal mistake (entering "6.5" instead of "0.065") rather than
 * a genuine assumption, even for a distressed borrower — reject both rather
 * than silently accept a value.
 */
const MIN_COST_OF_DEBT = 0;
const MAX_COST_OF_DEBT = 1;

export class InvalidCostOfDebtOverrideError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCostOfDebtOverrideError';
  }
}

function validateCostOfDebtOverride(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new InvalidCostOfDebtOverrideError('costOfDebtOverride must be a finite number.');
  }
  if (value < MIN_COST_OF_DEBT || value > MAX_COST_OF_DEBT) {
    throw new InvalidCostOfDebtOverrideError(
      `costOfDebtOverride must be a decimal rate between ${MIN_COST_OF_DEBT} and ${MAX_COST_OF_DEBT} (e.g. 0.065 for 6.5%).`,
    );
  }
  return value;
}

export async function getCostOfDebtOverride(rawTicker: string): Promise<number | null> {
  const ticker = rawTicker.trim().toUpperCase();
  const company = await db.company.findUnique({ where: { ticker }, select: { costOfDebtOverride: true } });
  return company?.costOfDebtOverride ?? null;
}

/**
 * Persists an explicit, user-supplied pre-tax cost-of-debt rate for a
 * company. Never invents or defaults a value — `value` must be exactly what
 * the caller (the Valuation page's Save action) supplies, and must already
 * have been typed in by a human.
 */
export async function saveCostOfDebtOverride(rawTicker: string, value: unknown): Promise<number> {
  const ticker = rawTicker.trim().toUpperCase();
  const validated = validateCostOfDebtOverride(value);

  const company = await db.company.findUnique({ where: { ticker }, select: { id: true } });
  if (!company) throw new CompanyNotFoundError(`No company found for "${ticker}".`);

  const updated = await db.company.update({
    where: { id: company.id },
    data: { costOfDebtOverride: validated },
    select: { costOfDebtOverride: true },
  });
  return updated.costOfDebtOverride as number;
}

export async function clearCostOfDebtOverride(rawTicker: string): Promise<void> {
  const ticker = rawTicker.trim().toUpperCase();
  const company = await db.company.findUnique({ where: { ticker }, select: { id: true } });
  if (!company) throw new CompanyNotFoundError(`No company found for "${ticker}".`);

  await db.company.update({ where: { id: company.id }, data: { costOfDebtOverride: null } });
}
