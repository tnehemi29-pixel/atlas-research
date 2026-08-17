import type { CatalystStatus, ConfidenceLevel, InvestmentCaseCatalyst } from '@prisma/client';
import { db } from '@/lib/db';
import { getOwnedInvestmentCase } from '@/lib/services/investmentCaseService';

/** Spec section 18 — structured catalysts. "Do not invent future
 * catalysts" is enforced by construction: this service never generates a
 * catalyst itself, it only ever persists what a user (or, after passing
 * through the same evidence-style path elsewhere, a cited AI suggestion)
 * explicitly submits. */

export class InvestmentCaseCatalystNotFoundError extends Error {
  constructor(message = 'Catalyst not found.') {
    super(message);
    this.name = 'InvestmentCaseCatalystNotFoundError';
  }
}

export async function listCatalysts(userId: string, caseId: string): Promise<InvestmentCaseCatalyst[]> {
  const investmentCase = await getOwnedInvestmentCase(userId, caseId);
  return db.investmentCaseCatalyst.findMany({ where: { investmentCaseId: investmentCase.id }, orderBy: { createdAt: 'desc' } });
}

export interface CreateCatalystInput {
  catalyst: string;
  timeframe: string;
  evidence?: string | null;
  potentialImpact: ConfidenceLevel;
  status?: CatalystStatus;
}

export async function createCatalyst(userId: string, caseId: string, input: CreateCatalystInput): Promise<InvestmentCaseCatalyst> {
  const investmentCase = await getOwnedInvestmentCase(userId, caseId);
  return db.investmentCaseCatalyst.create({
    data: {
      investmentCaseId: investmentCase.id,
      catalyst: input.catalyst,
      timeframe: input.timeframe,
      evidence: input.evidence ?? null,
      potentialImpact: input.potentialImpact,
      status: input.status ?? 'UPCOMING',
    },
  });
}

export interface UpdateCatalystInput {
  catalyst?: string;
  timeframe?: string;
  evidence?: string | null;
  potentialImpact?: ConfidenceLevel;
  status?: CatalystStatus;
}

export async function updateCatalyst(userId: string, caseId: string, catalystId: string, input: UpdateCatalystInput): Promise<InvestmentCaseCatalyst> {
  const investmentCase = await getOwnedInvestmentCase(userId, caseId);
  const existing = await db.investmentCaseCatalyst.findFirst({ where: { id: catalystId, investmentCaseId: investmentCase.id } });
  if (!existing) throw new InvestmentCaseCatalystNotFoundError();
  return db.investmentCaseCatalyst.update({ where: { id: catalystId }, data: input });
}

export async function deleteCatalyst(userId: string, caseId: string, catalystId: string): Promise<void> {
  const investmentCase = await getOwnedInvestmentCase(userId, caseId);
  const result = await db.investmentCaseCatalyst.deleteMany({ where: { id: catalystId, investmentCaseId: investmentCase.id } });
  if (result.count === 0) throw new InvestmentCaseCatalystNotFoundError();
}
