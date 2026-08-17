import type { IntegrityFinding } from './types';

/**
 * Milestone 14 spec section 17 — historical validation integrity,
 * integrating with Milestone 12. This module never re-implements Milestone
 * 12's own no-look-ahead protection (`lib/backtest/pointInTimeValuation.ts`'s
 * `filterPeriodsAsOf`) — that guarantee is verified directly by reusing that
 * exact function in this module's own test file, proving the guarantee
 * still holds rather than re-deriving it. What this module DOES add is a
 * structural "honesty" check on a historical-validation RESULT: is the
 * sample size disclosed, is a benchmark recorded, is methodology/limitations
 * text actually present — so a historical test is never silently presented
 * as more conclusive than the data can support (spec: "Never present a
 * historical test as bias-free when the data cannot support that claim").
 */

export interface HistoricalValidationDisclosureInput {
  sampleSize: number;
  benchmarkTicker?: string | null;
  methodology: string[];
  wasCapped?: boolean;
}

const MIN_SAMPLE_SIZE_FOR_CONFIDENCE = 5;

export function auditHistoricalValidationDisclosure(input: HistoricalValidationDisclosureInput): IntegrityFinding[] {
  const findings: IntegrityFinding[] = [];

  if (input.sampleSize === 0) {
    findings.push({ check: 'Historical validation sample size', severity: 'LOW', passed: true, message: 'No historical observations are available yet — correctly shown as unavailable rather than a fabricated result.' });
  } else if (input.sampleSize < MIN_SAMPLE_SIZE_FOR_CONFIDENCE) {
    findings.push({
      check: 'Historical validation sample size',
      severity: 'LOW',
      passed: true,
      message: `Only ${input.sampleSize} historical observation(s) — below the ${MIN_SAMPLE_SIZE_FOR_CONFIDENCE}-observation threshold Atlas itself uses before showing a confidence interval; treat this result as directional, not statistically conclusive.`,
    });
  } else {
    findings.push({ check: 'Historical validation sample size', severity: 'INFO', passed: true, message: `${input.sampleSize} historical observations — sample size disclosed.` });
  }

  if (input.methodology.length === 0) {
    findings.push({ check: 'Historical validation methodology disclosure', severity: 'MEDIUM', passed: false, message: 'No methodology or limitations text is attached to this historical validation result.' });
  } else {
    findings.push({ check: 'Historical validation methodology disclosure', severity: 'INFO', passed: true, message: 'Methodology and limitations are disclosed alongside the result.' });
  }

  if (input.benchmarkTicker !== undefined) {
    findings.push(
      input.benchmarkTicker
        ? { check: 'Historical validation benchmark disclosure', severity: 'INFO', passed: true, message: `Benchmark (${input.benchmarkTicker}) is recorded for this comparison.` }
        : { check: 'Historical validation benchmark disclosure', severity: 'LOW', passed: false, message: 'No benchmark ticker is recorded for this comparison.' },
    );
  }

  if (input.wasCapped) {
    findings.push({ check: 'Historical validation sampling cap', severity: 'INFO', passed: true, message: 'This result was capped to bound computation cost, and is honestly flagged as capped rather than silently truncated.' });
  }

  return findings;
}
