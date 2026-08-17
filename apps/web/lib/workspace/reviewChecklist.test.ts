import { describe, expect, it } from 'vitest';
import { isChecklistComplete, REVIEW_CHECKLIST_TEMPLATE } from './reviewChecklist';

describe('reviewChecklist', () => {
  it('has exactly the ten items the spec lists, in order', () => {
    expect(REVIEW_CHECKLIST_TEMPLATE).toEqual([
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
    ]);
  });

  it('isChecklistComplete is false when any item is unchecked', () => {
    const items = REVIEW_CHECKLIST_TEMPLATE.map((_, i) => ({ checked: i !== 3 }));
    expect(isChecklistComplete(items)).toBe(false);
  });

  it('isChecklistComplete is true only when every item is checked', () => {
    const items = REVIEW_CHECKLIST_TEMPLATE.map(() => ({ checked: true }));
    expect(isChecklistComplete(items)).toBe(true);
  });

  it('isChecklistComplete is false for an empty list - never vacuously true', () => {
    expect(isChecklistComplete([])).toBe(false);
  });
});
