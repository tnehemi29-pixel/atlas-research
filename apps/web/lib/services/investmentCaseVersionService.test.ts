import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';

vi.mock('@/lib/valuation/quickValuation', () => ({
  getQuickDcfScenarios: vi.fn(),
  getQuickComps: vi.fn(),
  getQuickFundamentals: vi.fn(),
}));

import { getQuickComps, getQuickDcfScenarios, getQuickFundamentals } from '@/lib/valuation/quickValuation';
import { createInvestmentCase } from './investmentCaseService';
import { setAssumption } from './investmentCaseAssumptionService';
import { compareVersions, createVersion, getVersion, InvestmentCaseVersionNotFoundError, listVersions } from './investmentCaseVersionService';

const TEST_EMAIL = 'zz-icase-version-test@example.com';
const TICKER = 'ZZIVER1';

async function makeUser(suffix: string) {
  const passwordHash = await hashPassword('irrelevant');
  return db.user.create({ data: { email: `${suffix}-${TEST_EMAIL}`, passwordHash } });
}

async function cleanup() {
  await db.user.deleteMany({ where: { email: { contains: TEST_EMAIL } } });
  await db.company.deleteMany({ where: { ticker: TICKER } });
}

function mockLiveValuation(dcfBase: number) {
  vi.mocked(getQuickDcfScenarios).mockResolvedValue({
    bear: { label: 'Bear', currentSharePrice: 100, impliedSharePrice: dcfBase - 20, upsideDownside: null, isValid: true, wacc: 0.09, terminalGrowthRate: 0.02, finalYearRevenue: null, finalYearOperatingMargin: null, finalYearUnleveredFcf: null, forecastYears: 5 },
    base: { label: 'Base', currentSharePrice: 100, impliedSharePrice: dcfBase, upsideDownside: null, isValid: true, wacc: 0.085, terminalGrowthRate: 0.025, finalYearRevenue: null, finalYearOperatingMargin: null, finalYearUnleveredFcf: null, forecastYears: 5 },
    bull: { label: 'Bull', currentSharePrice: 100, impliedSharePrice: dcfBase + 20, upsideDownside: null, isValid: true, wacc: 0.08, terminalGrowthRate: 0.03, finalYearRevenue: null, finalYearOperatingMargin: null, finalYearUnleveredFcf: null, forecastYears: 5 },
  });
  vi.mocked(getQuickComps).mockResolvedValue({ impliedSharePrice: dcfBase - 5, upsideDownside: null, evToEbitda: 15, peerMedianEvToEbitda: 16 });
  vi.mocked(getQuickFundamentals).mockResolvedValue({
    ticker: TICKER, name: `${TICKER} Inc.`, sector: null, industry: null, price: 100, marketCap: 1_000_000_000,
    revenue: 500_000_000, revenueGrowth: 0.1, operatingMargin: 0.25, freeCashFlow: 80_000_000, evToEbitda: 15, peRatio: 20,
  });
}

describe('investmentCaseVersionService', () => {
  beforeAll(cleanup);
  afterAll(cleanup);
  afterEach(async () => {
    await cleanup();
    vi.mocked(getQuickDcfScenarios).mockReset();
    vi.mocked(getQuickComps).mockReset();
    vi.mocked(getQuickFundamentals).mockReset();
  });

  it('creates version 1, then increments to version 2 on the next snapshot', async () => {
    const user = await makeUser('inc');
    mockLiveValuation(120);
    const investmentCase = await createInvestmentCase(user.id, { ticker: TICKER, horizon: '3-5 years', coreThesis: 'A thesis.' });

    const v1 = await createVersion(user.id, investmentCase.id);
    expect(v1.version).toBe(1);

    const v2 = await createVersion(user.id, investmentCase.id);
    expect(v2.version).toBe(2);

    const versions = await listVersions(user.id, investmentCase.id);
    expect(versions.map((v) => v.version)).toEqual([2, 1]);
  });

  it('freezes the live valuation at snapshot time — the snapshot never changes even if the live DCF later moves', async () => {
    const user = await makeUser('freeze');
    mockLiveValuation(120);
    const investmentCase = await createInvestmentCase(user.id, { ticker: TICKER, horizon: '3-5 years', coreThesis: 'A thesis.' });
    const v1 = await createVersion(user.id, investmentCase.id);
    const snapshot1 = v1.snapshot as { valuation: { dcfBase: number | null } };
    expect(snapshot1.valuation.dcfBase).toBe(120);

    mockLiveValuation(150); // live DCF moves
    const fetched = await getVersion(user.id, investmentCase.id, 1);
    const snapshot1Again = fetched.snapshot as { valuation: { dcfBase: number | null } };
    expect(snapshot1Again.valuation.dcfBase).toBe(120); // unchanged
  });

  it('throws for a version number that does not exist', async () => {
    const user = await makeUser('missing');
    mockLiveValuation(100);
    const investmentCase = await createInvestmentCase(user.id, { ticker: TICKER, horizon: '3-5 years', coreThesis: 'A thesis.' });
    await createVersion(user.id, investmentCase.id);

    await expect(getVersion(user.id, investmentCase.id, 99)).rejects.toThrow(InvestmentCaseVersionNotFoundError);
  });

  it('compareVersions surfaces an assumption change and a valuation change between two versions', async () => {
    const user = await makeUser('compare');
    mockLiveValuation(120);
    const investmentCase = await createInvestmentCase(user.id, { ticker: TICKER, horizon: '3-5 years', coreThesis: 'A thesis.' });
    await setAssumption(user.id, investmentCase.id, { metric: 'REVENUE_CAGR', value: 0.12, unit: 'ratio', asOfDate: '2026-08-01', source: 'DCF Model' });
    await createVersion(user.id, investmentCase.id);

    await setAssumption(user.id, investmentCase.id, { metric: 'REVENUE_CAGR', value: 0.09, unit: 'ratio', asOfDate: '2026-08-10', source: 'Updated guidance' });
    mockLiveValuation(100);
    await createVersion(user.id, investmentCase.id);

    const diff = await compareVersions(user.id, investmentCase.id, 1, 2);
    expect(diff.assumptionChanges).toEqual([{ metric: 'REVENUE_CAGR', scenario: 'BASE', label: 'Revenue CAGR', previousValue: 0.12, newValue: 0.09 }]);
    expect(diff.valuationChanges.some((c) => c.label === 'DCF Base Case' && c.previousValue === 120 && c.newValue === 100)).toBe(true);
  });
});
