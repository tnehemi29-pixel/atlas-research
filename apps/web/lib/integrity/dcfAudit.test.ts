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

  it('returns no findings when there are no ERROR-severity issues', () => {
    expect(checkDcfOwnValidation(makeResult({ issues: [{ severity: 'WARNING', field: 'x', message: 'y' }] }))).toHaveLength(0);
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
