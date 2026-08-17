import type { InvalidationComparator, InvalidationCriterionStatus, InvestmentAssumptionMetric, InvestmentCaseInvalidationCriterion } from '@prisma/client';
import { db } from '@/lib/db';
import { getOwnedInvestmentCase } from '@/lib/services/investmentCaseService';

/** Spec section 11 — user-defined invalidation criteria. `status` is only
 * ever moved to POTENTIALLY_MET or RESOLVED by an explicit call to
 * `updateInvalidationCriterion` (a user action) — the live-monitoring read
 * path (lib/investmentCase/invalidationMonitor.ts, wired up in
 * investmentCaseChallengeService.ts) never writes to this table itself. */

export class InvestmentCaseInvalidationCriterionNotFoundError extends Error {
  constructor(message = 'Invalidation criterion not found.') {
    super(message);
    this.name = 'InvestmentCaseInvalidationCriterionNotFoundError';
  }
}

export async function listInvalidationCriteria(userId: string, caseId: string): Promise<InvestmentCaseInvalidationCriterion[]> {
  const investmentCase = await getOwnedInvestmentCase(userId, caseId);
  return db.investmentCaseInvalidationCriterion.findMany({ where: { investmentCaseId: investmentCase.id }, orderBy: { createdAt: 'desc' } });
}

export interface CreateInvalidationCriterionInput {
  description: string;
  metric?: InvestmentAssumptionMetric | null;
  comparator?: InvalidationComparator | null;
  thresholdValue?: number | null;
  thresholdUnit?: string | null;
  consecutivePeriods?: number | null;
}

export async function createInvalidationCriterion(userId: string, caseId: string, input: CreateInvalidationCriterionInput): Promise<InvestmentCaseInvalidationCriterion> {
  const investmentCase = await getOwnedInvestmentCase(userId, caseId);
  return db.investmentCaseInvalidationCriterion.create({
    data: {
      investmentCaseId: investmentCase.id,
      description: input.description,
      metric: input.metric ?? null,
      comparator: input.comparator ?? null,
      thresholdValue: input.thresholdValue ?? null,
      thresholdUnit: input.thresholdUnit ?? null,
      consecutivePeriods: input.consecutivePeriods ?? null,
    },
  });
}

export interface UpdateInvalidationCriterionInput {
  description?: string;
  metric?: InvestmentAssumptionMetric | null;
  comparator?: InvalidationComparator | null;
  thresholdValue?: number | null;
  thresholdUnit?: string | null;
  consecutivePeriods?: number | null;
  status?: InvalidationCriterionStatus;
}

export async function updateInvalidationCriterion(userId: string, caseId: string, criterionId: string, input: UpdateInvalidationCriterionInput): Promise<InvestmentCaseInvalidationCriterion> {
  const investmentCase = await getOwnedInvestmentCase(userId, caseId);
  const existing = await db.investmentCaseInvalidationCriterion.findFirst({ where: { id: criterionId, investmentCaseId: investmentCase.id } });
  if (!existing) throw new InvestmentCaseInvalidationCriterionNotFoundError();
  return db.investmentCaseInvalidationCriterion.update({ where: { id: criterionId }, data: input });
}

export async function deleteInvalidationCriterion(userId: string, caseId: string, criterionId: string): Promise<void> {
  const investmentCase = await getOwnedInvestmentCase(userId, caseId);
  const result = await db.investmentCaseInvalidationCriterion.deleteMany({ where: { id: criterionId, investmentCaseId: investmentCase.id } });
  if (result.count === 0) throw new InvestmentCaseInvalidationCriterionNotFoundError();
}
