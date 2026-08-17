import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { createInvestmentCase, InvestmentCaseNotFoundError } from './investmentCaseService';
import { deleteAssumption, InvestmentCaseAssumptionNotFoundError, listAssumptions, setAssumption } from './investmentCaseAssumptionService';
import { createEvidence, deleteEvidence, InvestmentCaseEvidenceNotFoundError, listEvidence, UnsupportedEvidenceSourceError } from './investmentCaseEvidenceService';
import { createRisk, deleteRisk, InvestmentCaseRiskNotFoundError, listRisks, updateRisk } from './investmentCaseRiskService';
import { createCatalyst, deleteCatalyst, InvestmentCaseCatalystNotFoundError, listCatalysts, updateCatalyst } from './investmentCaseCatalystService';
import {
  createInvalidationCriterion,
  deleteInvalidationCriterion,
  InvestmentCaseInvalidationCriterionNotFoundError,
  listInvalidationCriteria,
  updateInvalidationCriterion,
} from './investmentCaseInvalidationCriterionService';

/** Integration tests against real Postgres — ownership scoping and the
 * evidence-source foreign-key validation are both claims about real rows. */

const TEST_EMAIL = 'zz-icase-child-test@example.com';
const TICKER = 'ZZICHILD1';

async function makeUser(suffix: string) {
  const passwordHash = await hashPassword('irrelevant');
  return db.user.create({ data: { email: `${suffix}-${TEST_EMAIL}`, passwordHash } });
}

async function makeCase(userId: string) {
  return createInvestmentCase(userId, { ticker: TICKER, horizon: '3-5 years', coreThesis: 'A thesis.' });
}

async function cleanup() {
  await db.user.deleteMany({ where: { email: { contains: TEST_EMAIL } } });
  await db.company.deleteMany({ where: { ticker: TICKER } });
}

