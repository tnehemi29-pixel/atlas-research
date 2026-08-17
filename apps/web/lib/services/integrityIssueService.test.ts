import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  acknowledgeIntegrityIssue,
  getIntegrityIssue,
  ignoreIntegrityIssue,
  InvalidIntegrityIssueInputError,
  IntegrityIssueNotFoundError,
  listIntegrityIssues,
  resolveIntegrityIssue,
  syncIssuesFromFindings,
  type FindingForIssueSync,
} from './integrityIssueService';

const TICKER = 'ZZIIS1';

async function cleanup() {
  const company = await db.company.findUnique({ where: { ticker: TICKER } });
  if (company) {
    await db.auditLogEntry.deleteMany({ where: { companyId: company.id } });
    await db.researchIntegrityIssue.deleteMany({ where: { companyId: company.id } });
  }
  await db.company.deleteMany({ where: { ticker: TICKER } });
}

function makeFinding(overrides: Partial<FindingForIssueSync> = {}): FindingForIssueSync {
  return {
    category: 'DATA_FRESHNESS',
    severity: 'MEDIUM',
    datasetType: 'FINANCIAL_STATEMENTS',
    description: 'Financial statements are stale.',
    source: 'dataQualityService',
    dedupeKey: 'freshness:FINANCIAL_STATEMENTS',
    passed: false,
    ...overrides,
  };
}

describe('integrityIssueService', () => {
  beforeAll(cleanup);
  afterAll(cleanup);
  afterEach(cleanup);

  describe('syncIssuesFromFindings', () => {
    it('creates a new OPEN issue for a failing finding', async () => {
      const company = await db.company.create({ data: { ticker: TICKER, name: 'Integrity Issue Test Co.' } });
      const result = await syncIssuesFromFindings(company.id, [makeFinding()]);
      expect(result.created).toBe(1);

      const issues = await listIntegrityIssues(company.id);
      expect(issues).toHaveLength(1);
      expect(issues[0]!.status).toBe('OPEN');
    });

    it('never creates a duplicate OPEN issue for the same dedupeKey on repeated runs', async () => {
      const company = await db.company.create({ data: { ticker: TICKER, name: 'Integrity Issue Test Co.' } });
      await syncIssuesFromFindings(company.id, [makeFinding()]);
      const second = await syncIssuesFromFindings(company.id, [makeFinding()]);
      expect(second.created).toBe(0);

      const issues = await listIntegrityIssues(company.id);
      expect(issues).toHaveLength(1);
    });

    it('auto-resolves an OPEN issue in a safe category once the finding passes (e.g. successful data refresh)', async () => {
      const company = await db.company.create({ data: { ticker: TICKER, name: 'Integrity Issue Test Co.' } });
      await syncIssuesFromFindings(company.id, [makeFinding({ category: 'DATA_FRESHNESS' })]);
      const result = await syncIssuesFromFindings(company.id, [makeFinding({ category: 'DATA_FRESHNESS', passed: true })]);
      expect(result.autoResolved).toBe(1);

      const issues = await listIntegrityIssues(company.id, { status: 'RESOLVED' });
      expect(issues).toHaveLength(1);
      expect(issues[0]!.resolution).toMatch(/Automatically resolved/);
    });

    it('never auto-resolves a financial-reconciliation issue — spec section 22\'s explicit prohibition', async () => {
      const company = await db.company.create({ data: { ticker: TICKER, name: 'Integrity Issue Test Co.' } });
      await syncIssuesFromFindings(company.id, [makeFinding({ category: 'FINANCIAL_RECONCILIATION', dedupeKey: 'recon:balance-sheet' })]);
      const result = await syncIssuesFromFindings(company.id, [makeFinding({ category: 'FINANCIAL_RECONCILIATION', dedupeKey: 'recon:balance-sheet', passed: true })]);
      expect(result.autoResolved).toBe(0);

      const issues = await listIntegrityIssues(company.id, { status: 'OPEN' });
      expect(issues).toHaveLength(1); // still open — requires a human to resolve it
    });

    it('never auto-resolves a DCF model error, a research contradiction, or a thesis conflict', async () => {
      const company = await db.company.create({ data: { ticker: TICKER, name: 'Integrity Issue Test Co.' } });
      const neverAutoResolve: Array<FindingForIssueSync['category']> = ['DCF_MODEL_ERROR', 'COMPS_MODEL_ERROR', 'RESEARCH_CONTRADICTION', 'THESIS_ASSUMPTION_CONFLICT'];
      for (const category of neverAutoResolve) {
        await syncIssuesFromFindings(company.id, [makeFinding({ category, dedupeKey: `never:${category}` })]);
        const result = await syncIssuesFromFindings(company.id, [makeFinding({ category, dedupeKey: `never:${category}`, passed: true })]);
        expect(result.autoResolved).toBe(0);
      }
    });
  });

  describe('acknowledge / resolve / ignore workflow', () => {
    it('acknowledges an issue and records the acting user', async () => {
      const company = await db.company.create({ data: { ticker: TICKER, name: 'Integrity Issue Test Co.' } });
      await syncIssuesFromFindings(company.id, [makeFinding()]);
      const issue = (await listIntegrityIssues(company.id))[0]!;

      const updated = await acknowledgeIntegrityIssue(issue.id, 'user-1');
      expect(updated.status).toBe('ACKNOWLEDGED');
      expect(updated.acknowledgedByUserId).toBe('user-1');
    });

    it('resolves an issue with a resolution description', async () => {
      const company = await db.company.create({ data: { ticker: TICKER, name: 'Integrity Issue Test Co.' } });
      await syncIssuesFromFindings(company.id, [makeFinding({ category: 'FINANCIAL_RECONCILIATION' })]);
      const issue = (await listIntegrityIssues(company.id))[0]!;

      const updated = await resolveIntegrityIssue(issue.id, 'user-1', 'Confirmed a data-provider rounding difference; verified against the 10-K directly.');
      expect(updated.status).toBe('RESOLVED');
      expect(updated.resolvedByUserId).toBe('user-1');
    });

    it('rejects resolving without a resolution description', async () => {
      const company = await db.company.create({ data: { ticker: TICKER, name: 'Integrity Issue Test Co.' } });
      await syncIssuesFromFindings(company.id, [makeFinding()]);
      const issue = (await listIntegrityIssues(company.id))[0]!;

      await expect(resolveIntegrityIssue(issue.id, 'user-1', '   ')).rejects.toThrow(InvalidIntegrityIssueInputError);
    });

    it('ignores an issue only when a reason is provided — spec section 21\'s explicit requirement', async () => {
      const company = await db.company.create({ data: { ticker: TICKER, name: 'Integrity Issue Test Co.' } });
      await syncIssuesFromFindings(company.id, [makeFinding()]);
      const issue = (await listIntegrityIssues(company.id))[0]!;

      await expect(ignoreIntegrityIssue(issue.id, 'user-1', '')).rejects.toThrow(InvalidIntegrityIssueInputError);

      const updated = await ignoreIntegrityIssue(issue.id, 'user-1', 'Known data-provider quirk, not a real issue.');
      expect(updated.status).toBe('IGNORED');
      expect(updated.ignoreReason).toMatch(/quirk/);
    });

    it('throws IntegrityIssueNotFoundError for a nonexistent issue id', async () => {
      await expect(getIntegrityIssue('nonexistent-id')).rejects.toThrow(IntegrityIssueNotFoundError);
    });
  });
});
