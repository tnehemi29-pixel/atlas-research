import type { AlertType, ResearchAlert } from '@prisma/client';
import { db } from '@/lib/db';
import { getFollowedCompanies, type FollowedCompany } from '@/lib/services/followedCompaniesService';
import { listFilings } from '@/lib/services/secFilingService';
import { listEarningsCalls } from '@/lib/services/earningsCallService';
import { listReports, type ResearchReportContent } from '@/lib/services/researchReportService';
import { compareResearchReports } from '@/lib/research/compareReports';
import { getCompanyTimeline, type CompanyTimelineEvent } from '@/lib/services/researchEventFeedService';
import { materialityAtLeast } from '@/lib/researchEvents/materialityConfig';
import { listInvestmentCases } from '@/lib/services/investmentCaseService';
import { auditInvestmentCaseThesis } from '@/lib/services/thesisIntegrityService';

/**
 * Research alerts — explicitly NOT price/trading alerts (the schema's
 * AlertType enum has no room for one). No background job queue exists in
 * this codebase (same documented limitation as Milestones 7-10's other
 * monitoring features), so an alert is not "pushed" anywhere — it's
 * configuration that gets deterministically re-evaluated against current
 * data every time `evaluateAlerts` is called (visiting /alerts, or GET
 * /api/alerts), and the result of that evaluation is what's persisted.
 */

const NEW_FILING_WINDOW_DAYS = 14;
const EARNINGS_AVAILABLE_WINDOW_DAYS = 14;
const REPORT_UPDATED_WINDOW_DAYS = 14;
const RESEARCH_EVENT_WINDOW_DAYS = 14;
const DEFAULT_VALUATION_THRESHOLD_PERCENT = 10;

function withinWindow(isoDate: string, windowDays: number): boolean {
  return Date.now() - new Date(isoDate).getTime() < windowDays * 24 * 60 * 60 * 1000;
}

function findRecentEvent(timeline: CompanyTimelineEvent[], predicate: (e: CompanyTimelineEvent) => boolean): CompanyTimelineEvent | undefined {
  return timeline.find((e) => predicate(e) && withinWindow(e.eventDate, RESEARCH_EVENT_WINDOW_DAYS));
}

export class AlertNotFoundError extends Error {
  constructor(message = 'Alert not found.') {
    super(message);
    this.name = 'AlertNotFoundError';
  }
}

export class InvalidAlertInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAlertInputError';
  }
}

async function getOwnedAlert(userId: string, alertId: string): Promise<ResearchAlert> {
  const alert = await db.researchAlert.findUnique({ where: { id: alertId } });
  if (!alert || alert.userId !== userId) throw new AlertNotFoundError();
  return alert;
}

export async function listAlerts(userId: string) {
  return db.researchAlert.findMany({ where: { userId }, include: { company: true }, orderBy: { createdAt: 'asc' } });
}

export interface CreateAlertInput {
  type: AlertType;
  companyId?: string | null;
  thresholdPercent?: number | null;
}

export async function createAlert(userId: string, input: CreateAlertInput): Promise<ResearchAlert> {
  if (input.companyId) {
    const company = await db.company.findUnique({ where: { id: input.companyId } });
    if (!company) throw new InvalidAlertInputError('No company found for the given companyId.');
  }

  if (input.type === 'DCF_VALUATION_CHANGE' && input.thresholdPercent !== undefined && input.thresholdPercent !== null) {
    if (!Number.isFinite(input.thresholdPercent) || input.thresholdPercent <= 0) {
      throw new InvalidAlertInputError('thresholdPercent must be a positive number.');
    }
  }

  return db.researchAlert.create({
    data: {
      userId,
      type: input.type,
      companyId: input.companyId ?? null,
      thresholdPercent: input.type === 'DCF_VALUATION_CHANGE' ? (input.thresholdPercent ?? DEFAULT_VALUATION_THRESHOLD_PERCENT) : null,
    },
  });
}

export async function setAlertActive(userId: string, alertId: string, isActive: boolean): Promise<ResearchAlert> {
  await getOwnedAlert(userId, alertId);
  return db.researchAlert.update({ where: { id: alertId }, data: { isActive } });
}

export async function deleteAlert(userId: string, alertId: string): Promise<void> {
  await getOwnedAlert(userId, alertId);
  await db.researchAlert.delete({ where: { id: alertId } });
}

// ---------------------------------------------------------------------------
// Evaluation — deterministic, on-demand
// ---------------------------------------------------------------------------

