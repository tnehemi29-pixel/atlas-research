/** Mirrors the Prisma ResearchEventType enum (Milestone 11) — kept as a
 * plain client-safe list rather than importing @prisma/client into a
 * component. */
export const RESEARCH_EVENT_TYPES: { value: string; label: string }[] = [
  { value: 'NEW_FILING', label: 'New Filing' },
  { value: 'FINANCIAL_CHANGE', label: 'Financial Change' },
  { value: 'MARGIN_CHANGE', label: 'Margin Change' },
  { value: 'GUIDANCE_CHANGE', label: 'Guidance Change' },
  { value: 'DCF_VALUATION_CHANGE', label: 'DCF Valuation Change' },
  { value: 'COMPS_VALUATION_CHANGE', label: 'Comps Valuation Change' },
  { value: 'NEW_RESEARCH_REPORT', label: 'New Research Report' },
  { value: 'RESEARCH_REPORT_UPDATED', label: 'Research Report Updated' },
  { value: 'NEW_RISK', label: 'New Risk' },
  { value: 'CORPORATE_EVENT', label: 'Corporate Event' },
  { value: 'EARNINGS_CALL', label: 'Earnings Call' },
];
