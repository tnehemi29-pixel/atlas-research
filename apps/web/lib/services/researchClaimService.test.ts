import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { createClaim, getClaim, listClaims, ResearchClaimNotFoundError } from './researchClaimService';

const TICKER = 'ZZRCS1';

async function cleanup() {
  const company = await db.company.findUnique({ where: { ticker: TICKER } });
  if (company) {
    await db.auditLogEntry.deleteMany({ where: { companyId: company.id } });
    await db.researchClaim.deleteMany({ where: { companyId: company.id } });
  }
  await db.company.deleteMany({ where: { ticker: TICKER } });
}

describe('researchClaimService', () => {
  beforeAll(cleanup);
  afterAll(cleanup);
  afterEach(cleanup);

  it('creates a VERIFIED claim when the number and citation check out', async () => {
    const company = await db.company.create({ data: { ticker: TICKER, name: 'Research Claim Test Co.' } });
    const claim = await createClaim({
      companyId: company.id,
      claim: 'Revenue grew 11% year-over-year.',
      metric: 'revenue_growth',
      statedValue: 0.11,
      sourceValue: 0.108,
      claimSourceType: 'RESEARCH_REPORT',
      citedSourceId: 'src-1',
      validSourceIds: new Set(['src-1']),
      sources: [{ sourceType: 'FINANCIAL_STATEMENT', sourceLabel: 'FY2025 10-K' }],
    });

    expect(claim.validationStatus).toBe('VERIFIED');
    expect(claim.sources).toHaveLength(1);
    expect(claim.sources[0]!.sourceTier).toBe('TIER_1');
  });

  it('rejects a claim when the AI-stated number disagrees with the source — the spec\'s own required test', async () => {
    const company = await db.company.create({ data: { ticker: TICKER, name: 'Research Claim Test Co.' } });
    const claim = await createClaim({
      companyId: company.id,
      claim: 'Revenue grew 25% year-over-year.',
      metric: 'revenue_growth',
      statedValue: 0.25,
      sourceValue: 0.2,
      claimSourceType: 'RESEARCH_REPORT',
    });

    expect(claim.validationStatus).toBe('REJECTED');
    expect(claim.validationDetail).toMatch(/disagrees/);
  });

  it('rejects a claim with an invalid citation — the spec\'s own required test', async () => {
    const company = await db.company.create({ data: { ticker: TICKER, name: 'Research Claim Test Co.' } });
    const claim = await createClaim({
      companyId: company.id,
      claim: 'Revenue grew 11%, as disclosed in the 10-K.',
      statedValue: 0.11,
      sourceValue: 0.108,
      claimSourceType: 'RESEARCH_REPORT',
      citedSourceId: 'made-up-id',
      validSourceIds: new Set(['src-1', 'src-2']),
    });

    expect(claim.validationStatus).toBe('REJECTED');
    expect(claim.validationDetail).toMatch(/could not be verified/);
  });

  it('records an audit-log entry for claim creation and validation', async () => {
    const company = await db.company.create({ data: { ticker: TICKER, name: 'Research Claim Test Co.' } });
    const claim = await createClaim({ companyId: company.id, claim: 'A claim with nothing to verify.', claimSourceType: 'MANUAL' });

    const log = await db.auditLogEntry.findMany({ where: { companyId: company.id, entityId: claim.id } });
    expect(log.some((e) => e.action === 'CLAIM_CREATED')).toBe(true);
    expect(log.some((e) => e.action === 'CLAIM_VALIDATED')).toBe(true);
  });

  it('lists claims for a company and filters by validation status', async () => {
    const company = await db.company.create({ data: { ticker: TICKER, name: 'Research Claim Test Co.' } });
    await createClaim({ companyId: company.id, claim: 'Verified claim', statedValue: 0.1, sourceValue: 0.1, claimSourceType: 'MANUAL' });
    await createClaim({ companyId: company.id, claim: 'Rejected claim', statedValue: 0.5, sourceValue: 0.1, claimSourceType: 'MANUAL' });

    const rejectedOnly = await listClaims(company.id, { validationStatus: 'REJECTED' });
    expect(rejectedOnly).toHaveLength(1);
    expect(rejectedOnly[0]!.claim).toBe('Rejected claim');
  });

  it('throws ResearchClaimNotFoundError for a nonexistent claim id', async () => {
    await expect(getClaim('nonexistent-id')).rejects.toThrow(ResearchClaimNotFoundError);
  });
});
