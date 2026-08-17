import { db } from '@/lib/db';
import { getInvestmentCaseDetail } from '@/lib/services/investmentCaseService';
import { ASSUMPTION_METRIC_LABELS } from '@/lib/investmentCase/assumptionLabels';
import { auditThesisAssumptionAgainstGuidance, computeGuidanceImpliedGrowthRange } from '@/lib/integrity/thesisIntegrityAudit';
import type { IntegrityFinding } from '@/lib/integrity/types';

/**
 * Milestone 14 spec section 16 — thesis integrity, integrating with
 * Milestone 13. Deliberately scoped to the SAME user+case ownership model
 * Milestone 13 itself uses (`getInvestmentCaseDetail`, which throws unless
 * the calling user actually owns the case) — an Investment Case is private
 * per-user data (unlike a ResearchReport or ResearchEvent), so this audit
 * never runs across other users' cases and never surfaces into the global,
 * cross-user /integrity dashboard. A user can only ever audit their OWN
 * thesis, exactly matching the spec's own worked example ("Investment
 * thesis: Revenue CAGR = 15%... Flag: ASSUMPTION CONFLICT").
 */

const GROWTH_METRICS = new Set(['REVENUE_GROWTH', 'REVENUE_CAGR']);

export async function auditInvestmentCaseThesis(userId: string, caseId: string): Promise<IntegrityFinding[]> {
  const investmentCase = await getInvestmentCaseDetail(userId, caseId);

  const [assumptions, latestGuidance, latestPeriod] = await Promise.all([
    db.investmentCaseAssumption.findMany({ where: { investmentCaseId: investmentCase.id, scenario: 'BASE' } }),
    db.guidanceObservation.findFirst({ where: { earningsCall: { companyId: investmentCase.companyId }, metric: 'REVENUE' }, orderBy: { createdAt: 'desc' } }),
    db.financialPeriod.findFirst({ where: { companyId: investmentCase.companyId, periodType: 'ANNUAL' }, orderBy: { fiscalYear: 'desc' }, include: { incomeStatement: true } }),
  ]);

  const growthAssumptions = assumptions.filter((a) => GROWTH_METRICS.has(a.metric));
  if (growthAssumptions.length === 0) return [];

  const guidanceImpliedRange = latestGuidance
    ? computeGuidanceImpliedGrowthRange({ low: latestGuidance.low, high: latestGuidance.high, midpoint: latestGuidance.midpoint }, latestPeriod?.incomeStatement?.revenue ?? null)
    : null;

  return growthAssumptions.map((assumption) =>
    auditThesisAssumptionAgainstGuidance({
      assumptionLabel: ASSUMPTION_METRIC_LABELS[assumption.metric],
      assumptionValue: assumption.value,
      guidanceImpliedRange,
    }),
  );
}