describe('investment case child services', () => {
  beforeAll(cleanup);
  afterAll(cleanup);
  afterEach(cleanup);

  describe('assumptions', () => {
    it('setAssumption upserts on (metric, scenario) — a second call with the same key updates, not duplicates', async () => {
      const user = await makeUser('assum-upsert');
      const investmentCase = await makeCase(user.id);

      await setAssumption(user.id, investmentCase.id, { metric: 'REVENUE_CAGR', scenario: 'BASE', value: 0.12, unit: 'ratio', asOfDate: '2026-08-01', source: 'DCF Model' });
      await setAssumption(user.id, investmentCase.id, { metric: 'REVENUE_CAGR', scenario: 'BASE', value: 0.14, unit: 'ratio', asOfDate: '2026-08-05', source: 'DCF Model' });

      const assumptions = await listAssumptions(user.id, investmentCase.id);
      expect(assumptions).toHaveLength(1);
      expect(assumptions[0]?.value).toBe(0.14);
    });

    it('a different scenario for the same metric is a separate row', async () => {
      const user = await makeUser('assum-scenario');
      const investmentCase = await makeCase(user.id);
      await setAssumption(user.id, investmentCase.id, { metric: 'OPERATING_MARGIN', scenario: 'BULL', value: 0.35, unit: 'ratio', asOfDate: '2026-08-01', source: 'Bull case' });
      await setAssumption(user.id, investmentCase.id, { metric: 'OPERATING_MARGIN', scenario: 'BEAR', value: 0.22, unit: 'ratio', asOfDate: '2026-08-01', source: 'Bear case' });
      const assumptions = await listAssumptions(user.id, investmentCase.id);
      expect(assumptions).toHaveLength(2);
    });

    it('enforces ownership on delete', async () => {
      const userA = await makeUser('assum-del-a');
      const userB = await makeUser('assum-del-b');
      const investmentCase = await makeCase(userA.id);
      const assumption = await setAssumption(userA.id, investmentCase.id, { metric: 'WACC', value: 0.08, unit: 'ratio', asOfDate: '2026-08-01', source: 'DCF' });

      await expect(deleteAssumption(userB.id, investmentCase.id, assumption.id)).rejects.toThrow(InvestmentCaseNotFoundError);
      await deleteAssumption(userA.id, investmentCase.id, assumption.id);
      await expect(deleteAssumption(userA.id, investmentCase.id, assumption.id)).rejects.toThrow(InvestmentCaseAssumptionNotFoundError);
    });
  });

  describe('evidence — source validation', () => {
    it('rejects evidence with no source at all (the AI-invented-evidence case from spec section 27)', async () => {
      const user = await makeUser('ev-reject');
      const investmentCase = await makeCase(user.id);

      await expect(
        createEvidence(user.id, investmentCase.id, {
          claim: 'Margins are expanding.',
          evidence: 'The model says so.',
          date: '2026-08-01',
          category: 'Margins',
          direction: 'SUPPORTS',
          strength: 'HIGH',
          sourceType: 'TEN_K',
          sourceLabel: 'A 10-K, allegedly',
          secFilingId: null,
        }),
      ).rejects.toThrow(UnsupportedEvidenceSourceError);

      const evidence = await listEvidence(user.id, investmentCase.id);
      expect(evidence).toHaveLength(0);
    });

    it('rejects evidence pointing at a real filing ID that belongs to a DIFFERENT company', async () => {
      const user = await makeUser('ev-wrong-company');
      const investmentCase = await makeCase(user.id);
      const otherCompany = await db.company.upsert({ where: { ticker: 'ZZICHILDOTHER' }, create: { ticker: 'ZZICHILDOTHER', name: 'Other Co' }, update: {} });
      const filing = await db.secFiling.create({
        data: { companyId: otherCompany.id, filingType: 'TEN_K', formType: '10-K', filingDate: new Date('2026-01-01'), accessionNumber: 'zz-acc-1', primaryDocument: 'doc.htm', secUrl: 'https://example.com' },
      });

      await expect(
        createEvidence(user.id, investmentCase.id, {
          claim: 'Revenue grew.',
          evidence: 'Per the 10-K.',
          date: '2026-08-01',
          category: 'Growth',
          direction: 'SUPPORTS',
          strength: 'HIGH',
          sourceType: 'TEN_K',
          sourceLabel: '10-K filing',
          secFilingId: filing.id,
        }),
      ).rejects.toThrow(UnsupportedEvidenceSourceError);

      await db.secFiling.delete({ where: { id: filing.id } });
      await db.company.delete({ where: { id: otherCompany.id } });
    });

    it('accepts evidence pointing at a real, company-scoped filing', async () => {
      const user = await makeUser('ev-accept');
      const investmentCase = await makeCase(user.id);
      const filing = await db.secFiling.create({
        data: { companyId: investmentCase.companyId, filingType: 'TEN_K', formType: '10-K', filingDate: new Date('2026-01-01'), accessionNumber: 'zz-acc-2', primaryDocument: 'doc.htm', secUrl: 'https://example.com' },
      });

      const evidence = await createEvidence(user.id, investmentCase.id, {
        claim: 'Revenue grew 12% YoY.',
        evidence: 'Per the FY2025 10-K income statement.',
        date: '2026-08-01',
        category: 'Growth',
        direction: 'SUPPORTS',
        strength: 'HIGH',
        sourceType: 'TEN_K',
        sourceLabel: 'FY2025 10-K',
        secFilingId: filing.id,
      });
      expect(evidence.secFilingId).toBe(filing.id);

      const listed = await listEvidence(user.id, investmentCase.id);
      expect(listed).toHaveLength(1);

      await deleteEvidence(user.id, investmentCase.id, evidence.id);
      await expect(deleteEvidence(user.id, investmentCase.id, evidence.id)).rejects.toThrow(InvestmentCaseEvidenceNotFoundError);
    });

    it('accepts a non-row-backed source (DCF) with only a descriptive label', async () => {
      const user = await makeUser('ev-dcf');
      const investmentCase = await makeCase(user.id);
      const evidence = await createEvidence(user.id, investmentCase.id, {
        claim: 'The DCF implies meaningful upside.',
        evidence: 'Base case implied share price exceeds current price by 20%.',
        date: '2026-08-01',
        category: 'Valuation',
        direction: 'SUPPORTS',
        strength: 'MEDIUM',
        sourceType: 'DCF',
        sourceLabel: 'DCF Base case, run 2026-08-01',
      });
      expect(evidence.sourceType).toBe('DCF');
      expect(evidence.secFilingId).toBeNull();
    });
  });

  describe('risks', () => {
    it('creates, updates, and enforces ownership on delete', async () => {
      const userA = await makeUser('risk-a');
      const userB = await makeUser('risk-b');
      const investmentCase = await makeCase(userA.id);

      const risk = await createRisk(userA.id, investmentCase.id, { risk: 'AI infrastructure costs rise faster than revenue.', impact: 'HIGH' });
      expect(risk.probability).toBeNull();
      expect(risk.status).toBe('MONITORING');

      const updated = await updateRisk(userA.id, investmentCase.id, risk.id, { status: 'ESCALATING', probability: 'MEDIUM' });
      expect(updated.status).toBe('ESCALATING');
      expect(updated.probability).toBe('MEDIUM');

      await expect(updateRisk(userB.id, investmentCase.id, risk.id, { status: 'MITIGATED' })).rejects.toThrow(InvestmentCaseNotFoundError);
      await expect(deleteRisk(userB.id, investmentCase.id, risk.id)).rejects.toThrow(InvestmentCaseNotFoundError);

      const risks = await listRisks(userA.id, investmentCase.id);
      expect(risks).toHaveLength(1);

      await deleteRisk(userA.id, investmentCase.id, risk.id);
      await expect(deleteRisk(userA.id, investmentCase.id, risk.id)).rejects.toThrow(InvestmentCaseRiskNotFoundError);
    });
  });

  describe('catalysts', () => {
    it('creates and updates status through the defined lifecycle', async () => {
      const user = await makeUser('cat');
      const investmentCase = await makeCase(user.id);
      const catalyst = await createCatalyst(user.id, investmentCase.id, { catalyst: 'Q2 2027 product launch', timeframe: 'Q2 2027', potentialImpact: 'HIGH' });
      expect(catalyst.status).toBe('UPCOMING');

      const updated = await updateCatalyst(user.id, investmentCase.id, catalyst.id, { status: 'OCCURRED' });
      expect(updated.status).toBe('OCCURRED');

      const list = await listCatalysts(user.id, investmentCase.id);
      expect(list).toHaveLength(1);

      await deleteCatalyst(user.id, investmentCase.id, catalyst.id);
      await expect(deleteCatalyst(user.id, investmentCase.id, catalyst.id)).rejects.toThrow(InvestmentCaseCatalystNotFoundError);
    });
  });

  describe('invalidation criteria', () => {
    it('supports both machine-checkable and purely qualitative criteria', async () => {
      const user = await makeUser('inval');
      const investmentCase = await makeCase(user.id);

      const checkable = await createInvalidationCriterion(user.id, investmentCase.id, {
        description: 'DCF implied value falls below $75.',
        metric: 'WACC',
        comparator: 'LESS_THAN',
        thresholdValue: 75,
        thresholdUnit: 'usd',
      });
      expect(checkable.status).toBe('ACTIVE');

      const qualitative = await createInvalidationCriterion(user.id, investmentCase.id, { description: 'Major product launch fails.' });
      expect(qualitative.metric).toBeNull();

      const list = await listInvalidationCriteria(user.id, investmentCase.id);
      expect(list).toHaveLength(2);

      // The system never auto-invalidates; a status transition to RESOLVED
      // only ever happens via an explicit user-driven update call like this one.
      const resolved = await updateInvalidationCriterion(user.id, investmentCase.id, checkable.id, { status: 'RESOLVED' });
      expect(resolved.status).toBe('RESOLVED');

      await deleteInvalidationCriterion(user.id, investmentCase.id, qualitative.id);
      await expect(deleteInvalidationCriterion(user.id, investmentCase.id, qualitative.id)).rejects.toThrow(InvestmentCaseInvalidationCriterionNotFoundError);
    });
  });
});
