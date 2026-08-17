/**
 * Milestone 15 spec section 10 — the research-review checklist, seeded
 * verbatim onto every new ResearchReview (lib/services/researchReviewService.ts's
 * submitForReview()). Kept as one ordered, literal list rather than a
 * configurable table — the spec gives an exact ten-item list, and every
 * approval must clear all ten (spec: "Before approval, verify: [ ] ...").
 *
 * The 8th item is the direct connection to Milestone 14 the spec asks for:
 * a reviewer checking it off is expected to have actually looked at the
 * report's company's /company/[ticker] Research Integrity panel first — the
 * checklist item itself never re-derives or re-displays that status; the UI
 * links out to the real panel instead of duplicating Milestone 14's logic.
 */
export const REVIEW_CHECKLIST_TEMPLATE: readonly string[] = [
  'Financial data is current',
  'Sources are cited',
  'DCF is validated',
  'Comparable companies are valid',
  'Major risks are identified',
  'Catalysts are supported',
  'Historical validation limitations are disclosed',
  'Research integrity status reviewed',
  'Thesis assumptions are documented',
  'Contradicting evidence is addressed',
];

export interface ChecklistItemLike {
  checked: boolean;
}

/** A report can only be approved once every checklist item is checked —
 * enforced here as one pure, testable predicate rather than scattered
 * `.every()` calls at each call site. */
export function isChecklistComplete(items: readonly ChecklistItemLike[]): boolean {
  return items.length > 0 && items.every((item) => item.checked);
}
