/**
 * The one finding shape every audit module in lib/integrity/ returns —
 * dcfAudit, compsAudit, thesisIntegrityAudit, historicalValidationAudit —
 * so lib/services/modelAuditService.ts and the company integrity panel
 * consume a single, consistent vocabulary rather than a different shape
 * per check type.
 */

export type IntegrityFindingSeverity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface IntegrityFinding {
  check: string;
  severity: IntegrityFindingSeverity;
  passed: boolean;
  message: string;
}
