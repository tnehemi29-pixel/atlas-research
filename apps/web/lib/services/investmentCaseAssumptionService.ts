import type { ConfidenceLevel, ContentOrigin, InvestmentAssumptionMetric, InvestmentCaseAssumption, InvestmentScenario } from '@prisma/client';
import { db } from '@/lib/db';
import { getOwnedInvestmentCase } from '@/lib/services/investmentCaseService';

/**
 * Spec section 4 — thesis assumption tracking, connected to the case (not
 * to any one ResearchReport version, unlike Milestone 11's ThesisAssumption
 * — see the schema's own header comment for why). One row per
 * metric+scenario per case (`@@unique([investmentCaseId, metric, scenario])`)
 * — setting the same metric again is an update, never a duplicate row.
 */

export class InvestmentCaseAssumptionNotFoundError extends Error {
  constructor(message = 'Assumption not found.') {
    super(message);
    this.name = 'InvestmentCaseAssumptionNotFoundError';
  }
}

export async function listAssumptions(userId: string, caseId: string): Promise<InvestmentCaseAssumption[]> {
  const investmentCase = await getOwnedInvestmentCase(userId, caseId);
  return db.investmentCaseAssumption.findMany({ where: { investmentCaseId: investmentCase.id }, orderBy: [{ scenario: 'asc' }, { metric: 'asc' }] });
}

export interface SetAssumptionInput {
  metric: InvestmentAssumptionMetric;
  scenario?: InvestmentScenario;
  value: number;
  unit: string;
  asOfDate: Date | string;
  source: string;
  model?: string | null;
  confidence?: ConfidenceLevel;
  origin?: ContentOrigin;
  notes?: string | null;
}

/** Create-or-update on the case's own (metric, scenario) natural key — the
 * UI's assumption editor always calls this, never a raw create, so editing
 * "Revenue CAGR — Base" twice is one row with its value replaced, not two
 * competing rows. */
export async function setAssumption(userId: string, caseId: string, input: SetAssumptionInput): Promise<InvestmentCaseAssumption> {
  const investmentCase = await getOwnedInvestmentCase(userId, caseId);
  const scenario = input.scenario ?? 'BASE';

  return db.investmentCaseAssumption.upsert({
    where: { investmentCaseId_metric_scenario: { investmentCaseId: investmentCase.id, metric: input.metric, scenario } },
    create: {
      investmentCaseId: investmentCase.id,
      metric: input.metric,
      scenario,
      value: input.value,
      unit: input.unit,
      asOfDate: new Date(input.asOfDate),
      source: input.source,
      model: input.model ?? null,
      confidence: input.confidence ?? 'MEDIUM',
      origin: input.origin ?? 'USER',
      notes: input.notes ?? null,
    },
    update: {
      value: input.value,
      unit: input.unit,
      asOfDate: new Date(input.asOfDate),
      source: input.source,
      model: input.model ?? null,
      confidence: input.confidence ?? 'MEDIUM',
      origin: input.origin ?? 'USER',
      notes: input.notes ?? null,
    },
  });
}

export async function deleteAssumption(userId: string, caseId: string, assumptionId: string): Promise<void> {
  const investmentCase = await getOwnedInvestmentCase(userId, caseId);
  const result = await db.investmentCaseAssumption.deleteMany({ where: { id: assumptionId, investmentCaseId: investmentCase.id } });
  if (result.count === 0) throw new InvestmentCaseAssumptionNotFoundError();
}
