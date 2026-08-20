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

const MARKET_CAP_DEDUPE_KEY = 'dq:MARKET_DATA:CALCULATION_INTEGRITY:Market cap (Price × Shares Outstanding)';

function makeMarketCapFinding(overrides: Partial<FindingForIssueSync> = {}): FindingForIssueSync {
  return {
    category: 'MARKET_DATA_INTEGRITY',
    severity: 'HIGH',
    datasetType: 'MARKET_DATA',
    description: 'Market cap (Price × Shares Outstanding) does not reconcile: reported 4,647,666,932,640 vs. expected 4,748,086,318,680.',
    source: 'dataQualityService',
    dedupeKey: MARKET_CAP_DEDUPE_KEY,
    passed: false,
    ...overrides,
  };
}

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

  // The exact lifecycle behind the stale-DCF-WACC-message report: the same
  // dedupeKey keeps failing, but the audit module's own message for it
  // becomes more specific over time (e.g. a generic "WACC could not be
  // calculated" becomes "Historical cost of debt is unavailable..."). The
  // issue must stay OPEN throughout — this is a description refresh, never
  // a resolution.
  describe('description refresh on a still-failing finding', () => {
    it('updates the description of an OPEN issue when the same dedupeKey fails again with different text — status remains OPEN', async () => {
      const company = await db.company.create({ data: { ticker: TICKER, name: 'Integrity Issue Test Co.' } });
      await syncIssuesFromFindings(company.id, [makeFinding({ category: 'DCF_MODEL_ERROR', dedupeKey: 'dcf:DCF validation: wacc', description: 'WACC could not be calculated — check that market cap, total debt, and cost of equity/debt inputs are all provided.' })]);

      const result = await syncIssuesFromFindings(company.id, [
        makeFinding({ category: 'DCF_MODEL_ERROR', dedupeKey: 'dcf:DCF validation: wacc', description: 'Historical cost of debt is unavailable for this company (interest expense is not broken out in its recent filings) — select a manual cost-of-debt assumption to calculate WACC.' }),
      ]);
      expect(result.descriptionUpdated).toBe(1);
      expect(result.created).toBe(0);
      expect(result.autoResolved).toBe(0);

      const issues = await listIntegrityIssues(company.id, { status: 'OPEN' });
      expect(issues).toHaveLength(1);
      expect(issues[0]!.status).toBe('OPEN'); // never resolved, never reopened — it was already open
      expect(issues[0]!.description).toMatch(/Historical cost of debt is unavailable/);
      expect(issues[0]!.category).toBe('DCF_MODEL_ERROR'); // unchanged
      expect(issues[0]!.severity).toBe('MEDIUM'); // unchanged — makeFinding's default, never rewritten by this path
    });

    it('updates the description of an ACKNOWLEDGED issue the same way — status remains ACKNOWLEDGED', async () => {
      const company = await db.company.create({ data: { ticker: TICKER, name: 'Integrity Issue Test Co.' } });
      await syncIssuesFromFindings(company.id, [makeFinding({ dedupeKey: 'dcf:ack-case', description: 'old message' })]);
      const created = (await listIntegrityIssues(company.id))[0]!;
      await acknowledgeIntegrityIssue(created.id, 'user-1');

      const result = await syncIssuesFromFindings(company.id, [makeFinding({ dedupeKey: 'dcf:ack-case', description: 'new, more specific message' })]);
      expect(result.descriptionUpdated).toBe(1);

      const issue = await getIntegrityIssue(created.id);
      expect(issue.status).toBe('ACKNOWLEDGED'); // unchanged
      expect(issue.description).toBe('new, more specific message');
      expect(issue.acknowledgedByUserId).toBe('user-1'); // untouched by the description refresh
    });

    it('does not write anything when the description is identical — no unnecessary update', async () => {
      const company = await db.company.create({ data: { ticker: TICKER, name: 'Integrity Issue Test Co.' } });
      await syncIssuesFromFindings(company.id, [makeFinding({ dedupeKey: 'dcf:same-text', description: 'same message every time' })]);

      const result = await syncIssuesFromFindings(company.id, [makeFinding({ dedupeKey: 'dcf:same-text', description: 'same message every time' })]);
      expect(result.descriptionUpdated).toBe(0);
      expect(result.created).toBe(0);
    });

    it('never rewrites or reopens a RESOLVED issue when the same problem recurs with new text', async () => {
      const company = await db.company.create({ data: { ticker: TICKER, name: 'Integrity Issue Test Co.' } });
      await syncIssuesFromFindings(company.id, [makeFinding({ category: 'FINANCIAL_RECONCILIATION', dedupeKey: 'dcf:resolved-case', description: 'old message' })]);
      const created = (await listIntegrityIssues(company.id))[0]!;
      await resolveIntegrityIssue(created.id, 'user-1', 'Confirmed a data-provider rounding difference.');

      const result = await syncIssuesFromFindings(company.id, [makeFinding({ category: 'FINANCIAL_RECONCILIATION', dedupeKey: 'dcf:resolved-case', description: 'new message, still failing' })]);
      expect(result.descriptionUpdated).toBe(0);
      expect(result.created).toBe(0); // dedupeKey already exists — never a second issue

      const issue = await getIntegrityIssue(created.id);
      expect(issue.status).toBe('RESOLVED'); // never reopened
      expect(issue.description).toBe('old message'); // never rewritten
    });

    it('never rewrites or reopens an IGNORED issue when the same problem recurs with new text', async () => {
      const company = await db.company.create({ data: { ticker: TICKER, name: 'Integrity Issue Test Co.' } });
      await syncIssuesFromFindings(company.id, [makeFinding({ dedupeKey: 'dcf:ignored-case', description: 'old message' })]);
      const created = (await listIntegrityIssues(company.id))[0]!;
      await ignoreIntegrityIssue(created.id, 'user-1', 'Known false positive for this filer.');

      const result = await syncIssuesFromFindings(company.id, [makeFinding({ dedupeKey: 'dcf:ignored-case', description: 'new message, still failing' })]);
      expect(result.descriptionUpdated).toBe(0);

      const issue = await getIntegrityIssue(created.id);
      expect(issue.status).toBe('IGNORED'); // never reopened
      expect(issue.description).toBe('old message'); // never rewritten
    });

    it('only touches the dedupeKey whose description actually changed — an unrelated OPEN issue in the same sync is unaffected', async () => {
      const company = await db.company.create({ data: { ticker: TICKER, name: 'Integrity Issue Test Co.' } });
      await syncIssuesFromFindings(company.id, [
        makeFinding({ dedupeKey: 'dcf:changed', description: 'old' }),
        makeFinding({ category: 'FINANCIAL_RECONCILIATION', dedupeKey: 'dcf:unchanged', description: 'stable message' }),
      ]);

      const result = await syncIssuesFromFindings(company.id, [
        makeFinding({ dedupeKey: 'dcf:changed', description: 'new' }),
        makeFinding({ category: 'FINANCIAL_RECONCILIATION', dedupeKey: 'dcf:unchanged', description: 'stable message' }),
      ]);
      expect(result.descriptionUpdated).toBe(1);

      const issues = await listIntegrityIssues(company.id, { status: 'OPEN' });
      const unchanged = issues.find((i) => i.dedupeKey === 'dcf:unchanged');
      expect(unchanged?.description).toBe('stable message');
    });
  });

  // The exact lifecycle behind the stale-market-cap-finding fix: a check
  // that used to be checkable-and-failing can become checkable: false
  // (e.g. checkMarketCapReconciliation's 45-day freshness guard) — the
  // resulting finding then simply disappears from the findings array
  // passed to syncIssuesFromFindings, rather than reporting `passed: true`.
  describe('close-when-unverifiable (MARKET_DATA_INTEGRITY)', () => {
    it('creates an OPEN market-cap issue when the check is checkable and fails', async () => {
      const company = await db.company.create({ data: { ticker: TICKER, name: 'Integrity Issue Test Co.' } });
      const result = await syncIssuesFromFindings(company.id, [makeMarketCapFinding()]);
      expect(result.created).toBe(1);

      const issues = await listIntegrityIssues(company.id, { status: 'OPEN' });
      expect(issues).toHaveLength(1);
      expect(issues[0]!.category).toBe('MARKET_DATA_INTEGRITY');
    });

    it('auto-closes (IGNORED, not RESOLVED) an OPEN market-cap issue whose finding disappears entirely — never leaves it OPEN indefinitely', async () => {
      const company = await db.company.create({ data: { ticker: TICKER, name: 'Integrity Issue Test Co.' } });
      await syncIssuesFromFindings(company.id, [makeMarketCapFinding()]);

      // The next run: the check is now checkable: false, so dataQualityService
      // omits it from the findings array entirely — not present, not passing.
      const result = await syncIssuesFromFindings(company.id, []);
      expect(result.autoClosedUnverifiable).toBe(1);
      expect(result.autoResolved).toBe(0); // never RESOLVED — that would claim it was verified correct

      const stillOpen = await listIntegrityIssues(company.id, { status: 'OPEN' });
      expect(stillOpen).toHaveLength(0);

      const ignored = await listIntegrityIssues(company.id, { status: 'IGNORED' });
      expect(ignored).toHaveLength(1);
      expect(ignored[0]!.ignoreReason).toMatch(/can no longer verify/);
      expect(ignored[0]!.ignoreReason).toMatch(/not a confirmation/i); // explicitly disclaims "verified correct", never asserts it
      expect(ignored[0]!.status).toBe('IGNORED'); // never RESOLVED — RESOLVED would claim it was verified correct
    });

    it('leaves a genuinely still-failing market-cap issue OPEN — the close-when-unverifiable path only fires when the finding is absent, not when it is present and still failing', async () => {
      const company = await db.company.create({ data: { ticker: TICKER, name: 'Integrity Issue Test Co.' } });
      await syncIssuesFromFindings(company.id, [makeMarketCapFinding()]);

      // Still checkable, still fails — present in findings, unlike the test above.
      const result = await syncIssuesFromFindings(company.id, [makeMarketCapFinding()]);
      expect(result.autoClosedUnverifiable).toBe(0);
      expect(result.created).toBe(0); // dedupeKey already exists — no duplicate

      const issues = await listIntegrityIssues(company.id, { status: 'OPEN' });
      expect(issues).toHaveLength(1);
    });

    it('does not affect an unrelated category\'s existing auto-resolution when both are synced together', async () => {
      const company = await db.company.create({ data: { ticker: TICKER, name: 'Integrity Issue Test Co.' } });
      await syncIssuesFromFindings(company.id, [makeMarketCapFinding(), makeFinding({ category: 'DATA_FRESHNESS', dedupeKey: 'freshness:combo' })]);

      // Market cap disappears (checkable: false); the freshness finding now passes.
      const result = await syncIssuesFromFindings(company.id, [makeFinding({ category: 'DATA_FRESHNESS', dedupeKey: 'freshness:combo', passed: true })]);
      expect(result.autoClosedUnverifiable).toBe(1); // market cap
      expect(result.autoResolved).toBe(1); // freshness — existing behavior, unchanged

      const resolved = await listIntegrityIssues(company.id, { status: 'RESOLVED' });
      expect(resolved).toHaveLength(1);
      expect(resolved[0]!.category).toBe('DATA_FRESHNESS');
    });

    it('never auto-closes a FINANCIAL_RECONCILIATION issue this way, even if its finding disappears entirely', async () => {
      const company = await db.company.create({ data: { ticker: TICKER, name: 'Integrity Issue Test Co.' } });
      await syncIssuesFromFindings(company.id, [makeFinding({ category: 'FINANCIAL_RECONCILIATION', dedupeKey: 'recon:disappearing' })]);

      const result = await syncIssuesFromFindings(company.id, []); // the finding vanishes entirely
      expect(result.autoClosedUnverifiable).toBe(0);

      const issues = await listIntegrityIssues(company.id, { status: 'OPEN' });
      expect(issues).toHaveLength(1); // still open — MARKET_DATA_INTEGRITY is the only auto-close-eligible category
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
