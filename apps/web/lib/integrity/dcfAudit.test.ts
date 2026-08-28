import { describe, expect, it } from 'vitest';
import { tag } from '@/lib/shared/tagged';
import type { DcfAssumptions, DcfMarketData, DcfResult } from '@/lib/valuation/types';
import { auditDcf, checkDcfOwnValidation, checkTerminalGrowthBelowWacc } from './dcfAudit';

function makeAssumptions(overrides: Partial<DcfAssumptions> = {}): DcfAssumptions {
  return {
    forecastYears: 5,
    revenue: { method: 'userGrowth', userGrowthRates: [0.08, 0.07, 0.06, 0.05, 0.04], fadeStartGrowth: 0.08, fadeEndGrowth: 0.04 },
    margin: { method: 'user', userMargin: 0.25, gradualStartMargin: 0.2, gradualEndMargin: 0.25 },
    tax: { method: 'user', userRate: 0.21 },
    da: { method: 'percentOfRevenue', percentOfRevenue: 0.03, flatAmount: 0 },
    capex: { method: 'percentOfRevenue', percentOfRevenue: 0.04, flatAmount: 0 },
    nwc: { method: 'percentOfRevenue', percentOfRevenue: 0.02, flatAmount: 0 },
    wacc: { riskFreeRate: 0.04, equityRiskPremium: 0.05, beta: 1.1, betaSource: 'estimate', costOfDebtMethod: 'user', costOfDebtUser: 0.05 },
    terminalValue: { method: 'perpetuityGrowth', perpetuityGrowthRate: 0.025, exitMultiple: 12 },
    ...overrides,
  };
}

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

function makeMarketData(overrides: Partial<DcfMarketData> = {}): DcfMarketData {
  return { currentSharePrice: 150, marketCapitalization: 1_500_000_000, totalDebt: 200_000_000, cash: 100_000_000, dilutedSharesOutstanding: 10_000_000, beta: 1.1, interestExpense: 10_000_000, ...overrides };
}

describe('checkTerminalGrowthBelowWacc', () => {
  it('passes when terminal growth is below WACC', () => {
    const finding = checkTerminalGrowthBelowWacc(makeAssumptions(), makeResult());
    expect(finding.passed).toBe(true);
    expect(finding.severity).toBe('INFO');
  });

  it('is a CRITICAL model error when terminal growth >= WACC', () => {
    const assumptions = makeAssumptions({ terminalValue: { method: 'perpetuityGrowth', perpetuityGrowthRate: 0.1, exitMultiple: 12 } });
    const result = makeResult({ wacc: { ...makeResult().wacc, wacc: tag(0.09, 'calculated') } });
    const finding = checkTerminalGrowthBelowWacc(assumptions, result);
    expect(finding.passed).toBe(false);
    expect(finding.severity).toBe('CRITICAL');
    expect(finding.message).toMatch(/CRITICAL MODEL ERROR/);
  });

  it('is not applicable when the terminal value method is exit-multiple', () => {
    const assumptions = makeAssumptions({ terminalValue: { method: 'exitMultiple', perpetuityGrowthRate: 0.5, exitMultiple: 12 } });
    const finding = checkTerminalGrowthBelowWacc(assumptions, makeResult());
    expect(finding.passed).toBe(true);
    expect(finding.severity).toBe('INFO');
  });
});

