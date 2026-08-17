import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import {
  createInvestmentCase,
  deleteInvestmentCase,
  getInvestmentCaseDetail,
  getOwnedInvestmentCase,
  InvalidInvestmentCaseInputError,
  InvestmentCaseNotFoundError,
  listInvestmentCases,
  updateInvestmentCase,
} from './investmentCaseService';

/** Integration test against the real local Postgres — ownership enforcement
 * is a claim about actual userId columns, not something a mock can verify. */

const TEST_EMAIL = 'zz-investment-case-test@example.com';
const TICKER = 'ZZICASE1';

async function makeUser(suffix: string) {
  const passwordHash = await hashPassword('irrelevant');
  return db.user.create({ data: { email: `${suffix}-${TEST_EMAIL}`, passwordHash } });
}

async function cleanup() {
  await db.user.deleteMany({ where: { email: { contains: TEST_EMAIL } } });
  await db.company.deleteMany({ where: { ticker: TICKER } });
}

describe('investmentCaseService', () => {
  beforeAll(cleanup);
  afterAll(cleanup);
  afterEach(cleanup);

  it('creates a case, resolving/creating the company by ticker', async () => {
    const user = await makeUser('create');
    const investmentCase = await createInvestmentCase(user.id, { ticker: TICKER.toLowerCase(), horizon: '3-5 years', coreThesis: 'Cloud growth drives FCF expansion.' });

    expect(investmentCase.userId).toBe(user.id);
    expect(investmentCase.status).toBe('RESEARCHING');
    expect(investmentCase.keyDrivers).toEqual([]);

    const company = await db.company.findUnique({ where: { id: investmentCase.companyId } });
    expect(company?.ticker).toBe(TICKER);
  });

  it('rejects an empty core thesis or horizon', async () => {
    const user = await makeUser('validate');
    await expect(createInvestmentCase(user.id, { ticker: TICKER, horizon: '  ', coreThesis: 'x' })).rejects.toThrow(InvalidInvestmentCaseInputError);
    await expect(createInvestmentCase(user.id, { ticker: TICKER, horizon: '3-5 years', coreThesis: '  ' })).rejects.toThrow(InvalidInvestmentCaseInputError);
  });

  it('lists only the requesting user\'s own cases', async () => {
    const userA = await makeUser('list-a');
    const userB = await makeUser('list-b');
    await createInvestmentCase(userA.id, { ticker: TICKER, horizon: '3-5 years', coreThesis: 'A thesis.' });
    await createInvestmentCase(userB.id, { ticker: TICKER, horizon: '3-5 years', coreThesis: 'B thesis.' });

    const casesA = await listInvestmentCases(userA.id);
    expect(casesA).toHaveLength(1);
    expect(casesA[0]?.userId).toBe(userA.id);
  });

  it('getOwnedInvestmentCase throws the same not-found error whether the id is missing or owned by someone else', async () => {
    const userA = await makeUser('own-a');
    const userB = await makeUser('own-b');
    const investmentCase = await createInvestmentCase(userA.id, { ticker: TICKER, horizon: '3-5 years', coreThesis: 'A thesis.' });

    await expect(getOwnedInvestmentCase(userB.id, investmentCase.id)).rejects.toThrow(InvestmentCaseNotFoundError);
    await expect(getOwnedInvestmentCase(userA.id, 'nonexistent-id')).rejects.toThrow(InvestmentCaseNotFoundError);
  });

  it('getInvestmentCaseDetail includes the company and enforces ownership', async () => {
    const userA = await makeUser('detail-a');
    const userB = await makeUser('detail-b');
    const investmentCase = await createInvestmentCase(userA.id, { ticker: TICKER, horizon: '3-5 years', coreThesis: 'A thesis.' });

    const detail = await getInvestmentCaseDetail(userA.id, investmentCase.id);
    expect(detail.company.ticker).toBe(TICKER);

    await expect(getInvestmentCaseDetail(userB.id, investmentCase.id)).rejects.toThrow(InvestmentCaseNotFoundError);
  });

  it('updates only the fields provided, leaving others untouched', async () => {
    const user = await makeUser('update');
    const investmentCase = await createInvestmentCase(user.id, { ticker: TICKER, horizon: '3-5 years', coreThesis: 'Original thesis.', keyDrivers: ['Driver 1'] });

    const updated = await updateInvestmentCase(user.id, investmentCase.id, { status: 'ACTIVE_THESIS' });
    expect(updated.status).toBe('ACTIVE_THESIS');
    expect(updated.coreThesis).toBe('Original thesis.');
    expect(updated.keyDrivers).toEqual(['Driver 1']);
  });

  it('a user can never update or delete another user\'s case', async () => {
    const userA = await makeUser('mutate-a');
    const userB = await makeUser('mutate-b');
    const investmentCase = await createInvestmentCase(userA.id, { ticker: TICKER, horizon: '3-5 years', coreThesis: 'A thesis.' });

    await expect(updateInvestmentCase(userB.id, investmentCase.id, { status: 'ARCHIVED' })).rejects.toThrow(InvestmentCaseNotFoundError);
    await expect(deleteInvestmentCase(userB.id, investmentCase.id)).rejects.toThrow(InvestmentCaseNotFoundError);

    const stillThere = await db.investmentCase.findUnique({ where: { id: investmentCase.id } });
    expect(stillThere).not.toBeNull();
    expect(stillThere?.status).toBe('RESEARCHING');
  });

  it('deletes a case the user owns', async () => {
    const user = await makeUser('delete');
    const investmentCase = await createInvestmentCase(user.id, { ticker: TICKER, horizon: '3-5 years', coreThesis: 'A thesis.' });

    await deleteInvestmentCase(user.id, investmentCase.id);
    const gone = await db.investmentCase.findUnique({ where: { id: investmentCase.id } });
    expect(gone).toBeNull();
  });
});
