import type { ClaimSource, ConfidenceLevel, ResearchClaim, SourceTier } from '@prisma/client';
import { db } from '@/lib/db';
import { validateResearchClaim } from '@/lib/integrity/claimValidation';
import { getSourceTier } from '@/lib/integrity/sourceHierarchy';
import { writeAuditLogEntry } from '@/lib/services/auditLogService';

/**
 * Milestone 14 spec section 14 — the research claim registry, and section
 * 13's AI output validation. `createClaim` is the ONE write path onto
 * ResearchClaim: every claim, whether entered manually or produced by an
 * AI-generation pipeline elsewhere in Atlas, is validated the identical way
 * before it's persisted — the LLM is never treated as a source of truth
 * (spec section 13), so a claim's `validationStatus` is always computed
 * here, never trusted from whatever produced the claim text.
 */

export class ResearchClaimNotFoundError extends Error {
  constructor(message = 'Research claim not found.') {
    super(message);
    this.name = 'ResearchClaimNotFoundError';
  }
}

export interface ClaimSourceInput {
  sourceType: string;
  sourceId?: string | null;
  sourceLabel: string;
}

export interface CreateClaimInput {
  companyId: string;
  claim: string;
  metric?: string | null;
  statedValue?: number | null;
  sourceValue?: number | null;
  unit?: string | null;
  claimSourceType: string;
  claimSourceId?: string | null;
  dataSnapshotAt?: Date | string | null;
  confidence?: ConfidenceLevel | null;
  /** The set of ids the claim's citation is checked against — pass `null`
   * to skip the citation check entirely (e.g. a claim with no discrete
   * source-id citation attached). */
  validSourceIds?: ReadonlySet<string> | null;
  citedSourceId?: string | null;
  sources?: ClaimSourceInput[];
  tolerancePercent?: number;
  toleranceAbsoluteFloor?: number;
}

function toClaimSourceTier(sourceType: string): SourceTier {
  return getSourceTier(sourceType);
}

export type ResearchClaimWithSources = ResearchClaim & { sources: ClaimSource[] };

export async function createClaim(input: CreateClaimInput): Promise<ResearchClaimWithSources> {
  const outcome = validateResearchClaim({
    statedValue: input.statedValue ?? null,
    sourceValue: input.sourceValue ?? null,
    citedSourceId: input.citedSourceId ?? null,
    validSourceIds: input.validSourceIds ?? null,
    tolerancePercent: input.tolerancePercent,
    toleranceAbsoluteFloor: input.toleranceAbsoluteFloor,
  });

  const claim = await db.researchClaim.create({
    data: {
      companyId: input.companyId,
      claim: input.claim,
      metric: input.metric ?? null,
      statedValue: input.statedValue ?? null,
      sourceValue: input.sourceValue ?? null,
      unit: input.unit ?? null,
      claimSourceType: input.claimSourceType,
      claimSourceId: input.claimSourceId ?? null,
      dataSnapshotAt: input.dataSnapshotAt ? new Date(input.dataSnapshotAt) : null,
      confidence: input.confidence ?? null,
      validationStatus: outcome.status,
      validationDetail: outcome.detail,
      sources: input.sources
        ? { create: input.sources.map((s) => ({ sourceType: s.sourceType, sourceId: s.sourceId ?? null, sourceLabel: s.sourceLabel, sourceTier: toClaimSourceTier(s.sourceType) })) }
        : undefined,
    },
    include: { sources: true },
  });

  await writeAuditLogEntry({
    companyId: input.companyId,
    entityType: 'ResearchClaim',
    entityId: claim.id,
    action: 'CLAIM_CREATED',
    detail: { claim: input.claim, validationStatus: outcome.status },
  });
  await writeAuditLogEntry({
    companyId: input.companyId,
    entityType: 'ResearchClaim',
    entityId: claim.id,
    action: 'CLAIM_VALIDATED',
    detail: { validationStatus: outcome.status, detail: outcome.detail },
  });

  return claim;
}

export async function listClaims(companyId: string, filters: { validationStatus?: ResearchClaim['validationStatus'] } = {}): Promise<ResearchClaimWithSources[]> {
  return db.researchClaim.findMany({ where: { companyId, validationStatus: filters.validationStatus ?? undefined }, include: { sources: true }, orderBy: { createdAt: 'desc' } });
}

export async function getClaim(claimId: string): Promise<ResearchClaimWithSources> {
  const claim = await db.researchClaim.findUnique({ where: { id: claimId }, include: { sources: true } });
  if (!claim) throw new ResearchClaimNotFoundError();
  return claim;
}
