import { db } from '@/lib/db';

/**
 * Milestone 15 spec section 18 — citation coverage, integrating Milestone
 * 14's ResearchClaim registry. "Supported" means VERIFIED specifically (a
 * valid citation AND a number that checks out against source data) —
 * UNVERIFIED/CONTRADICTED/STALE/REJECTED all count as unsupported for this
 * metric, since none of them currently stand as fully backed.
 *
 * Nothing in Atlas yet auto-extracts claims from a report's own generated
 * prose (see docs/research-integrity.md's known limitations) — a report
 * with zero linked ResearchClaim rows returns `available: false` rather
 * than a manufactured percentage, exactly matching the spec's own
 * instruction: "If the metric cannot be calculated reliably: Display 'Not
 * available.' Do not manufacture a percentage." Reports are global,
 * publicly-readable data (Milestone 9) — this is a plain read requiring no
 * workspace membership, the same convention Milestone 9/14's own
 * company-scoped GETs use.
 */

export interface CitationCoverageResult {
  available: boolean;
  totalClaims: number;
  supportedClaims: number;
  unsupportedClaims: number;
  coveragePercent: number | null;
}

const UNAVAILABLE: CitationCoverageResult = { available: false, totalClaims: 0, supportedClaims: 0, unsupportedClaims: 0, coveragePercent: null };

export async function getCitationCoverage(reportId: string): Promise<CitationCoverageResult> {
  const claims = await db.researchClaim.findMany({ where: { researchReportId: reportId }, select: { validationStatus: true } });
  if (claims.length === 0) return UNAVAILABLE;

  const supportedClaims = claims.filter((c) => c.validationStatus === 'VERIFIED').length;
  const unsupportedClaims = claims.length - supportedClaims;
  return {
    available: true,
    totalClaims: claims.length,
    supportedClaims,
    unsupportedClaims,
    coveragePercent: Math.round((supportedClaims / claims.length) * 100),
  };
}
