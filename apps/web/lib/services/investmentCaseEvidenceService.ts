import type { ConfidenceLevel, ContentOrigin, EvidenceDirection, EvidenceSourceType, InvestmentCaseEvidence } from '@prisma/client';
import { db } from '@/lib/db';
import { getOwnedInvestmentCase } from '@/lib/services/investmentCaseService';
import { requiredRowField, validateEvidenceSource, type EvidenceSourceCandidate, type RowBackedSourceResolution } from '@/lib/investmentCase/evidenceValidation';

/**
 * Spec sections 7-9 — the Evidence Matrix. `createEvidence` is the ONLY
 * write path onto InvestmentCaseEvidence in this codebase; it always routes
 * through `validateEvidenceSource` (lib/investmentCase/evidenceValidation.ts)
 * after actually resolving the referenced row (if any) from the database —
 * a human filling out the evidence form and the AI thesis assistant
 * proposing evidence both call this exact function, so there is no
 * separate, less-checked path for AI-originated content.
 */

export class InvestmentCaseEvidenceNotFoundError extends Error {
  constructor(message = 'Evidence not found.') {
    super(message);
    this.name = 'InvestmentCaseEvidenceNotFoundError';
  }
}

export class UnsupportedEvidenceSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedEvidenceSourceError';
  }
}

async function resolveRowBackedSource(candidate: EvidenceSourceCandidate, companyId: string): Promise<RowBackedSourceResolution | null> {
  const field = requiredRowField(candidate.sourceType);
  if (field === null) return null;
  const id = candidate[field];
  if (!id) return null;

  if (field === 'secFilingId') {
    const row = await db.secFiling.findUnique({ where: { id } });
    return { exists: row !== null, belongsToCompany: row?.companyId === companyId };
  }
  if (field === 'earningsCallId') {
    const row = await db.earningsCall.findUnique({ where: { id } });
    return { exists: row !== null, belongsToCompany: row?.companyId === companyId };
  }
  const row = await db.researchEvent.findUnique({ where: { id } });
  return { exists: row !== null, belongsToCompany: row?.companyId === companyId };
}

export async function listEvidence(userId: string, caseId: string): Promise<InvestmentCaseEvidence[]> {
  const investmentCase = await getOwnedInvestmentCase(userId, caseId);
  return db.investmentCaseEvidence.findMany({ where: { investmentCaseId: investmentCase.id }, orderBy: { date: 'desc' } });
}

export interface CreateEvidenceInput {
  claim: string;
  evidence: string;
  date: Date | string;
  category: string;
  direction: EvidenceDirection;
  strength: ConfidenceLevel;
  sourceType: EvidenceSourceType;
  sourceLabel: string;
  secFilingId?: string | null;
  earningsCallId?: string | null;
  researchEventId?: string | null;
  origin?: ContentOrigin;
}

/** Throws UnsupportedEvidenceSourceError — never silently drops the source
 * requirement — when the proposed evidence doesn't resolve to a real,
 * company-scoped Atlas source. */
export async function createEvidence(userId: string, caseId: string, input: CreateEvidenceInput): Promise<InvestmentCaseEvidence> {
  const investmentCase = await getOwnedInvestmentCase(userId, caseId);

  const candidate: EvidenceSourceCandidate = {
    sourceType: input.sourceType,
    sourceLabel: input.sourceLabel,
    secFilingId: input.secFilingId ?? null,
    earningsCallId: input.earningsCallId ?? null,
    researchEventId: input.researchEventId ?? null,
  };

  const resolution = await resolveRowBackedSource(candidate, investmentCase.companyId);
  const validation = validateEvidenceSource(candidate, resolution);
  if (!validation.valid) {
    throw new UnsupportedEvidenceSourceError(validation.reason ?? 'Evidence source could not be validated.');
  }

  return db.investmentCaseEvidence.create({
    data: {
      investmentCaseId: investmentCase.id,
      claim: input.claim,
      evidence: input.evidence,
      date: new Date(input.date),
      category: input.category,
      direction: input.direction,
      strength: input.strength,
      sourceType: input.sourceType,
      sourceLabel: input.sourceLabel,
      secFilingId: candidate.secFilingId,
      earningsCallId: candidate.earningsCallId,
      researchEventId: candidate.researchEventId,
      origin: input.origin ?? 'USER',
    },
  });
}

export async function deleteEvidence(userId: string, caseId: string, evidenceId: string): Promise<void> {
  const investmentCase = await getOwnedInvestmentCase(userId, caseId);
  const result = await db.investmentCaseEvidence.deleteMany({ where: { id: evidenceId, investmentCaseId: investmentCase.id } });
  if (result.count === 0) throw new InvestmentCaseEvidenceNotFoundError();
}
