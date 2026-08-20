import { describe, expect, it } from 'vitest';
import { resolveCostOfDebtStatusView } from './WaccPanel';

/**
 * Covers the production-readiness-audit fix: a saved company-level
 * cost-of-debt override (Company.costOfDebtOverride) must stay visible and
 * clearable in the WACC panel regardless of which "Cost of Debt Method" is
 * currently selected locally — previously the whole status/Clear block was
 * hidden the moment a user switched away from "User-Defined", even though
 * the persisted override was untouched.
 *
 * This is a plain function test, not a rendered-component test — this
 * codebase has no React Testing Library (or any `.test.tsx` file) anywhere,
 * so `resolveCostOfDebtStatusView` was extracted specifically to keep this
 * fix testable the same way every other piece of logic here is: a pure
 * function of its inputs, no DOM required.
 */
describe('resolveCostOfDebtStatusView', () => {
  // 1. Saved override + User-Defined, current value matches what's saved.
  it('shows the "saved-matches" status when User-Defined is selected and the typed value equals the saved override', () => {
    const view = resolveCostOfDebtStatusView('user', 0.065, 0.065);
    expect(view).toEqual({ visible: true, mode: 'saved-matches' });
  });

  // 1 (continued). Saved override + User-Defined, but exploring a different value.
  it('shows the "saved-diverged" status when User-Defined is selected and the typed value differs from the saved override', () => {
    const view = resolveCostOfDebtStatusView('user', 0.08, 0.065);
    expect(view).toEqual({ visible: true, mode: 'saved-diverged' });
  });

  // 2. The actual bug being fixed: a saved override must remain visible
  // (and clearable) even when the locally-selected method is "historical",
  // not just "user".
  it('shows the "saved-other-method" status when a saved override exists but the calculated/historical method is currently selected', () => {
    const view = resolveCostOfDebtStatusView('historical', 0.05, 0.065);
    expect(view).toEqual({ visible: true, mode: 'saved-other-method' });
  });

  it('is visible under "saved-other-method" regardless of whatever costOfDebtUser currently holds locally', () => {
    // costOfDebtUser is irrelevant here — the saved override's own value is
    // what's shown, not whatever the (currently inactive) manual field holds.
    const viewA = resolveCostOfDebtStatusView('historical', 0, 0.065);
    const viewB = resolveCostOfDebtStatusView('historical', 0.065, 0.065);
    expect(viewA).toEqual({ visible: true, mode: 'saved-other-method' });
    expect(viewB).toEqual({ visible: true, mode: 'saved-other-method' });
  });

  // 5. Existing no-saved-override behavior is unchanged.
  it('is not visible when historical/calculated is selected and there is no saved override — unchanged prior behavior', () => {
    const view = resolveCostOfDebtStatusView('historical', 0.05, null);
    expect(view).toEqual({ visible: false });
  });

  it('shows the "unsaved" status when User-Defined is selected and there is no saved override — unchanged prior behavior', () => {
    const view = resolveCostOfDebtStatusView('user', 0.05, null);
    expect(view).toEqual({ visible: true, mode: 'unsaved' });
  });
});
