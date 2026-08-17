import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { createInvestmentCase } from '@/lib/services/investmentCaseService';
import { setAssumption } from '@/lib/services/investmentCaseAssumptionService';
import { InvestmentCaseNotFoundError } from '@/lib/services/investmentCaseService';
import { auditInvestmentCaseThesis } from './thesisIntegrityService';

const TEST_EMAIL = 'zz-thesis-integrity-test@example.com';
const TICKER = 'ZZTIS1';

async function makeUser(suffix: string) {
  const passwordHash = await hashPassword('irrelevant');
  return db.user.create({ data: { email: `${suffix}-${TEST_EMAIL}`, passwordHash } });
}

async function cleanup() {
  await db.user.deleteMany({ where: { email: { contains: TEST_EMAIL } } });
  await db.company.deleteMany({ where: { ticker: TICKER } });
}

async function makeCompanyWithGuidanceAndFinancials() {
  const company = await db.company.create({ data: { ticker: TICKER, name: 'Thesis Integrity Test Co.' } });
  await db.financialPeriod.create({
    data: {
      companyId: company.id,
      fiscalYear: 2025,
      fiscalPeriod: 'FY',
      periodType: 'ANNUAL',
      periodEnd: new Date('2025-12-31'),
      incomeStatement: { create: { revenue: 10_000_000_000 } },
    },
  });
  const call = await db.earningsCall.create({ data: { companyId: company.id, fiscalYear: 2026, fiscalQuarter: 1, provider: 'test' } });
  // Guidance implies 8%-10% growth on a $10B prior-year baseline: $10.8B-$11.0B.
  await db.guidanceObservation.create({
    data: { earningsCallId: call.id, metric: 'REVENUE', metricLabel: 'Revenue', period: 'FY2026', low: 10_800_000_000, high: 11_000_000_000, midpoint: 10_900_000_000, change: 'NEW', sourceExcerpt: 'x' },
  });
  return company;
}

describe('thesisIntegrityService', () => {
  beforeAll(cleanup);
  afterAll(cleanup);
  afterEach(cleanup);

  it('flags ASSUMPTION CONFLICT when the case\'s revenue-growth assumption conflicts with latest guidance', async () => {
    const user = await makeUser('conflict');
    const company = await makeCompanyWithGuidanceAndFinancials();
    const investmentCase = await createInvestmentCase(user.id, { ticker: TICKER, horizon: '3-5 years', coreThesis: 'Growth thesis.' });
    await setAssumption(user.id, investmentCase.id, { metric: 'REVENUE_GROWTH', scenario: 'BASE', value: 0.15, unit: 'ratio', asOfDate: new Date(), source: 'My model' });

    const findings = await auditInvestmentCaseThesis(user.id, investmentCase.id);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.passed).toBe(false);
    expect(findings[0]!.message).toMatch(/ASSUMPTION CONFLICT/);
    void company;
  });

  it('passes when the assumption is consistent with guidance', async () => {
    const user = await makeUser('consistent');
    await makeCompanyWithGuidanceAndFinancials();
    const investmentCase = await createInvestmentCase(user.id, { ticker: TICKER, horizon: '3-5 years', coreThesis: 'Growth thesis.' });
    await setAssumption(user.id, investmentCase.id, { metric: 'REVENUE_GROWTH', scenario: 'BASE', value: 0.09, unit: 'ratio', asOfDate: new Date(), source: 'My model' });

    const findings = await auditInvestmentCaseThesis(user.id, investmentCase.id);
    expect(findings[0]!.passed).toBe(true);
  });

  it('returns an empty array when the case has no growth assumptions to check', async () => {
    const user = await makeUser('no-assumptions');
    await makeCompanyWithGuidanceAndFinancials();
    const investmentCase = await createInvestmentCase(user.id, { ticker: TICKER, horizon: '3-5 years', coreThesis: 'x' });

    const findings = await auditInvestmentCaseThesis(user.id, investmentCase.id);
    expect(findings).toEqual([]);
  });

  it('never audits another user\'s case — ownership is enforced exactly like Milestone 13\'s own services', async () => {
    const userA = await makeUser('owner');
    const userB = await makeUser('other');
    await makeCompanyWithGuidanceAndFinancials();
    const investmentCase = await createInvestmentCase(userA.id, { ticker: TICKER, horizon: '3-5 years', coreThesis: 'x' });

    await expect(auditInvestmentCaseThesis(userB.id, investmentCase.id)).rejects.toThrow(InvestmentCaseNotFoundError);
  });
});
