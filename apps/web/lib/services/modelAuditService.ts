import { Prisma, type IntegrityDatasetType, type ModelAudit } from '@prisma/client';
import { db } from '@/lib/db';
import { getCompanyOverview } from '@/lib/services/companyService';
import { getFinancials } from '@/lib/services/financialDataService';
import { deriveHistoricalYears } from '@/lib/valuation/historicals';
import { buildMarketData } from '@/lib/valuation/marketData';
import { buildDefaultAssumptions, runDcf } from '@/lib/valuation/engine';
import type { DcfAssumptions } from '@/lib/valuation/types';
import { getPeerCandidates, fetchTargetAndPeers } from '@/lib/services/compsDataService';
import { runComps } from '@/lib/comps/engine';
import type { PeerSelection } from '@/lib/comps/types';
import { auditDcf } from '@/lib/integrity/dcfAudit';
import { auditComps } from '@/lib/integrity/compsAudit';
import type { IntegrityFinding } from '@/lib/integrity/types';

/**
 * Milestone 14 spec sections 9, 11, 24 — runs the DCF and Comps audits
 * against a REAL, freshly-computed model run (the exact same engines and
 * default assumptions the Valuation/Comps pages and Milestone 9's report
 * generator already use — `buildDefaultAssumptions`/`runDcf`/`runComps`,
 * never a second, parallel calculation), and persists the result as a
 * versioned ModelAudit row (append-only — see the schema's own header
 * comment for why this is where "model versioning" lives for DCF/Comps).
 */

const DEFAULT_PEER_COUNT = 6; // matches CompsWorkspace.tsx's own default

export interface ModelAuditOutcome {
  modelType: IntegrityDatasetType;
  passed: boolean;
  findings: IntegrityFinding[];
}

async function persistModelAudit(companyId: string, modelType: IntegrityDatasetType, findings: IntegrityFinding[], inputsSnapshot: unknown): Promise<ModelAudit> {
  const passed = findings.every((f) => f.passed);
  return db.modelAudit.create({
    data: {
      companyId,
      modelType,
      passed,
      findings: findings as unknown as Prisma.InputJsonValue,
      inputsSnapshot: inputsSnapshot as Prisma.InputJsonValue,
    },
  });
}

/** Returns null when there isn't enough data to even attempt a DCF (no
 * overview or no financial periods) — never audits a model that couldn't
 * actually be built. */
export async function runDcfModelAudit(companyId: string): Promise<ModelAuditOutcome | null> {
  const company = await db.company.findUnique({ where: { id: companyId } });
  if (!company) return null;

  const overview = await getCompanyOverview(company.ticker);
  if (!overview) return null;

  let periods;
  try {
    periods = (await getFinancials(company.ticker, 'annual')).periods;
  } catch {
    return null;
  }
  if (periods.length === 0) return null;

  const historicals = deriveHistoricalYears(periods);
  const marketData = buildMarketData(overview, periods);
  const defaultAssumptions = buildDefaultAssumptions(marketData);
  // A saved, explicit user assumption (never a default Atlas invents) — see
  // Company.costOfDebtOverride's schema comment. Patched in locally, on top
  // of the unmodified default assumptions, so this audit reflects the same
  // saved choice the Valuation page shows instead of independently
  // reconstructing a blocked default when one has been recorded.
  const assumptions: DcfAssumptions =
    company.costOfDebtOverride !== null
      ? { ...defaultAssumptions, wacc: { ...defaultAssumptions.wacc, costOfDebtMethod: 'user', costOfDebtUser: company.costOfDebtOverride } }
      : defaultAssumptions;
  const result = runDcf({ historicals, marketData, assumptions });

  const findings = auditDcf(assumptions, result, marketData);
  await persistModelAudit(companyId, 'DCF_MODEL', findings, { assumptions, result, marketData });

  return { modelType: 'DCF_MODEL', passed: findings.every((f) => f.passed), findings };
}

/** Returns null when no peer set could be assembled at all (never audits an
 * empty comps run as if it were a real one). */
export async function runCompsModelAudit(companyId: string): Promise<ModelAuditOutcome | null> {
  const company = await db.company.findUnique({ where: { id: companyId } });
  if (!company) return null;

  const candidates = await getPeerCandidates(company.ticker).catch(() => []);
  if (candidates.length === 0) return null;

  const peerTickers = candidates.slice(0, DEFAULT_PEER_COUNT).map((c) => c.metrics.ticker);
  const { target, peers } = await fetchTargetAndPeers(company.ticker, peerTickers);
  if (peers.length === 0) return null;

  const peerSelections: PeerSelection[] = peers.map((metrics) => ({ metrics, score: null, source: 'calculated', excluded: false }));
  const result = runComps({ target, peers: peerSelections });

  const findings = auditComps(result);
  await persistModelAudit(companyId, 'COMPS_MODEL', findings, result);

  return { modelType: 'COMPS_MODEL', passed: findings.every((f) => f.passed), findings };
}

export async function getLatestModelAudit(companyId: string, modelType: IntegrityDatasetType): Promise<ModelAudit | null> {
  return db.modelAudit.findFirst({ where: { companyId, modelType }, orderBy: { auditedAt: 'desc' } });
}
