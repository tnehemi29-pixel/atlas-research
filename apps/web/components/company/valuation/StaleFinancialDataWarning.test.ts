import { describe, expect, it } from 'vitest';
import { buildStaleWarningMessage, StaleFinancialDataWarning } from './StaleFinancialDataWarning';

/**
 * StaleFinancialDataWarning's null-return guard is tested by calling the
 * component directly as a plain function — valid, since a function
 * component is just a function — but only for the `stale: false` path,
 * which returns `null` before ever constructing JSX. The `stale: true` path
 * is deliberately not exercised this way: it returns real JSX, which needs
 * a JSX runtime this codebase's plain `.test.ts` files aren't configured
 * for (no React Testing Library here — see WaccPanel.test.ts). The content
 * that path renders is exactly buildStaleWarningMessage's output, tested
 * directly below.
 */

/**
 * Covers the launch-readiness gap found while investigating financialData
 * ingestion batching: getFinancials() can return `stale: true` for a
 * first-time ingestion that only partially completed before failing (some
 * batches committed, a later one didn't), but no valuation UI surface read
 * that flag — a DCF could render from an incomplete history with no visible
 * warning. This is a plain function test, not a rendered-component test —
 * this codebase has no React Testing Library, so `buildStaleWarningMessage`
 * was extracted specifically to keep this testable the same way every other
 * piece of UI logic here is (see WaccPanel.tsx's resolveCostOfDebtStatusView
 * for the established convention).
 */
describe('buildStaleWarningMessage', () => {
  it('includes a formatted "as of" date when dataAsOf is known', () => {
    const message = buildStaleWarningMessage('2026-08-01T12:00:00.000Z');
    expect(message).toMatch(/did not finish successfully/);
    expect(message).toMatch(/some historical periods are still missing/);
    expect(message).not.toBe('');
  });

  it('degrades gracefully to "unknown" when dataAsOf is null (never successfully synced at all)', () => {
    const message = buildStaleWarningMessage(null);
    expect(message).toMatch(/unknown/);
  });
});

describe('StaleFinancialDataWarning', () => {
  it('renders nothing when stale is false — the normal, unaffected path', () => {
    const element = StaleFinancialDataWarning({ stale: false, dataAsOf: '2026-08-01T12:00:00.000Z' });
    expect(element).toBeNull();
  });

  it('renders nothing even if dataAsOf is null, as long as stale is false', () => {
    const element = StaleFinancialDataWarning({ stale: false, dataAsOf: null });
    expect(element).toBeNull();
  });
});
