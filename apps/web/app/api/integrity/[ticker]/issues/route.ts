import { NextResponse } from 'next/server';
import type { IntegrityDatasetType, IntegrityIssueCategory, IntegrityIssueSeverity, IntegrityIssueStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { listIntegrityIssues } from '@/lib/services/integrityIssueService';

export const dynamic = 'force-dynamic';

const VALID_STATUSES: IntegrityIssueStatus[] = ['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'IGNORED'];
const VALID_CATEGORIES: IntegrityIssueCategory[] = [
  'DATA_COMPLETENESS', 'DATA_FRESHNESS', 'DATA_DISCREPANCY', 'FINANCIAL_RECONCILIATION', 'MARKET_DATA_INTEGRITY',
  'DCF_MODEL_ERROR', 'DCF_STALE', 'COMPS_MODEL_ERROR', 'RESEARCH_REPORT_MISMATCH', 'AI_CLAIM_REJECTED',
  'RESEARCH_CONTRADICTION', 'THESIS_ASSUMPTION_CONFLICT', 'HISTORICAL_VALIDATION_LIMITATION', 'SOURCE_UNVERIFIED',
];
const VALID_SEVERITIES: IntegrityIssueSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const VALID_DATASET_TYPES: IntegrityDatasetType[] = [
  'MARKET_DATA', 'FINANCIAL_STATEMENTS', 'SEC_FILINGS', 'EARNINGS', 'DCF_MODEL', 'COMPS_MODEL', 'HISTORICAL_VALIDATION', 'RESEARCH_REPORT', 'INVESTMENT_CASE',
];

/** GET /api/integrity/[ticker]/issues?status=&category=&severity=&datasetType=
 * No auth required — company-scoped research data, same convention as
 * thesis-monitor/timeline. */
export async function GET(request: Request, { params }: { params: { ticker: string } }) {
  const company = await db.company.findUnique({ where: { ticker: params.ticker.trim().toUpperCase() } });
  if (!company) return NextResponse.json({ error: 'Company not found.' }, { status: 404 });

  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const category = url.searchParams.get('category');
  const severity = url.searchParams.get('severity');
  const datasetType = url.searchParams.get('datasetType');

  if (status && !VALID_STATUSES.includes(status as IntegrityIssueStatus)) return NextResponse.json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 });
  if (category && !VALID_CATEGORIES.includes(category as IntegrityIssueCategory)) return NextResponse.json({ error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` }, { status: 400 });
  if (severity && !VALID_SEVERITIES.includes(severity as IntegrityIssueSeverity)) return NextResponse.json({ error: `severity must be one of: ${VALID_SEVERITIES.join(', ')}` }, { status: 400 });
  if (datasetType && !VALID_DATASET_TYPES.includes(datasetType as IntegrityDatasetType)) return NextResponse.json({ error: `datasetType must be one of: ${VALID_DATASET_TYPES.join(', ')}` }, { status: 400 });

  const issues = await listIntegrityIssues(company.id, {
    status: status as IntegrityIssueStatus | undefined,
    category: category as IntegrityIssueCategory | undefined,
    severity: severity as IntegrityIssueSeverity | undefined,
    datasetType: datasetType as IntegrityDatasetType | undefined,
  });
  return NextResponse.json(issues);
}
