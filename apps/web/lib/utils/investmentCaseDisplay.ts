/**
 * Shared display formatting for Milestone 13's Investment Committee
 * framework — status/health label + style maps used by the dashboard, case
 * detail, and review UIs so a status is never rendered three different ways
 * across those screens (mirrors lib/utils/researchEventDisplay.ts's role
 * for Milestone 11).
 */

export const INVESTMENT_CASE_STATUS_LABELS: Record<string, string> = {
  RESEARCHING: 'Researching',
  WATCHLIST: 'Watchlist',
  ACTIVE_THESIS: 'Active Thesis',
  UNDER_REVIEW: 'Under Review',
  THESIS_CHALLENGED: 'Thesis Challenged',
  THESIS_INVALIDATED: 'Thesis Invalidated',
  ARCHIVED: 'Archived',
};

export const INVESTMENT_CASE_STATUS_STYLE: Record<string, string> = {
  RESEARCHING: 'border-ink/15 bg-ink/5 text-ink/60',
  WATCHLIST: 'border-sky-300 bg-sky-50 text-sky-800',
  ACTIVE_THESIS: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  UNDER_REVIEW: 'border-amber-300 bg-amber-50 text-amber-800',
  THESIS_CHALLENGED: 'border-orange-300 bg-orange-50 text-orange-800',
  THESIS_INVALIDATED: 'border-red-300 bg-red-50 text-red-700',
  ARCHIVED: 'border-ink/10 bg-ink/5 text-ink/40',
};

/** Never a bare buy/sell color — always paired with the `reasons` array
 * computeThesisHealth() returns, so a status is never shown without its
 * own explanation. */
export const THESIS_HEALTH_LABELS: Record<string, string> = {
  STABLE: 'Stable',
  WATCH: 'Watch',
  CHALLENGED: 'Challenged',
  REVIEW_REQUIRED: 'Review Required',
};

export const THESIS_HEALTH_STYLE: Record<string, string> = {
  STABLE: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  WATCH: 'border-amber-300 bg-amber-50 text-amber-800',
  CHALLENGED: 'border-orange-300 bg-orange-50 text-orange-800',
  REVIEW_REQUIRED: 'border-red-300 bg-red-50 text-red-700',
};

export const EVIDENCE_DIRECTION_LABELS: Record<string, string> = {
  SUPPORTS: 'Supports',
  CONTRADICTS: 'Contradicts',
  NEUTRAL: 'Neutral',
};

export const EVIDENCE_DIRECTION_STYLE: Record<string, string> = {
  SUPPORTS: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  CONTRADICTS: 'border-red-300 bg-red-50 text-red-700',
  NEUTRAL: 'border-ink/15 bg-ink/5 text-ink/60',
};

export const RISK_STATUS_LABELS: Record<string, string> = {
  MONITORING: 'Monitoring',
  ESCALATING: 'Escalating',
  MITIGATED: 'Mitigated',
  REALIZED: 'Realized',
};

export const CATALYST_STATUS_LABELS: Record<string, string> = {
  UPCOMING: 'Upcoming',
  IN_PROGRESS: 'In Progress',
  OCCURRED: 'Occurred',
  FAILED: 'Failed',
  UNCERTAIN: 'Uncertain',
};

export const REVIEW_OUTCOME_LABELS: Record<string, string> = {
  THESIS_VALID: 'Thesis Valid',
  NEEDS_MODIFICATION: 'Needs Modification',
  INVALIDATED: 'Invalidated',
  CONTINUE_MONITORING: 'Continue Monitoring',
};

export const ASSUMPTION_SCENARIO_LABELS: Record<string, string> = {
  BULL: 'Bull',
  BASE: 'Base',
  BEAR: 'Bear',
};

export const EVIDENCE_SOURCE_TYPE_LABELS: Record<string, string> = {
  TEN_K: '10-K',
  TEN_Q: '10-Q',
  EIGHT_K: '8-K',
  EARNINGS_CALL: 'Earnings Call',
  FINANCIAL_STATEMENT: 'Financial Statement',
  DCF: 'DCF Model',
  COMPS: 'Comps Model',
  HISTORICAL_VALIDATION: 'Historical Validation',
  RESEARCH_EVENT: 'Research Event',
};

export function formatConfidence(value: string | null): string {
  if (!value) return '—';
  return value.charAt(0) + value.slice(1).toLowerCase();
}
