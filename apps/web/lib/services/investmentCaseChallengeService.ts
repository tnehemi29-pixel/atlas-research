import type { InvestmentAssumptionMetric } from '@prisma/client';
import { db } from '@/lib/db';
import { getInvestmentCaseDetail } from '@/lib/services/investmentCaseService';
import { getQuickDcfScenarios, getQuickFundamentals } from '@/lib/valuation/quickValuation';
import { ASSUMPTION_METRIC_LABELS } from '@/lib/investmentCase/assumptionLabels';
import { evaluateThesisChallenges, type AssumptionChallengeInput, type ThesisChallenge } from '@/lib/investmentCase/thesisChallengeEngine';
import { evaluateInvalidationCriteria, type InvalidationEvaluation } from '@/lib/investmentCase/invalidationMonitor';

/**
 * Spec section 10 (Thesis Challenge Engine) and section 11 (Invalidation
 * monitoring) — the live-data orchestration layer over the pure functions
 * in lib/investmentCase/. Only the case's own BASE-scenario assumptions are
 * compared: Bull/Bear assumptions are deliberately-shifted "what if"
 * inputs, not the thesis's own real-world expectation, so comparing them
 * against a single live reading wouldn't mean anything.
 *
 * Live-value sourcing is deliberately conservative: REVENUE_GROWTH/
 * REVENUE_CAGR are compared against current TRAILING revenue growth (not a
 * cross-referenced guidance-implied growth rate, which would require
 * reconciling GuidanceObservation's dollar-denominated guidance against a
 * prior-period revenue figure) — a real, honestly-labeled live reading, not
 * a guidance-vs-assumption comparison this milestone doesn't yet build.
 * EXIT_MULTIPLE, DEBT, and SHARE_COUNT have no live source wired up yet and
 * are simply skipped (never a fabricated comparison).
 */

function affectedAreasForMetric(metric: InvestmentAssumptionMetric): string[] {
  switch (metric) {
    case 'REVENUE_GROWTH':
    case 'REVENUE_CAGR':
      return ['DCF', 'Growth thesis', 'Valuation'];
    case 'OPERATING_MARGIN':
    case 'FCF_MARGIN':
      return ['DCF', 'Margins', 'Valuation'];
    case 'WACC':
    case 'TERMINAL_GROWTH':
    case 'EXIT_MULTIPLE':
      return ['DCF', 'Valuation'];
    case 'EPS_GROWTH':
      return ['Valuation', 'Growth thesis'];
    case 'DEBT':
      return ['Balance Sheet', 'Risk'];
    case 'SHARE_COUNT':
      return ['Valuation', 'EPS'];
  }
}

interface LiveMetricValue {
  value: number | null;
  source: string;
}

async function buildLiveValuesByMetric(ticker: string): Promise<Partial<Record<InvestmentAssumptionMetric, LiveMetricValue>>> {
  const [dcfScenarios, fundamentals] = await Promise.all([getQuickDcfScenarios(ticker).catch(() => null), getQuickFundamentals(ticker).catch(() => null)]);

  const fcfMargin = fundamentals && fundamentals.freeCashFlow !== null && fundamentals.revenue !== null && fundamentals.revenue !== 0 ? fundamentals.freeCashFlow / fundamentals.revenue : null;

  return {
    REVENUE_GROWTH: { value: fundamentals?.revenueGrowth ?? null, source: 'Current fundamentals (trailing revenue growth)' },
    REVENUE_CAGR: { value: fundamentals?.revenueGrowth ?? null, source: 'Current fundamentals (trailing revenue growth, used as a CAGR proxy)' },
    OPERATING_MARGIN: { value: fundamentals?.operatingMargin ?? null, source: 'Current fundamentals' },
    FCF_MARGIN: { value: fcfMargin, source: 'Current fundamentals' },
    WACC: { value: dcfScenarios?.base.wacc ?? null, source: 'Current DCF Base case' },
    TERMINAL_GROWTH: { value: dcfScenarios?.base.terminalGrowthRate ?? null, source: 'Current DCF Base case' },
  };
}

/** Returns only the assumptions that clear their own threshold — "no
 * challenges" is the common, expected result, not an error state. */
export async function getThesisChallenges(userId: string, caseId: string): Promise<ThesisChallenge[]> {
  const investmentCase = await getInvestmentCaseDetail(userId, caseId);
  const assumptions = await db.investmentCaseAssumption.findMany({ where: { investmentCaseId: investmentCase.id, scenario: 'BASE' } });
  if (assumptions.length === 0) return [];

  const liveValues = await buildLiveValuesByMetric(investmentCase.company.ticker);

  const inputs: AssumptionChallengeInput[] = [];
  for (const assumption of assumptions) {
    const live = liveValues[assumption.metric];
    if (!live || live.value === null) continue;
    inputs.push({
      metric: assumption.metric,
      label: ASSUMPTION_METRIC_LABELS[assumption.metric],
      assumptionValue: assumption.value,
      unit: assumption.unit,
      liveValue: live.value,
      source: live.source,
      affectedAreas: affectedAreasForMetric(assumption.metric),
    });
  }

  return evaluateThesisChallenges(inputs);
}

/** Advisory only — see lib/investmentCase/invalidationMonitor.ts's own
 * header comment. Never writes InvestmentCaseInvalidationCriterion.status. */
export async function getInvalidationEvaluations(userId: string, caseId: string): Promise<InvalidationEvaluation[]> {
  const investmentCase = await getInvestmentCaseDetail(userId, caseId);
  const criteria = await db.investmentCaseInvalidationCriterion.findMany({ where: { investmentCaseId: investmentCase.id } });
  if (criteria.length === 0) return [];

  const liveValues = await buildLiveValuesByMetric(investmentCase.company.ticker);

  return evaluateInvalidationCriteria(
    criteria.map((criterion) => {
      const live = criterion.metric ? liveValues[criterion.metric] : undefined;
      return {
        criterionId: criterion.id,
        description: criterion.description,
        metric: criterion.metric,
        comparator: criterion.comparator,
        thresholdValue: criterion.thresholdValue,
        thresholdUnit: criterion.thresholdUnit,
        consecutivePeriods: criterion.consecutivePeriods,
        recentValues: live?.value !== null && live?.value !== undefined ? [live.value] : [],
      };
    }),
  );
}
