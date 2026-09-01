import { describe, expect, it } from 'vitest';
import { tag } from '@/lib/shared/tagged';
import type { DcfResult } from '@/lib/valuation/types';
import { resolveModelStatusView } from './ValuationHeader';

/**
 * Covers a real, evidence-based inconsistency found during launch-hardening:
 * the "Model Status" badge showed the same alarming red "N blocking
 * issue(s)" for a genuinely broken input (no market cap, no total debt) and
 * for the one case where the model just needs an analyst-supplied
 * assumption (ValidationIssue.assumptionRequired) — while ValidationIssues.tsx
 * right below it already presents that second case with calmer, blue
 * "Analyst input needed" styling. Same fact, two contradictory tones on one
 * page. This is a plain function test, not a rendered-component test — see
 * WaccPanel.test.ts for why (no React Testing Library in this codebase).
 */
function makeResult(overrides: Partial<DcfResult> = {}): DcfResult {
  return {
    historicals: [],
    forecast: [],
    wacc: {
      riskFreeRate: tag(0.04, 'actual'),
      equityRiskPremium: tag(0.05, 'estimate'),
      beta: tag(1.1, 'estimate'),
      costOfEquity: tag(0.095, 'calculated'),
      preTaxCostOfDebt: tag(0.05, 'user'),
      effectiveTaxRate: tag(0.21, 'user'),
      afterTaxCostOfDebt: tag(0.0395, 'calculated'),
      marketCapitalization: tag(1_500_000_000, 'actual'),
      totalDebt: tag(200_000_000, 'actual'),
      equityWeight: tag(0.88, 'calculated'),
      debtWeight: tag(0.12, 'calculated'),
      wacc: tag(0.09, 'calculated'),
    },
    terminalValue: { method: 'perpetuityGrowth', undiscountedValue: 2_000_000_000, presentValue: 1_300_000_000, impliedExitMultiple: 12, impliedPerpetuityGrowth: null },
    pvOfForecastFcf: 400_000_000,
    enterpriseValue: 1_700_000_000,
    equityValue: 1_600_000_000,
    impliedSharePrice: 160,
    currentSharePrice: 150,
    upsideDownside: 0.0667,
    issues: [],
    isValid: true,
    ...overrides,
  };
}

describe('resolveModelStatusView', () => {
  it('is "Valid" (emerald) when the model is valid', () => {
    const view = resolveModelStatusView(makeResult({ isValid: true, issues: [] }));
    expect(view).toEqual({ label: 'Valid', tone: 'valid' });
  });

  it('is "Needs analyst input" (blue, not red) when every ERROR issue is an analyst-assumption gap — the NVDA/MSFT/GOOGL scenario', () => {
    const view = resolveModelStatusView(
      makeResult({
        isValid: false,
        issues: [
          {
            severity: 'ERROR',
            field: 'wacc',
            message: 'Analyst assumption required — historical cost of debt is unavailable...',
            assumptionRequired: true,
          },
        ],
      }),
    );
    expect(view).toEqual({ label: 'Needs analyst input', tone: 'needs-input' });
  });

  it('is "N blocking issue(s)" (red) when a genuine, non-assumption ERROR exists', () => {
    const view = resolveModelStatusView(
      makeResult({
        isValid: false,
        issues: [{ severity: 'ERROR', field: 'marketCapitalization', message: 'WACC could not be calculated — market capitalization is unavailable.' }],
      }),
    );
    expect(view).toEqual({ label: '1 blocking issue(s)', tone: 'blocking' });
  });

  it('is "N blocking issue(s)" (red), not "Needs analyst input", when a genuine error and an assumption gap occur together', () => {
    const view = resolveModelStatusView(
      makeResult({
        isValid: false,
        issues: [
          { severity: 'ERROR', field: 'totalDebt', message: 'Total debt is unavailable.' },
          { severity: 'ERROR', field: 'wacc', message: 'Analyst assumption required...', assumptionRequired: true },
        ],
      }),
    );
    expect(view).toEqual({ label: '2 blocking issue(s)', tone: 'blocking' });
  });

  it('counts only ERROR-severity issues, never WARNINGs, in the blocking count', () => {
    const view = resolveModelStatusView(
      makeResult({
        isValid: false,
        issues: [
          { severity: 'WARNING', field: 'currentSharePrice', message: 'Current share price is unavailable.' },
          { severity: 'ERROR', field: 'totalDebt', message: 'Total debt is unavailable.' },
        ],
      }),
    );
    expect(view).toEqual({ label: '1 blocking issue(s)', tone: 'blocking' });
  });
});
