import { Prisma, type InvestmentCaseVersion } from '@prisma/client';
import { db } from '@/lib/db';
import { getInvestmentCaseDetail, getOwnedInvestmentCase } from '@/lib/services/investmentCaseService';
import { getQuickComps, getQuickDcfScenarios, getQuickFundamentals } from '@/lib/valuation/quickValuation';
import { ASSUMPTION_METRIC_LABELS } from '@/lib/investmentCase/assumptionLabels';
import { diffCaseSnapshots, type VersionDiff } from '@/lib/investmentCase/versionDiff';
import type { CaseSnapshot } from '@/lib/investmentCase/types';

/**
 * Spec section 22 — memo/version snapshots. `buildCaseSnapshot` is the ONE
 * place a case's full state (thesis + assumptions + evidence + risks +
 * catalysts + invalidation criteria + a live valuation read) is assembled —
 * both `createVersion` (below) and the AI context builder
 * (lib/investmentCase/context.ts) call this rather than re-gathering the
 * same data twice. Valuation is always a FRESH live read at snapshot time
 * (never stored anywhere else) — this is the one place in the whole
 * milestone a valuation figure is deliberately frozen, and only because a
 * version/memo must stay reproducible even after the live DCF later moves.
 */

export class InvestmentCaseVersionNotFoundError extends Error {
  constructor(message = 'Version not found.') {
    super(message);
    this.name = 'InvestmentCaseVersionNotFoundError';
  }
}

export async function buildCaseSnapshot(userId: string, caseId: string): Promise<CaseSnapshot> {
  const investmentCase = await getInvestmentCaseDetail(userId, caseId);
  const ticker = investmentCase.company.ticker;

  const [assumptions, evidence, risks, catalysts, invalidationCriteria, dcfScenarios, comps, fundamentals] = await Promise.all([
    db.investmentCaseAssumption.findMany({ where: { investmentCaseId: caseId } }),
    db.investmentCaseEvidence.findMany({ where: { investmentCaseId: caseId } }),
    db.investmentCaseRisk.findMany({ where: { investmentCaseId: caseId } }),
    db.investmentCaseCatalyst.findMany({ where: { investmentCaseId: caseId } }),
    db.investmentCaseInvalidationCriterion.findMany({ where: { investmentCaseId: caseId } }),
    getQuickDcfScenarios(ticker).catch(() => null),
    getQuickComps(ticker).catch(() => null),
    getQuickFundamentals(ticker).catch(() => null),
  ]);

  return {
    ticker,
    companyName: investmentCase.company.name,
    businessOverview: {
      exchange: investmentCase.company.exchange,
      sector: investmentCase.company.sector,
      industry: investmentCase.company.industry,
      country: investmentCase.company.country,
      marketCap: investmentCase.company.marketCap,
    },
    status: investmentCase.status,
    horizon: investmentCase.horizon,
    coreThesis: investmentCase.coreThesis,
    keyDrivers: investmentCase.keyDrivers,
    bullSummary: investmentCase.bullSummary,
    baseSummary: investmentCase.baseSummary,
    bearSummary: investmentCase.bearSummary,
    strengthenIndicators: investmentCase.strengthenIndicators,
    weakenIndicators: investmentCase.weakenIndicators,
    invalidateIndicators: investmentCase.invalidateIndicators,
    assumptions: assumptions.map((a) => ({ metric: a.metric, scenario: a.scenario, label: ASSUMPTION_METRIC_LABELS[a.metric], value: a.value, unit: a.unit, confidence: a.confidence })),
    evidence: evidence.map((e) => ({ id: e.id, claim: e.claim, evidence: e.evidence, date: e.date.toISOString(), category: e.category, direction: e.direction, strength: e.strength, sourceType: e.sourceType, sourceLabel: e.sourceLabel })),
    risks: risks.map((r) => ({ id: r.id, risk: r.risk, probability: r.probability, impact: r.impact, status: r.status })),
    catalysts: catalysts.map((c) => ({ id: c.id, catalyst: c.catalyst, timeframe: c.timeframe, potentialImpact: c.potentialImpact, status: c.status })),
    invalidationCriteria: invalidationCriteria.map((c) => ({ id: c.id, description: c.description })),
    financials: {
      revenue: fundamentals?.revenue ?? null,
      revenueGrowth: fundamentals?.revenueGrowth ?? null,
      operatingMargin: fundamentals?.operatingMargin ?? null,
      freeCashFlow: fundamentals?.freeCashFlow ?? null,
    },
    valuation: {
      currentSharePrice: fundamentals?.price ?? dcfScenarios?.base.currentSharePrice ?? null,
      dcfBase: dcfScenarios?.base.impliedSharePrice ?? null,
      dcfBull: dcfScenarios?.bull.impliedSharePrice ?? null,
      dcfBear: dcfScenarios?.bear.impliedSharePrice ?? null,
      compsImplied: comps?.impliedSharePrice ?? null,
      evToEbitda: fundamentals?.evToEbitda ?? null,
      peRatio: fundamentals?.peRatio ?? null,
    },
    capturedAt: new Date().toISOString(),
  };
}

/** Version numbers increment per case, starting at 1, never reused — same
 * discipline as ResearchReport (Milestone 9). */
export async function createVersion(userId: string, caseId: string): Promise<InvestmentCaseVersion> {
  const investmentCase = await getOwnedInvestmentCase(userId, caseId);
  const snapshot = await buildCaseSnapshot(userId, caseId);

  const latest = await db.investmentCaseVersion.findFirst({ where: { investmentCaseId: investmentCase.id }, orderBy: { version: 'desc' } });
  const version = (latest?.version ?? 0) + 1;

  return db.investmentCaseVersion.create({
    data: { investmentCaseId: investmentCase.id, version, snapshot: snapshot as unknown as Prisma.InputJsonValue },
  });
}

export async function listVersions(userId: string, caseId: string): Promise<InvestmentCaseVersion[]> {
  const investmentCase = await getOwnedInvestmentCase(userId, caseId);
  return db.investmentCaseVersion.findMany({ where: { investmentCaseId: investmentCase.id }, orderBy: { version: 'desc' } });
}

export async function getVersion(userId: string, caseId: string, version: number): Promise<InvestmentCaseVersion> {
  const investmentCase = await getOwnedInvestmentCase(userId, caseId);
  const row = await db.investmentCaseVersion.findUnique({ where: { investmentCaseId_version: { investmentCaseId: investmentCase.id, version } } });
  if (!row) throw new InvestmentCaseVersionNotFoundError();
  return row;
}

export async function compareVersions(userId: string, caseId: string, fromVersion: number, toVersion: number): Promise<VersionDiff> {
  const [from, to] = await Promise.all([getVersion(userId, caseId, fromVersion), getVersion(userId, caseId, toVersion)]);
  return diffCaseSnapshots(from.snapshot as unknown as CaseSnapshot, to.snapshot as unknown as CaseSnapshot);
}
