import { getFollowedCompanies } from '@/lib/services/followedCompaniesService';
import { listFilings } from '@/lib/services/secFilingService';
import { listEarningsCalls } from '@/lib/services/earningsCallService';
import { listReports, type ResearchReportContent } from '@/lib/services/researchReportService';
import { compareResearchReports } from '@/lib/research/compareReports';

/**
 * A unified, computed-on-demand research feed — "New SEC filing," "Earnings
 * call," "New/updated research report," "Valuation change," "Guidance
 * change," "Filing risk" — for every company across the user's watchlists
 * and portfolio. Deliberately NOT a persisted `ResearchFeedItem` table: no
 * background job/notification queue exists anywhere in this codebase
 * (documented as a known limitation since Milestone 7), and materializing
 * per-user feed rows would need exactly that kind of fan-out worker to stay
 * in sync. Computing the feed fresh from Milestones 7/8/9's own already-
 * stored data avoids inventing that infrastructure and avoids ever showing
 * a stale/duplicated feed row — the tradeoff (documented in the README) is
 * that this is O(followed companies) work per page load, acceptable at the
 * scale a single user's watchlists/portfolio actually reach.
 */

const MAX_FILING_ITEMS_PER_COMPANY = 2;
const MAX_CALL_ITEMS_PER_COMPANY = 1;
const VALUATION_CHANGE_THRESHOLD = 0.05; // 5% — below this, no feed item; avoids noise from rounding-level DCF drift

export type ResearchFeedItemType =
  | 'NEW_SEC_FILING'
  | 'NEW_EARNINGS_CALL'
  | 'NEW_RESEARCH_REPORT'
  | 'RESEARCH_REPORT_UPDATED'
  | 'VALUATION_CHANGE'
  | 'GUIDANCE_CHANGE'
  | 'FILING_RISK';

export interface ResearchFeedItem {
  id: string;
  type: ResearchFeedItemType;
  ticker: string;
  companyName: string;
  title: string;
  description: string;
  occurredAt: string;
  href: string;
}

export async function getResearchFeed(userId: string): Promise<ResearchFeedItem[]> {
  const companies = await getFollowedCompanies(userId);

  const perCompanyItems = await Promise.all(
    companies.map(async (company): Promise<ResearchFeedItem[]> => {
      const items: ResearchFeedItem[] = [];

      const [filings, calls, reports] = await Promise.all([
        listFilings(company.ticker).catch(() => []),
        listEarningsCalls(company.ticker).catch(() => []),
        listReports(company.ticker).catch(() => []),
      ]);

      for (const filing of filings.slice(0, MAX_FILING_ITEMS_PER_COMPANY)) {
        items.push({
          id: `filing-${filing.id}`,
          type: 'NEW_SEC_FILING',
          ticker: company.ticker,
          companyName: company.name,
          title: `${company.ticker}: New ${filing.formType} filed`,
          description: `Filed ${filing.filingDate.toISOString().slice(0, 10)}`,
          occurredAt: filing.filingDate.toISOString(),
          href: `/company/${company.ticker}/filings/${filing.id}`,
        });
      }

      for (const call of calls.slice(0, MAX_CALL_ITEMS_PER_COMPANY)) {
        if (!call.callDate) continue;
        items.push({
          id: `call-${call.id}`,
          type: 'NEW_EARNINGS_CALL',
          ticker: company.ticker,
          companyName: company.name,
          title: `${company.ticker}: Q${call.fiscalQuarter} ${call.fiscalYear} earnings call`,
          description: `Call date ${call.callDate.toISOString().slice(0, 10)}`,
          occurredAt: call.callDate.toISOString(),
          href: `/company/${company.ticker}/earnings/${call.id}`,
        });
      }

      const sortedReports = [...reports].filter((r) => r.status === 'SUCCESS').sort((a, b) => b.version - a.version);
      const latestReport = sortedReports[0];

      if (latestReport) {
        items.push({
          id: `report-${latestReport.id}`,
          type: latestReport.version === 1 ? 'NEW_RESEARCH_REPORT' : 'RESEARCH_REPORT_UPDATED',
          ticker: company.ticker,
          companyName: company.name,
          title: latestReport.version === 1 ? `${company.ticker}: Research report generated` : `${company.ticker}: Research report updated to v${latestReport.version}`,
          description: `Version ${latestReport.version}`,
          occurredAt: latestReport.createdAt.toISOString(),
          href: `/company/${company.ticker}/report`,
        });

        const previousReport = sortedReports.find((r) => r.version === latestReport.version - 1);
        if (previousReport) {
          const diff = compareResearchReports(
            { version: latestReport.version, content: latestReport.content as unknown as ResearchReportContent },
            { version: previousReport.version, content: previousReport.content as unknown as ResearchReportContent },
          );

          const pct = diff.dcfImpliedPriceChange.percentChange;
          if (pct !== null && Math.abs(pct) >= VALUATION_CHANGE_THRESHOLD) {
            const direction = pct >= 0 ? '+' : '';
            items.push({
              id: `valuation-${latestReport.id}`,
              type: 'VALUATION_CHANGE',
              ticker: company.ticker,
              companyName: company.name,
              title: `${company.ticker}: DCF implied price moved ${direction}${(pct * 100).toFixed(1)}%`,
              description: `From $${diff.dcfImpliedPriceChange.previous?.toFixed(2) ?? '—'} to $${diff.dcfImpliedPriceChange.current?.toFixed(2) ?? '—'} between report versions ${previousReport.version} and ${latestReport.version}.`,
              occurredAt: latestReport.createdAt.toISOString(),
              href: `/company/${company.ticker}/report`,
            });
          }

          if (diff.guidanceChanges.length > 0) {
            items.push({
              id: `guidance-${latestReport.id}`,
              type: 'GUIDANCE_CHANGE',
              ticker: company.ticker,
              companyName: company.name,
              title: `${company.ticker}: Guidance changed`,
              description: diff.guidanceChanges.map((g) => `${g.metricLabel} (${g.period}): ${g.currentChange.toLowerCase()}`).join('; '),
              occurredAt: latestReport.createdAt.toISOString(),
              href: `/company/${company.ticker}/report`,
            });
          }
        }

        const content = latestReport.content as unknown as ResearchReportContent;
        const newRiskInsights = content.report?.sec_analysis.insights.filter((i) => i.category === 'new_risk') ?? [];
        for (const risk of newRiskInsights.slice(0, 2)) {
          items.push({
            id: `risk-${latestReport.id}-${risk.description.slice(0, 24)}`,
            type: 'FILING_RISK',
            ticker: company.ticker,
            companyName: company.name,
            title: `${company.ticker}: New risk flagged in filing analysis`,
            description: risk.description,
            occurredAt: latestReport.createdAt.toISOString(),
            href: `/company/${company.ticker}/report`,
          });
        }
      }

      return items;
    }),
  );

  return perCompanyItems.flat().sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}
