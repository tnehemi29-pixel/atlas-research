import type { ConfidenceLevel, InvestmentCaseRisk, RiskStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { getOwnedInvestmentCase } from '@/lib/services/investmentCaseService';

/** Spec section 19 — structured risks. Probability is only ever stored when
 * the caller actually supplies one; never a fabricated LOW/MEDIUM/HIGH
 * default standing in for "unassessed." */

export class InvestmentCaseRiskNotFoundError extends Error {
  constructor(message = 'Risk not found.') {
    super(message);
    this.name = 'InvestmentCaseRiskNotFoundError';
  }
}

export async function listRisks(userId: string, caseId: string): Promise<InvestmentCaseRisk[]> {
  const investmentCase = await getOwnedInvestmentCase(userId, caseId);
  return db.investmentCaseRisk.findMany({ where: { investmentCaseId: investmentCase.id }, orderBy: { createdAt: 'desc' } });
}

export interface CreateRiskInput {
  risk: string;
  probability?: ConfidenceLevel | null;
  impact: ConfidenceLevel;
  evidence?: string | null;
  status?: RiskStatus;
  mitigation?: string | null;
}

export async function createRisk(userId: string, caseId: string, input: CreateRiskInput): Promise<InvestmentCaseRisk> {
  const investmentCase = await getOwnedInvestmentCase(userId, caseId);
  return db.investmentCaseRisk.create({
    data: {
      investmentCaseId: investmentCase.id,
      risk: input.risk,
      probability: input.probability ?? null,
      impact: input.impact,
      evidence: input.evidence ?? null,
      status: input.status ?? 'MONITORING',
      mitigation: input.mitigation ?? null,
    },
  });
}

export interface UpdateRiskInput {
  risk?: string;
  probability?: ConfidenceLevel | null;
  impact?: ConfidenceLevel;
  evidence?: string | null;
  status?: RiskStatus;
  mitigation?: string | null;
}

export async function updateRisk(userId: string, caseId: string, riskId: string, input: UpdateRiskInput): Promise<InvestmentCaseRisk> {
  const investmentCase = await getOwnedInvestmentCase(userId, caseId);
  const existing = await db.investmentCaseRisk.findFirst({ where: { id: riskId, investmentCaseId: investmentCase.id } });
  if (!existing) throw new InvestmentCaseRiskNotFoundError();
  return db.investmentCaseRisk.update({ where: { id: riskId }, data: input });
}

export async function deleteRisk(userId: string, caseId: string, riskId: string): Promise<void> {
  const investmentCase = await getOwnedInvestmentCase(userId, caseId);
  const result = await db.investmentCaseRisk.deleteMany({ where: { id: riskId, investmentCaseId: investmentCase.id } });
  if (result.count === 0) throw new InvestmentCaseRiskNotFoundError();
}