async function evaluateOne(alert: ResearchAlert, scopeCompanies: FollowedCompany[]): Promise<{ triggered: boolean; summary: string | null }> {
  const companies = alert.companyId ? scopeCompanies.filter((c) => c.id === alert.companyId) : scopeCompanies;
  if (companies.length === 0) return { triggered: false, summary: null };

  switch (alert.type) {
    case 'NEW_SEC_FILING': {
      for (const company of companies) {
        const filings = await listFilings(company.ticker).catch(() => []);
        const latest = filings[0];
        if (latest && Date.now() - latest.filingDate.getTime() < NEW_FILING_WINDOW_DAYS * 24 * 60 * 60 * 1000) {
          return { triggered: true, summary: `${company.ticker}: new ${latest.formType} filed ${latest.filingDate.toISOString().slice(0, 10)}.` };
        }
      }
      return { triggered: false, summary: null };
    }

    case 'EARNINGS_AVAILABLE': {
      for (const company of companies) {
        const calls = await listEarningsCalls(company.ticker).catch(() => []);
        const latest = calls[0];
        if (latest?.callDate && Date.now() - latest.callDate.getTime() < EARNINGS_AVAILABLE_WINDOW_DAYS * 24 * 60 * 60 * 1000) {
          return { triggered: true, summary: `${company.ticker}: Q${latest.fiscalQuarter} ${latest.fiscalYear} call available (${latest.callDate.toISOString().slice(0, 10)}).` };
        }
      }
      return { triggered: false, summary: null };
    }

    case 'RESEARCH_REPORT_UPDATED': {
      for (const company of companies) {
        const reports = await listReports(company.ticker).catch(() => []);
        const latest = reports.filter((r) => r.status === 'SUCCESS').sort((a, b) => b.version - a.version)[0];
        if (latest && latest.version > 1 && Date.now() - latest.createdAt.getTime() < REPORT_UPDATED_WINDOW_DAYS * 24 * 60 * 60 * 1000) {
          return { triggered: true, summary: `${company.ticker}: research report updated to version ${latest.version}.` };
        }
      }
      return { triggered: false, summary: null };
    }

    case 'DCF_VALUATION_CHANGE':
    case 'GUIDANCE_CHANGED': {
      for (const company of companies) {
        const reports = await listReports(company.ticker).catch(() => []);
        const sorted = reports.filter((r) => r.status === 'SUCCESS').sort((a, b) => b.version - a.version);
        const [latest, previous] = sorted;
        if (!latest || !previous) continue;

        const diff = compareResearchReports(
          { version: latest.version, content: latest.content as unknown as ResearchReportContent },
          { version: previous.version, content: previous.content as unknown as ResearchReportContent },
        );

        if (alert.type === 'DCF_VALUATION_CHANGE') {
          const thresholdRatio = (alert.thresholdPercent ?? DEFAULT_VALUATION_THRESHOLD_PERCENT) / 100;
          const pct = diff.dcfImpliedPriceChange.percentChange;
          if (pct !== null && Math.abs(pct) >= thresholdRatio) {
            const direction = pct >= 0 ? '+' : '';
            return { triggered: true, summary: `${company.ticker}: DCF implied price moved ${direction}${(pct * 100).toFixed(1)}% (threshold ${alert.thresholdPercent ?? DEFAULT_VALUATION_THRESHOLD_PERCENT}%).` };
          }
        } else if (diff.guidanceChanges.length > 0) {
          return { triggered: true, summary: `${company.ticker}: guidance changed for ${diff.guidanceChanges.map((g) => g.metricLabel).join(', ')}.` };
        }
      }
      return { triggered: false, summary: null };
    }

    // Milestone 11 — reuses lib/services/researchEventFeedService.ts's own
    // getCompanyTimeline (same TTL-gated lazy detection-on-view every other
    // M11 read path uses), never a second detection pipeline. Materiality
    // filtering already happened in researchEventDetectionService.ts, so
    // "do not spam users with every minor filing" holds here for free —
    // these three types only ever look at events that already cleared
    // HIGH/CRITICAL or are a specifically-typed NEW_RISK event.
    case 'HIGH_IMPORTANCE_RESEARCH_EVENT': {
      for (const company of companies) {
        const timeline = await getCompanyTimeline(company.ticker).catch(() => []);
        const recent = findRecentEvent(timeline, (e) => materialityAtLeast(e.materiality, 'HIGH'));
        if (recent) return { triggered: true, summary: `${company.ticker}: ${recent.title} (${recent.materiality}).` };
      }
      return { triggered: false, summary: null };
    }

    case 'CRITICAL_RESEARCH_EVENT': {
      for (const company of companies) {
        const timeline = await getCompanyTimeline(company.ticker).catch(() => []);
        const recent = findRecentEvent(timeline, (e) => e.materiality === 'CRITICAL');
        if (recent) return { triggered: true, summary: `${company.ticker}: ${recent.title} (CRITICAL).` };
      }
      return { triggered: false, summary: null };
    }

    case 'NEW_MATERIAL_RISK': {
      for (const company of companies) {
        const timeline = await getCompanyTimeline(company.ticker).catch(() => []);
        const recent = findRecentEvent(timeline, (e) => e.type === 'NEW_RISK');
        if (recent) return { triggered: true, summary: `${company.ticker}: ${recent.description}` };
      }
      return { triggered: false, summary: null };
    }

    // Milestone 14 — deliberately narrow: only CRITICAL-severity issues ever
    // alert (spec section 25: "Do not alert for every minor issue"). Reads
    // whatever ResearchIntegrityIssue rows already exist from the last time
    // an integrity snapshot was computed for the company — this never
    // triggers a fresh audit run itself, matching every other alert type's
    // "evaluate against already-known state" discipline.
    case 'CRITICAL_INTEGRITY_ISSUE': {
      for (const company of companies) {
        const issue = await db.researchIntegrityIssue.findFirst({
          where: { companyId: company.id, severity: 'CRITICAL', status: { in: ['OPEN', 'ACKNOWLEDGED'] } },
          orderBy: { detectedAt: 'desc' },
        });
        if (issue) return { triggered: true, summary: `${company.ticker}: CRITICAL — ${issue.description}` };
      }
      return { triggered: false, summary: null };
    }

    case 'RESEARCH_DATA_MISMATCH': {
      for (const company of companies) {
        const issue = await db.researchIntegrityIssue.findFirst({
          where: {
            companyId: company.id,
            category: { in: ['DATA_DISCREPANCY', 'FINANCIAL_RECONCILIATION', 'MARKET_DATA_INTEGRITY', 'RESEARCH_REPORT_MISMATCH', 'AI_CLAIM_REJECTED'] },
            severity: { in: ['HIGH', 'CRITICAL'] },
            status: { in: ['OPEN', 'ACKNOWLEDGED'] },
          },
          orderBy: { detectedAt: 'desc' },
        });
        if (issue) return { triggered: true, summary: `${company.ticker}: ${issue.description}` };
      }
      return { triggered: false, summary: null };
    }

    case 'DCF_MODEL_ERROR': {
      for (const company of companies) {
        const issue = await db.researchIntegrityIssue.findFirst({
          where: { companyId: company.id, category: 'DCF_MODEL_ERROR', severity: { in: ['HIGH', 'CRITICAL'] }, status: { in: ['OPEN', 'ACKNOWLEDGED'] } },
          orderBy: { detectedAt: 'desc' },
        });
        if (issue) return { triggered: true, summary: `${company.ticker}: ${issue.description}` };
      }
      return { triggered: false, summary: null };
    }

    // Deliberately different from the other Milestone 14 alert types: an
    // Investment Case is private per-user data (Milestone 13), so this
    // evaluates the alert-owning user's OWN cases via the same
    // ownership-checked auditInvestmentCaseThesis() a user would call
    // themselves — never another user's thesis, and never the shared/global
    // ResearchIntegrityIssue table.
    case 'THESIS_ASSUMPTION_CONFLICT': {
      const companyIds = new Set(companies.map((c) => c.id));
      const cases = await listInvestmentCases(alert.userId).catch(() => []);
      for (const investmentCase of cases) {
        if (!companyIds.has(investmentCase.companyId)) continue;
        const findings = await auditInvestmentCaseThesis(alert.userId, investmentCase.id).catch(() => []);
        const conflict = findings.find((f) => !f.passed);
        if (conflict) return { triggered: true, summary: `${investmentCase.company.ticker}: ${conflict.message}` };
      }
      return { triggered: false, summary: null };
    }

    default:
      return { triggered: false, summary: null };
  }
}

/** Re-evaluates every active alert for the user against current data and
 * persists the result — never marks a company outside the user's own
 * watchlists/portfolio as the trigger source, since `scopeCompanies` is
 * always this user's own getFollowedCompanies() result. */
export async function evaluateAlerts(userId: string) {
  const alerts = await listAlerts(userId);
  const scopeCompanies = await getFollowedCompanies(userId);

  return Promise.all(
    alerts.map(async (alert) => {
      if (!alert.isActive) return alert;

      const { triggered, summary } = await evaluateOne(alert, scopeCompanies);
      return db.researchAlert.update({
        where: { id: alert.id },
        data: {
          lastCheckedAt: new Date(),
          ...(triggered ? { lastTriggeredAt: new Date(), lastTriggeredSummary: summary } : {}),
        },
        include: { company: true },
      });
    }),
  );
}
