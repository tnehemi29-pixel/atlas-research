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
      expect(issues[0]!.severity).toBe('MEDIUM'); // unchanged here because both findings use makeFinding's same default severity — see the dedicated severity-refresh test below for the case where it actually differs
    });

    it('also updates severity on an OPEN issue when the same dedupeKey\'s classification changes (e.g. a reclassification from "every WACC failure is CRITICAL" to "an analyst-assumption gap is MEDIUM") — the issue must never display a different severity than the dimension summary computed from the same, current finding', async () => {
      const company = await db.company.create({ data: { ticker: TICKER, name: 'Integrity Issue Test Co.' } });
      await syncIssuesFromFindings(company.id, [
        makeFinding({ category: 'DCF_MODEL_ERROR', severity: 'CRITICAL', dedupeKey: 'dcf:DCF validation: wacc', description: 'WACC could not be calculated — check that market cap, total debt, and cost of equity/debt inputs are all provided.' }),
      ]);

      const result = await syncIssuesFromFindings(company.id, [
        makeFinding({ category: 'DCF_MODEL_ERROR', severity: 'MEDIUM', dedupeKey: 'dcf:DCF validation: wacc', description: 'Analyst assumption required — historical cost of debt is unavailable in the latest filing (interest expense is not broken out). Enter a sourced pre-tax cost-of-debt assumption to complete WACC.' }),
      ]);
      expect(result.descriptionUpdated).toBe(1);
      expect(result.created).toBe(0);
      expect(result.autoResolved).toBe(0);

      const issues = await listIntegrityIssues(company.id, { status: 'OPEN' });
      expect(issues).toHaveLength(1);
      expect(issues[0]!.status).toBe('OPEN'); // never resolved, never reopened
      expect(issues[0]!.severity).toBe('MEDIUM'); // rewritten to match the current, real classification
      expect(issues[0]!.description).toMatch(/Analyst assumption required/);
    });

    it('does not write anything when neither description nor severity changed — no unnecessary update', async () => {
      const company = await db.company.create({ data: { ticker: TICKER, name: 'Integrity Issue Test Co.' } });
      await syncIssuesFromFindings(company.id, [makeFinding({ dedupeKey: 'dcf:no-change', severity: 'MEDIUM', description: 'same message every time' })]);

      const result = await syncIssuesFromFindings(company.id, [makeFinding({ dedupeKey: 'dcf:no-change', severity: 'MEDIUM', description: 'same message every time' })]);
      expect(result.descriptionUpdated).toBe(0);
      expect(result.created).toBe(0);
    });

    it('never rewrites severity on a RESOLVED or IGNORED issue when the same problem recurs with a different severity', async () => {
      const company = await db.company.create({ data: { ticker: TICKER, name: 'Integrity Issue Test Co.' } });
      await syncIssuesFromFindings(company.id, [makeFinding({ category: 'FINANCIAL_RECONCILIATION', severity: 'HIGH', dedupeKey: 'dcf:resolved-severity-case', description: 'old message' })]);
      const created = (await listIntegrityIssues(company.id))[0]!;
      await resolveIntegrityIssue(created.id, 'user-1', 'Confirmed a data-provider rounding difference.');

      await syncIssuesFromFindings(company.id, [makeFinding({ category: 'FINANCIAL_RECONCILIATION', severity: 'LOW', dedupeKey: 'dcf:resolved-severity-case', description: 'new message, still failing' })]);

      const issue = await getIntegrityIssue(created.id);
      expect(issue.status).toBe('RESOLVED'); // never reopened
      expect(issue.severity).toBe('HIGH'); // never rewritten
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

  // The exact lifecycle behind the cost-of-debt-override fix: unlike other
  // DCF_MODEL_ERROR findings (deliberately excluded from
  // AUTO_RESOLVABLE_CATEGORIES — most could start passing from ordinary data
  // drift, which still warrants a human), the "dcf:DCF validation: wacc"
  // finding is mechanically unambiguous once a human explicitly saves a
  // Company.costOfDebtOverride: it can only start passing because of that
  // exact, explicit action. AUTO_RESOLVABLE_FINDING_KEYS is a narrow,
  // dedupeKey-scoped exception — never touches AUTO_RESOLVABLE_CATEGORIES or
  // AUTO_CLOSE_WHEN_UNVERIFIABLE_CATEGORIES.
  describe('auto-resolve the exact wacc finding (AUTO_RESOLVABLE_FINDING_KEYS)', () => {
    const WACC_DEDUPE_KEY = 'dcf:DCF validation: wacc';

    it('A/creates an OPEN "dcf:DCF validation: wacc" issue when the finding fails', async () => {
      const company = await db.company.create({ data: { ticker: TICKER, name: 'Integrity Issue Test Co.' } });
      const result = await syncIssuesFromFindings(company.id, [makeFinding({ category: 'DCF_MODEL_ERROR', severity: 'CRITICAL', dedupeKey: WACC_DEDUPE_KEY })]);
      expect(result.created).toBe(1);

      const issues = await listIntegrityIssues(company.id, { status: 'OPEN' });
      expect(issues).toHaveLength(1);
      expect(issues[0]!.dedupeKey).toBe(WACC_DEDUPE_KEY);
      expect(issues[0]!.category).toBe('DCF_MODEL_ERROR');
    });

    it('C/resolves an existing OPEN wacc issue once the same finding passes', async () => {
      const company = await db.company.create({ data: { ticker: TICKER, name: 'Integrity Issue Test Co.' } });
      await syncIssuesFromFindings(company.id, [makeFinding({ category: 'DCF_MODEL_ERROR', severity: 'CRITICAL', dedupeKey: WACC_DEDUPE_KEY })]);

      const result = await syncIssuesFromFindings(company.id, [makeFinding({ category: 'DCF_MODEL_ERROR', dedupeKey: WACC_DEDUPE_KEY, passed: true })]);
      expect(result.autoResolved).toBe(1);

      const resolved = await listIntegrityIssues(company.id, { status: 'RESOLVED' });
      expect(resolved).toHaveLength(1);
      expect(resolved[0]!.dedupeKey).toBe(WACC_DEDUPE_KEY);
      expect(resolved[0]!.resolution).toMatch(/Automatically resolved/);

      const openOrAcknowledged = await listIntegrityIssues(company.id, { status: 'OPEN' });
      expect(openOrAcknowledged).toHaveLength(0); // gone from the OPEN list
    });

    it('D/resolves an existing ACKNOWLEDGED wacc issue once the same finding passes', async () => {
      const company = await db.company.create({ data: { ticker: TICKER, name: 'Integrity Issue Test Co.' } });
      await syncIssuesFromFindings(company.id, [makeFinding({ category: 'DCF_MODEL_ERROR', dedupeKey: WACC_DEDUPE_KEY })]);
      const created = (await listIntegrityIssues(company.id))[0]!;
      await acknowledgeIntegrityIssue(created.id, 'user-1');

      const result = await syncIssuesFromFindings(company.id, [makeFinding({ category: 'DCF_MODEL_ERROR', dedupeKey: WACC_DEDUPE_KEY, passed: true })]);
      expect(result.autoResolved).toBe(1);

      const issue = await getIntegrityIssue(created.id);
      expect(issue.status).toBe('RESOLVED');
    });

    it('E/never re-resolves or rewrites an already-RESOLVED wacc issue', async () => {
      const company = await db.company.create({ data: { ticker: TICKER, name: 'Integrity Issue Test Co.' } });
      await syncIssuesFromFindings(company.id, [makeFinding({ category: 'DCF_MODEL_ERROR', dedupeKey: WACC_DEDUPE_KEY })]);
      const created = (await listIntegrityIssues(company.id))[0]!;
      await resolveIntegrityIssue(created.id, 'user-1', 'Manually verified against the filing.');

      const result = await syncIssuesFromFindings(company.id, [makeFinding({ category: 'DCF_MODEL_ERROR', dedupeKey: WACC_DEDUPE_KEY, passed: true })]);
      expect(result.autoResolved).toBe(0); // status check excludes RESOLVED — never touched again

      const issue = await getIntegrityIssue(created.id);
      expect(issue.status).toBe('RESOLVED');
      expect(issue.resolution).toBe('Manually verified against the filing.'); // untouched
    });

    it('F/never reopens or rewrites an already-IGNORED wacc issue', async () => {
      const company = await db.company.create({ data: { ticker: TICKER, name: 'Integrity Issue Test Co.' } });
      await syncIssuesFromFindings(company.id, [makeFinding({ category: 'DCF_MODEL_ERROR', dedupeKey: WACC_DEDUPE_KEY })]);
      const created = (await listIntegrityIssues(company.id))[0]!;
      await ignoreIntegrityIssue(created.id, 'user-1', 'Known false positive for this filer.');

      const result = await syncIssuesFromFindings(company.id, [makeFinding({ category: 'DCF_MODEL_ERROR', dedupeKey: WACC_DEDUPE_KEY, passed: true })]);
      expect(result.autoResolved).toBe(0);

      const issue = await getIntegrityIssue(created.id);
      expect(issue.status).toBe('IGNORED');
    });

    it('G/does not auto-resolve a different DCF_MODEL_ERROR finding, even when it passes', async () => {
      const company = await db.company.create({ data: { ticker: TICKER, name: 'Integrity Issue Test Co.' } });
      await syncIssuesFromFindings(company.id, [makeFinding({ category: 'DCF_MODEL_ERROR', dedupeKey: 'dcf:Terminal growth < WACC' })]);

      const result = await syncIssuesFromFindings(company.id, [makeFinding({ category: 'DCF_MODEL_ERROR', dedupeKey: 'dcf:Terminal growth < WACC', passed: true })]);
      expect(result.autoResolved).toBe(0);

      const issues = await listIntegrityIssues(company.id, { status: 'OPEN' });
      expect(issues).toHaveLength(1); // still open — requires a human, exactly like before this fix
    });

    it('H/leaves an OPEN wacc issue untouched when the finding is absent entirely (the whole DCF audit could not run)', async () => {
      const company = await db.company.create({ data: { ticker: TICKER, name: 'Integrity Issue Test Co.' } });
      await syncIssuesFromFindings(company.id, [makeFinding({ category: 'DCF_MODEL_ERROR', dedupeKey: WACC_DEDUPE_KEY })]);

      // Mirrors runDcfModelAudit returning null (no overview / no financial
      // periods): the wacc dedupeKey is not present in findings at all —
      // this must never be treated the same as "present and passing".
      const result = await syncIssuesFromFindings(company.id, []);
      expect(result.autoResolved).toBe(0);
      expect(result.autoClosedUnverifiable).toBe(0); // DCF_MODEL_ERROR is not in AUTO_CLOSE_WHEN_UNVERIFIABLE_CATEGORIES

      const issues = await listIntegrityIssues(company.id, { status: 'OPEN' });
      expect(issues).toHaveLength(1);
      expect(issues[0]!.dedupeKey).toBe(WACC_DEDUPE_KEY);
    });

    it('I/leaves DATA_FRESHNESS and DATA_COMPLETENESS auto-resolution unchanged', async () => {
      const company = await db.company.create({ data: { ticker: TICKER, name: 'Integrity Issue Test Co.' } });
      await syncIssuesFromFindings(company.id, [
        makeFinding({ category: 'DATA_FRESHNESS', dedupeKey: 'freshness:unchanged-check' }),
        makeFinding({ category: 'DATA_COMPLETENESS', dedupeKey: 'completeness:unchanged-check' }),
      ]);

      const result = await syncIssuesFromFindings(company.id, [
        makeFinding({ category: 'DATA_FRESHNESS', dedupeKey: 'freshness:unchanged-check', passed: true }),
        makeFinding({ category: 'DATA_COMPLETENESS', dedupeKey: 'completeness:unchanged-check', passed: true }),
      ]);
      expect(result.autoResolved).toBe(2);

      const resolved = await listIntegrityIssues(company.id, { status: 'RESOLVED' });
      expect(resolved).toHaveLength(2);
    });

    it('J/the dedupeKey used for auto-resolution matches exactly what the current findings-to-issue mapping generates ("dcf:" + the DCF audit\'s own check string)', async () => {
      // integritySnapshotService.ts's modelFindingToIssue: dedupeKey: `${'dcf'}:${finding.check}`,
      // and lib/integrity/dcfAudit.ts's checkDcfOwnValidation emits check: 'DCF validation: wacc' —
      // asserting the literal composed string here so a rename of either half fails this test loudly
      // instead of silently breaking the auto-resolve allowlist match.
      expect(WACC_DEDUPE_KEY).toBe('dcf:DCF validation: wacc');

      const company = await db.company.create({ data: { ticker: TICKER, name: 'Integrity Issue Test Co.' } });
      const created = await syncIssuesFromFindings(company.id, [makeFinding({ category: 'DCF_MODEL_ERROR', dedupeKey: WACC_DEDUPE_KEY })]);
      expect(created.created).toBe(1);
      const issue = (await listIntegrityIssues(company.id))[0]!;
      expect(issue.dedupeKey).toBe(WACC_DEDUPE_KEY); // unchanged by this fix

      const resolvedRun = await syncIssuesFromFindings(company.id, [makeFinding({ category: 'DCF_MODEL_ERROR', dedupeKey: WACC_DEDUPE_KEY, passed: true })]);
      expect(resolvedRun.autoResolved).toBe(1); // the exact same string is what the allowlist matches against
    });

    // The symmetric counterpart: a saved Company.costOfDebtOverride can be
    // cleared just as explicitly as it was saved. Distinguishing "auto"
    // from "human" resolution reuses the existing resolvedByUserId field
    // (set only by resolveIntegrityIssue's human-invoked path — see that
    // function above) rather than inventing a new column or inferring from
    // resolution text.
    describe('auto-reopen when the same wacc finding fails again', () => {
      it('1/creates then auto-resolves the wacc issue once the finding passes (baseline for the reopen tests below)', async () => {
        const company = await db.company.create({ data: { ticker: TICKER, name: 'Integrity Issue Test Co.' } });
        const createResult = await syncIssuesFromFindings(company.id, [makeFinding({ category: 'DCF_MODEL_ERROR', severity: 'CRITICAL', dedupeKey: WACC_DEDUPE_KEY })]);
        expect(createResult.created).toBe(1);

        const resolveResult = await syncIssuesFromFindings(company.id, [makeFinding({ category: 'DCF_MODEL_ERROR', dedupeKey: WACC_DEDUPE_KEY, passed: true })]);
        expect(resolveResult.autoResolved).toBe(1);

        const issue = (await listIntegrityIssues(company.id))[0]!;
        expect(issue.status).toBe('RESOLVED');
        expect(issue.resolvedByUserId).toBeNull(); // auto-resolved, not a human decision
      });

      it('2/reopens a previously auto-resolved wacc issue to OPEN when the same finding fails again', async () => {
        const company = await db.company.create({ data: { ticker: TICKER, name: 'Integrity Issue Test Co.' } });
        await syncIssuesFromFindings(company.id, [makeFinding({ category: 'DCF_MODEL_ERROR', severity: 'CRITICAL', dedupeKey: WACC_DEDUPE_KEY })]);
        await syncIssuesFromFindings(company.id, [makeFinding({ category: 'DCF_MODEL_ERROR', dedupeKey: WACC_DEDUPE_KEY, passed: true })]);
        const resolvedId = (await listIntegrityIssues(company.id))[0]!.id;

        const reopenResult = await syncIssuesFromFindings(company.id, [
          makeFinding({ category: 'DCF_MODEL_ERROR', severity: 'CRITICAL', dedupeKey: WACC_DEDUPE_KEY, description: 'Historical cost of debt is unavailable for this company — select a manual cost-of-debt assumption to calculate WACC.' }),
        ]);
        expect(reopenResult.autoReopened).toBe(1);
        expect(reopenResult.created).toBe(0); // the same row, never a duplicate

        const issue = await getIntegrityIssue(resolvedId);
        expect(issue.status).toBe('OPEN');
        expect(issue.dedupeKey).toBe(WACC_DEDUPE_KEY);
      });

      it('3/never reopens a manually (human) RESOLVED wacc issue when the finding fails again', async () => {
        const company = await db.company.create({ data: { ticker: TICKER, name: 'Integrity Issue Test Co.' } });
        await syncIssuesFromFindings(company.id, [makeFinding({ category: 'DCF_MODEL_ERROR', dedupeKey: WACC_DEDUPE_KEY })]);
        const created = (await listIntegrityIssues(company.id))[0]!;
        await resolveIntegrityIssue(created.id, 'user-1', 'Manually verified the analyst\'s assumption directly with the filing.');

        const result = await syncIssuesFromFindings(company.id, [makeFinding({ category: 'DCF_MODEL_ERROR', dedupeKey: WACC_DEDUPE_KEY })]); // failing again
        expect(result.autoReopened).toBe(0);
        expect(result.created).toBe(0);

        const issue = await getIntegrityIssue(created.id);
        expect(issue.status).toBe('RESOLVED'); // never reopened — resolvedByUserId was set
        expect(issue.resolution).toBe('Manually verified the analyst\'s assumption directly with the filing.'); // untouched
      });

      it('4/never reopens an IGNORED wacc issue when the finding fails again', async () => {
        const company = await db.company.create({ data: { ticker: TICKER, name: 'Integrity Issue Test Co.' } });
        await syncIssuesFromFindings(company.id, [makeFinding({ category: 'DCF_MODEL_ERROR', dedupeKey: WACC_DEDUPE_KEY })]);
        const created = (await listIntegrityIssues(company.id))[0]!;
        await ignoreIntegrityIssue(created.id, 'user-1', 'Known false positive for this filer.');

        const result = await syncIssuesFromFindings(company.id, [makeFinding({ category: 'DCF_MODEL_ERROR', dedupeKey: WACC_DEDUPE_KEY })]);
        expect(result.autoReopened).toBe(0);

        const issue = await getIntegrityIssue(created.id);
        expect(issue.status).toBe('IGNORED'); // never reopened or modified
      });

      it('5/a reopened issue reflects the current failing finding\'s description and severity', async () => {
        const company = await db.company.create({ data: { ticker: TICKER, name: 'Integrity Issue Test Co.' } });
        await syncIssuesFromFindings(company.id, [makeFinding({ category: 'DCF_MODEL_ERROR', severity: 'MEDIUM', dedupeKey: WACC_DEDUPE_KEY, description: 'old blocking message' })]);
        await syncIssuesFromFindings(company.id, [makeFinding({ category: 'DCF_MODEL_ERROR', dedupeKey: WACC_DEDUPE_KEY, passed: true })]);
        const resolvedId = (await listIntegrityIssues(company.id))[0]!.id;

        await syncIssuesFromFindings(company.id, [
          makeFinding({ category: 'DCF_MODEL_ERROR', severity: 'CRITICAL', dedupeKey: WACC_DEDUPE_KEY, description: 'current blocking message after the override was cleared' }),
        ]);

        const issue = await getIntegrityIssue(resolvedId);
        expect(issue.status).toBe('OPEN');
        expect(issue.severity).toBe('CRITICAL');
        expect(issue.description).toBe('current blocking message after the override was cleared');
        expect(issue.resolution).toBeNull(); // cleared on reopen
        expect(issue.resolvedAt).toBeNull(); // cleared on reopen
      });

      it('6/does not create a duplicate issue when reopening — exactly one row for the dedupeKey throughout', async () => {
        const company = await db.company.create({ data: { ticker: TICKER, name: 'Integrity Issue Test Co.' } });
        await syncIssuesFromFindings(company.id, [makeFinding({ category: 'DCF_MODEL_ERROR', dedupeKey: WACC_DEDUPE_KEY })]);
        await syncIssuesFromFindings(company.id, [makeFinding({ category: 'DCF_MODEL_ERROR', dedupeKey: WACC_DEDUPE_KEY, passed: true })]);
        await syncIssuesFromFindings(company.id, [makeFinding({ category: 'DCF_MODEL_ERROR', dedupeKey: WACC_DEDUPE_KEY })]);

        const all = await db.researchIntegrityIssue.findMany({ where: { companyId: company.id, dedupeKey: WACC_DEDUPE_KEY } });
        expect(all).toHaveLength(1);
      });

      it('7/does not affect a different DCF_MODEL_ERROR finding\'s issue when the wacc issue reopens in the same sync', async () => {
        const company = await db.company.create({ data: { ticker: TICKER, name: 'Integrity Issue Test Co.' } });
        await syncIssuesFromFindings(company.id, [
          makeFinding({ category: 'DCF_MODEL_ERROR', dedupeKey: WACC_DEDUPE_KEY }),
          makeFinding({ category: 'DCF_MODEL_ERROR', dedupeKey: 'dcf:Terminal growth < WACC' }),
        ]);
        await syncIssuesFromFindings(company.id, [
          makeFinding({ category: 'DCF_MODEL_ERROR', dedupeKey: WACC_DEDUPE_KEY, passed: true }),
          makeFinding({ category: 'DCF_MODEL_ERROR', dedupeKey: 'dcf:Terminal growth < WACC' }), // still failing throughout, untouched
        ]);

        const result = await syncIssuesFromFindings(company.id, [
          makeFinding({ category: 'DCF_MODEL_ERROR', dedupeKey: WACC_DEDUPE_KEY }), // fails again -> reopens
          makeFinding({ category: 'DCF_MODEL_ERROR', dedupeKey: 'dcf:Terminal growth < WACC' }),
        ]);
        expect(result.autoReopened).toBe(1);

        const terminalGrowthIssue = await db.researchIntegrityIssue.findUnique({ where: { companyId_dedupeKey: { companyId: company.id, dedupeKey: 'dcf:Terminal growth < WACC' } } });
        expect(terminalGrowthIssue?.status).toBe('OPEN'); // was already OPEN the whole time — unaffected by the wacc reopen
      });

      it('8/does not affect the unrelated market-cap integrity issue', async () => {
        const company = await db.company.create({ data: { ticker: TICKER, name: 'Integrity Issue Test Co.' } });
        await syncIssuesFromFindings(company.id, [makeFinding({ category: 'DCF_MODEL_ERROR', dedupeKey: WACC_DEDUPE_KEY }), makeMarketCapFinding()]);
        await syncIssuesFromFindings(company.id, [makeFinding({ category: 'DCF_MODEL_ERROR', dedupeKey: WACC_DEDUPE_KEY, passed: true }), makeMarketCapFinding()]);
        const marketCapBefore = await db.researchIntegrityIssue.findUnique({ where: { companyId_dedupeKey: { companyId: company.id, dedupeKey: MARKET_CAP_DEDUPE_KEY } } });

        const result = await syncIssuesFromFindings(company.id, [makeFinding({ category: 'DCF_MODEL_ERROR', dedupeKey: WACC_DEDUPE_KEY }), makeMarketCapFinding()]);
        expect(result.autoReopened).toBe(1);

        const marketCapAfter = await db.researchIntegrityIssue.findUnique({ where: { companyId_dedupeKey: { companyId: company.id, dedupeKey: MARKET_CAP_DEDUPE_KEY } } });
        expect(marketCapAfter).toEqual(marketCapBefore); // byte-for-byte unchanged
      });

      it('9/existing description-refresh behavior for a still-OPEN wacc issue remains intact (never treated as a reopen)', async () => {
        const company = await db.company.create({ data: { ticker: TICKER, name: 'Integrity Issue Test Co.' } });
        await syncIssuesFromFindings(company.id, [makeFinding({ category: 'DCF_MODEL_ERROR', dedupeKey: WACC_DEDUPE_KEY, description: 'generic message' })]);

        const result = await syncIssuesFromFindings(company.id, [makeFinding({ category: 'DCF_MODEL_ERROR', dedupeKey: WACC_DEDUPE_KEY, description: 'more specific message' })]);
        expect(result.descriptionUpdated).toBe(1);
        expect(result.autoReopened).toBe(0); // it was already OPEN — this is a refresh, not a reopen

        const issue = (await listIntegrityIssues(company.id))[0]!;
        expect(issue.status).toBe('OPEN');
        expect(issue.description).toBe('more specific message');
      });
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
