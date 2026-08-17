import type { InvestmentCase, InvestmentCaseStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { ensureCompanyByTicker } from '@/lib/services/companyService';

/**
 * Investment Case CRUD — the root resource every other Milestone 13 service
 * (assumptions, evidence, risks, catalysts, invalidation criteria, reviews,
 * versions, memos) hangs off. `getOwnedInvestmentCase` is the same choke
 * point lib/services/watchlistService.ts's `getOwnedWatchlist` established:
 * `findUnique` + a manual `userId` compare, collapsing "doesn't exist" and
 * "belongs to someone else" into the identical `InvestmentCaseNotFoundError`
 * so probing an id can never leak ownership information. Every other
 * Milestone 13 service imports `getOwnedInvestmentCase` from this file
 * rather than re-implementing the check.
 */

export class InvestmentCaseNotFoundError extends Error {
  constructor(message = 'Investment case not found.') {
    super(message);
    this.name = 'InvestmentCaseNotFoundError';
  }
}

export class InvalidInvestmentCaseInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidInvestmentCaseInputError';
  }
}

export async function getOwnedInvestmentCase(userId: string, caseId: string): Promise<InvestmentCase> {
  const investmentCase = await db.investmentCase.findUnique({ where: { id: caseId } });
  if (!investmentCase || investmentCase.userId !== userId) {
    throw new InvestmentCaseNotFoundError();
  }
  return investmentCase;
}

export async function listInvestmentCases(userId: string) {
  return db.investmentCase.findMany({
    where: { userId },
    include: { company: true },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function getInvestmentCaseDetail(userId: string, caseId: string) {
  const investmentCase = await getOwnedInvestmentCase(userId, caseId);
  return db.investmentCase.findUniqueOrThrow({
    where: { id: investmentCase.id },
    include: { company: true },
  });
}

export interface CreateInvestmentCaseInput {
  ticker: string;
  horizon: string;
  coreThesis: string;
  keyDrivers?: string[];
  status?: InvestmentCaseStatus;
}

function assertNonEmpty(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new InvalidInvestmentCaseInputError(`${field} cannot be empty.`);
  return trimmed;
}

export async function createInvestmentCase(userId: string, input: CreateInvestmentCaseInput): Promise<InvestmentCase> {
  const horizon = assertNonEmpty(input.horizon, 'Horizon');
  const coreThesis = assertNonEmpty(input.coreThesis, 'Core thesis');
  const ticker = input.ticker.trim().toUpperCase();
  if (ticker.length === 0) throw new InvalidInvestmentCaseInputError('Ticker cannot be empty.');

  const company = await ensureCompanyByTicker(ticker);

  return db.investmentCase.create({
    data: {
      userId,
      companyId: company.id,
      horizon,
      coreThesis,
      keyDrivers: input.keyDrivers ?? [],
      status: input.status ?? 'RESEARCHING',
    },
  });
}

export interface UpdateInvestmentCaseInput {
  horizon?: string;
  coreThesis?: string;
  keyDrivers?: string[];
  status?: InvestmentCaseStatus;
  bullSummary?: string | null;
  baseSummary?: string | null;
  bearSummary?: string | null;
  strengthenIndicators?: string[];
  weakenIndicators?: string[];
  invalidateIndicators?: string[];
}

/** Every field is independently optional/editable — matching spec section
 * 3's "allow users to edit each component independently." The decision
 * status is the one field an AI-suggested value must never silently apply
 * to; this function has no notion of "AI origin" at all — a status change
 * always comes from an explicit user action at the API layer. */
export async function updateInvestmentCase(userId: string, caseId: string, input: UpdateInvestmentCaseInput): Promise<InvestmentCase> {
  const investmentCase = await getOwnedInvestmentCase(userId, caseId);

  const data: Record<string, unknown> = {};
  if (input.horizon !== undefined) data.horizon = assertNonEmpty(input.horizon, 'Horizon');
  if (input.coreThesis !== undefined) data.coreThesis = assertNonEmpty(input.coreThesis, 'Core thesis');
  if (input.keyDrivers !== undefined) data.keyDrivers = input.keyDrivers;
  if (input.status !== undefined) data.status = input.status;
  if (input.bullSummary !== undefined) data.bullSummary = input.bullSummary;
  if (input.baseSummary !== undefined) data.baseSummary = input.baseSummary;
  if (input.bearSummary !== undefined) data.bearSummary = input.bearSummary;
  if (input.strengthenIndicators !== undefined) data.strengthenIndicators = input.strengthenIndicators;
  if (input.weakenIndicators !== undefined) data.weakenIndicators = input.weakenIndicators;
  if (input.invalidateIndicators !== undefined) data.invalidateIndicators = input.invalidateIndicators;

  return db.investmentCase.update({ where: { id: investmentCase.id }, data });
}

export async function deleteInvestmentCase(userId: string, caseId: string): Promise<void> {
  const investmentCase = await getOwnedInvestmentCase(userId, caseId);
  await db.investmentCase.delete({ where: { id: investmentCase.id } });
}
