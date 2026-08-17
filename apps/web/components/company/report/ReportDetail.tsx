import type { ResearchReportResponse } from '@/lib/api/reports';
import { ReportSourcesProvider } from './reportSourcesContext';
import { ReportHeader } from './ReportHeader';
import { ExecutiveSummarySection } from './ExecutiveSummarySection';
import { CompanyOverviewSection } from './CompanyOverviewSection';
import { FinancialPerformanceSection } from './FinancialPerformanceSection';
import { GrowthAnalysisSection } from './GrowthAnalysisSection';
import { ValuationSection } from './ValuationSection';
import { DcfAnalysisSection } from './DcfAnalysisSection';
import { CompsAnalysisSection } from './CompsAnalysisSection';
import { ScenarioAnalysisSection } from './ScenarioAnalysisSection';
import { SecInsightsSection } from './SecInsightsSection';
import { EarningsInsightsSection } from './EarningsInsightsSection';
import { CatalystsSection } from './CatalystsSection';
import { RisksSection } from './RisksSection';
import { ManagementCapitalAllocationSection } from './ManagementCapitalAllocationSection';
import { ConclusionSection } from './ConclusionSection';
import { KeyMetricsSection } from './KeyMetricsSection';
import { SourcesSection } from './SourcesSection';
import { MethodologyNote } from './MethodologyNote';

/** Assembles the 16 sections the milestone spec calls for, in the spec's own
 * order, wrapped in ReportSourcesProvider so every SourceCitation chip below
 * can resolve an id back to its ResearchSource without prop-drilling. */
export function ReportDetail({ report }: { report: ResearchReportResponse }) {
  const { context, report: payload } = report.content;
  if (!payload) return null; // SUCCESS reports always have a payload — guarded for type-safety only

  return (
    <ReportSourcesProvider sources={context.sources}>
      <ReportHeader report={report} />
      <div className="space-y-4">
        <ExecutiveSummarySection data={payload.executive_summary} />
        <CompanyOverviewSection overview={context.companyOverview} narrative={payload.company_overview_narrative} />
        <FinancialPerformanceSection performance={context.financialPerformance} narrative={payload.financial_analysis_narrative} />
        <GrowthAnalysisSection drivers={payload.growth_analysis.drivers} />
        <ValuationSection context={context} narrative={payload.valuation_commentary} />
        <DcfAnalysisSection dcf={context.dcfAnalysis} narrative={payload.dcf_commentary} />
        <CompsAnalysisSection comps={context.compsAnalysis} narrative={payload.comps_commentary} />
        <SecInsightsSection sec={context.secFilingContext} insights={payload.sec_analysis.insights} ticker={context.ticker} />
        <EarningsInsightsSection earnings={context.earningsContext} insights={payload.earnings_analysis.insights} ticker={context.ticker} />
        <CatalystsSection catalysts={payload.catalysts} />
        <RisksSection risks={payload.risks} />
        <ManagementCapitalAllocationSection data={payload.management_capital_allocation} />
        <ScenarioAnalysisSection dcf={context.dcfAnalysis} narrative={payload.scenario_commentary} />
        <KeyMetricsSection metrics={context.keyMetrics} />
        <ConclusionSection conclusion={payload.conclusion} />
        <SourcesSection sources={context.sources} ticker={context.ticker} />
        <MethodologyNote warnings={context.warnings} ticker={context.ticker} />
      </div>
    </ReportSourcesProvider>
  );
}
