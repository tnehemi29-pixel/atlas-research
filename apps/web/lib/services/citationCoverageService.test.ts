import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { getCitationCoverage } from './citationCoverageService';

const TICKER = 'ZZCITE1';

async function cleanup() {
  const company = await db.company.findUnique({ where: { ticker: TICKER } });
  if (company) {
    await db.researchClaim.deleteMany({ where: { companyId: company.id } });
    await db.researchReport.deleteMany({ where: { companyId: company.id } });
  }
  await db.company.deleteMany({ where: { ticker: TICKER } });
}

async function makeReport() {
  const company = await db.company.upsert({ where: { ticker: TICKER }, create: { ticker: TICKER, name: 'Citation Test Co.' }, update: {} });
  return db.researchReport.create({
    data: { companyId: company.id, version: Math.floor(Math.random() * 1_000_000) + 1, status: 'SUCCESS', model: 'fixture', dataSnapshotAt: new Date(), content: { context: {}, report: null } },
  });
}

describe('citationCoverageService', () => {
  beforeAll(cleanup);
  afterAll(cleanup);
  afterEach(cleanup);

  it('reports "not available" (never a manufactured percentage) for a report with no linked claims', async () => {
    const report = await makeReport();
    const coverage = await getCitationCoverage(report.id);
    expect(coverage).toEqual({ available: false, totalClaims: 0, supportedClaims: 0, unsupportedClaims: 0, coveragePercent: null });
  });

  it('computes a real percentage once claims are linked, counting only VERIFIED as supported', async () => {
    const report = await makeReport();
    await db.researchClaim.createMany({
      data: [
        { companyId: report.companyId, researchReportId: report.id, claim: 'Revenue grew 6%.', claimSourceType: 'RESEARCH_REPORT', validationStatus: 'VERIFIED' },
        { companyId: report.companyId, researchReportId: report.id, claim: 'Margins expanded.', claimSourceType: 'RESEARCH_REPORT', validationStatus: 'VERIFIED' },
        { companyId: report.companyId, researchReportId: report.id, claim: 'Guidance raised.', claimSourceType: 'RESEARCH_REPORT', validationStatus: 'UNVERIFIED' },
        { companyId: report.companyId, researchReportId: report.id, claim: 'Backlog grew 20%.', claimSourceType: 'RESEARCH_REPORT', validationStatus: 'REJECTED' },
      ],
    });

    const coverage = await getCitationCoverage(report.id);
    expect(coverage.available).toBe(true);
    expect(coverage.totalClaims).toBe(4);
    expect(coverage.supportedClaims).toBe(2);
    expect(coverage.unsupportedClaims).toBe(2);
    expect(coverage.coveragePercent).toBe(50);
  });

  it('only counts claims linked to THIS report, not other reports for the same company', async () => {
    const reportA = await makeReport();
    const reportB = await makeReport();
    await db.researchClaim.create({ data: { companyId: reportA.companyId, researchReportId: reportA.id, claim: 'A claim.', claimSourceType: 'RESEARCH_REPORT', validationStatus: 'VERIFIED' } });

    const coverageA = await getCitationCoverage(reportA.id);
    const coverageB = await getCitationCoverage(reportB.id);
    expect(coverageA.totalClaims).toBe(1);
    expect(coverageB.available).toBe(false);
  });
});
