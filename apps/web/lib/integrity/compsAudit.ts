import type { CompanyMultiples, CompanyValuationMetrics, CompsResult } from '@/lib/comps/types';
import type { IntegrityFinding } from './types';

/**
 * Milestone 14 spec section 11 — the comps audit. Milestone 6's own engine
 * already refuses to display a misleading multiple for a negative/zero
 * denominator (`Multiple.status: 'notMeaningful'`) — this module doesn't
 * reimplement that logic, it independently VERIFIES the invariant actually
 * held for a given result (defense in depth: "verify," never "trust,"
 * matching this milestone's whole reason for existing), and separately
 * checks peer-set completeness (spec section 5's "missing peer data").
 */

const MIN_PEER_COUNT = 3;

interface MultipleDenominatorCheck {
  label: string;
  denominator: number | null;
  multiple: { value: number | null; status: 'ok' | 'notMeaningful' | 'missingData' };
}

function auditMultipleIntegrity(ticker: string, checks: MultipleDenominatorCheck[]): IntegrityFinding[] {
  const findings: IntegrityFinding[] = [];
  for (const { label, denominator, multiple } of checks) {
    if (denominator !== null && denominator <= 0 && multiple.status === 'ok') {
      findings.push({
        check: `${label} integrity (${ticker})`,
        severity: 'CRITICAL',
        passed: false,
        message: `${ticker}'s ${label} is displayed as a meaningful value despite a non-positive denominator (${denominator.toLocaleString()}) — this should have been marked Not Meaningful.`,
      });
    }
  }
  return findings;
}

function multiplesChecks(metrics: CompanyValuationMetrics, multiples: CompanyMultiples): MultipleDenominatorCheck[] {
  return [
    { label: 'EV/Revenue', denominator: metrics.revenue, multiple: multiples.evToRevenue },
    { label: 'EV/EBITDA', denominator: metrics.ebitda, multiple: multiples.evToEbitda },
    { label: 'EV/EBIT', denominator: metrics.ebit, multiple: multiples.evToEbit },
    { label: 'P/E', denominator: metrics.netIncome, multiple: multiples.peRatio },
  ];
}

/** Lists which peers are missing which core comps inputs (spec section 5 —
 * "Missing peer data" — never silently dropped from the peer set, always
 * named). */
export function checkPeerDataCompleteness(peers: { metrics: CompanyValuationMetrics; excluded: boolean }[]): IntegrityFinding {
  const included = peers.filter((p) => !p.excluded);
  const missing = included
    .filter((p) => p.metrics.ebitda === null || p.metrics.ebit === null || p.metrics.revenue === null)
    .map((p) => p.metrics.ticker);

  if (missing.length === 0) {
    return { check: 'Peer data completeness', severity: 'INFO', passed: true, message: 'Every included peer has complete EBITDA/EBIT/revenue data.' };
  }
  return {
    check: 'Peer data completeness',
    severity: 'MEDIUM',
    passed: false,
    message: `${missing.length} peer(s) are missing core comps data and will show partial or Not Meaningful multiples: ${missing.join(', ')}.`,
  };
}

export function checkMinimumPeerCount(peers: { excluded: boolean }[], minimum: number = MIN_PEER_COUNT): IntegrityFinding {
  const includedCount = peers.filter((p) => !p.excluded).length;
  const passed = includedCount >= minimum;
  return {
    check: 'Minimum peer count',
    severity: passed ? 'INFO' : 'MEDIUM',
    passed,
    message: passed
      ? `${includedCount} peers included — sufficient for a reliable comps analysis.`
      : `Only ${includedCount} peer(s) included (minimum recommended: ${minimum}) — implied valuation from this peer set carries elevated uncertainty.`,
  };
}

export function auditComps(result: CompsResult): IntegrityFinding[] {
  const findings: IntegrityFinding[] = [];

  findings.push(...auditMultipleIntegrity(result.target.ticker, multiplesChecks(result.target, result.targetMultiples)));
  for (const peer of result.peers) {
    findings.push(...auditMultipleIntegrity(peer.metrics.ticker, multiplesChecks(peer.metrics, peer.multiples)));
  }

  findings.push(checkMinimumPeerCount(result.peers));
  findings.push(checkPeerDataCompleteness(result.peers));

  return findings;
}