describe('checkDcfOwnValidation', () => {
  it('surfaces the DCF engine\'s own ERROR-severity issues as CRITICAL findings', () => {
    const result = makeResult({ isValid: false, issues: [{ severity: 'ERROR', field: 'wacc', message: 'WACC could not be computed.' }, { severity: 'WARNING', field: 'margin', message: 'Margin assumption unusually high.' }] });
    const findings = checkDcfOwnValidation(result);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe('CRITICAL');
  });

  it('the wacc field: passed:false, exact check string, and the original message preserved — when WACC is invalid', () => {
    const result = makeResult({
      isValid: false,
      wacc: { ...makeResult().wacc, wacc: tag(null, 'calculated') },
      issues: [{ severity: 'ERROR', field: 'wacc', message: 'Historical cost of debt is unavailable for this company (interest expense is not broken out in its recent filings) — select a manual cost-of-debt assumption to calculate WACC.' }],
    });
    const findings = checkDcfOwnValidation(result);
    const waccFinding = findings.find((f) => f.check === 'DCF validation: wacc');
    expect(waccFinding).toBeDefined();
    expect(waccFinding!.passed).toBe(false);
    expect(waccFinding!.message).toBe('Historical cost of debt is unavailable for this company (interest expense is not broken out in its recent filings) — select a manual cost-of-debt assumption to calculate WACC.');
  });

  it('the wacc field: passed:true with the exact check string — when WACC is valid and there is no wacc ERROR issue', () => {
    // makeResult()'s default wacc.wacc is tag(0.09, 'calculated') (non-null) and issues defaults to [] —
    // no ERROR issue for wacc, so this is the "WACC just became calculable" case this fix exists for.
    const findings = checkDcfOwnValidation(makeResult());
    const waccFinding = findings.find((f) => f.check === 'DCF validation: wacc');
    expect(waccFinding).toBeDefined();
    expect(waccFinding!.passed).toBe(true);
    expect(waccFinding!.severity).toBe('INFO');
    expect(waccFinding!.message).toMatch(/WACC is calculable/);
    expect(waccFinding!.message).toMatch(/9\.00%/);
    // Explicitly does not overclaim: confirms WACC resolves, not that every assumption is independently verified.
    expect(waccFinding!.message).toMatch(/not an independent verification/);
  });

  it('maps an analyst-assumption-required wacc issue to MEDIUM, not CRITICAL — a company whose filing just doesn\'t disclose interest expense is not "broken"', () => {
    const result = makeResult({
      isValid: false,
      wacc: { ...makeResult().wacc, wacc: tag(null, 'calculated') },
      issues: [{ severity: 'ERROR', field: 'wacc', message: 'Analyst assumption required — historical cost of debt is unavailable...', assumptionRequired: true }],
    });
    const findings = checkDcfOwnValidation(result);
    const waccFinding = findings.find((f) => f.check === 'DCF validation: wacc');
    expect(waccFinding?.passed).toBe(false);
    expect(waccFinding?.severity).toBe('MEDIUM');
  });

  it('still maps a genuine missing-input wacc issue (no assumptionRequired flag) to CRITICAL', () => {
    const result = makeResult({
      isValid: false,
      wacc: { ...makeResult().wacc, marketCapitalization: tag(null, 'actual'), wacc: tag(null, 'calculated') },
      issues: [{ severity: 'ERROR', field: 'wacc', message: 'WACC could not be calculated — market capitalization is unavailable.' }],
    });
    const findings = checkDcfOwnValidation(result);
    const waccFinding = findings.find((f) => f.check === 'DCF validation: wacc');
    expect(waccFinding?.passed).toBe(false);
    expect(waccFinding?.severity).toBe('CRITICAL');
  });

  it('never emits both a passing and a failing wacc finding at once', () => {
    const result = makeResult({ isValid: false, issues: [{ severity: 'ERROR', field: 'wacc', message: 'WACC must be positive.' }] });
    const findings = checkDcfOwnValidation(result).filter((f) => f.check === 'DCF validation: wacc');
    expect(findings).toHaveLength(1);
    expect(findings[0]!.passed).toBe(false);
  });

  it('does not fabricate a passing wacc finding when result.wacc.wacc.value is null but no ERROR issue was raised for it (defensive — should not occur in practice)', () => {
    const result = makeResult({ wacc: { ...makeResult().wacc, wacc: tag(null, 'calculated') }, issues: [] });
    const findings = checkDcfOwnValidation(result);
    expect(findings.find((f) => f.check === 'DCF validation: wacc')).toBeUndefined();
  });

  it('does not add a passing/failing finding for any other field — unrelated fields are unaffected', () => {
    const result = makeResult({ isValid: false, issues: [{ severity: 'ERROR', field: 'totalDebt', message: 'Total debt is unavailable.' }] });
    const findings = checkDcfOwnValidation(result);
    // The failing totalDebt finding, plus the new passing wacc finding (WACC itself is still valid here) — nothing else.
    expect(findings).toHaveLength(2);
    expect(findings.find((f) => f.check === 'DCF validation: totalDebt')?.passed).toBe(false);
    expect(findings.find((f) => f.check === 'DCF validation: wacc')?.passed).toBe(true);
  });

  it('returns only the passing wacc finding when there are no ERROR-severity issues and WACC is valid', () => {
    const findings = checkDcfOwnValidation(makeResult({ issues: [{ severity: 'WARNING', field: 'x', message: 'y' }] }));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.check).toBe('DCF validation: wacc');
    expect(findings[0]!.passed).toBe(true);
  });
});

describe('auditDcf', () => {
  it('passes every relationship check for an internally-consistent DCF', () => {
    const findings = auditDcf(makeAssumptions(), makeResult(), makeMarketData());
    expect(findings.every((f) => f.passed)).toBe(true);
  });

  it('flags a HIGH-severity finding when equity value does not equal EV + Cash - Debt', () => {
    const result = makeResult({ equityValue: 5_000_000_000 }); // should be 1,700M + 100M - 200M = 1,600M
    const findings = auditDcf(makeAssumptions(), result, makeMarketData());
    const equityFinding = findings.find((f) => f.check.startsWith('Equity value'));
    expect(equityFinding?.passed).toBe(false);
    expect(equityFinding?.severity).toBe('HIGH');
  });

  it('flags a HIGH-severity finding when implied share price does not equal Equity Value / Shares', () => {
    const result = makeResult({ impliedSharePrice: 999 });
    const findings = auditDcf(makeAssumptions(), result, makeMarketData());
    const priceFinding = findings.find((f) => f.check.startsWith('Implied share price'));
    expect(priceFinding?.passed).toBe(false);
  });

  it('includes the critical terminal-growth check in its output', () => {
    const assumptions = makeAssumptions({ terminalValue: { method: 'perpetuityGrowth', perpetuityGrowthRate: 0.12, exitMultiple: 12 } });
    const findings = auditDcf(assumptions, makeResult(), makeMarketData());
    const critical = findings.filter((f) => f.severity === 'CRITICAL');
    expect(critical.length).toBeGreaterThan(0);
  });
});
