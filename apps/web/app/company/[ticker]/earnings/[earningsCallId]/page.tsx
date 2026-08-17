import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  EarningsCallNotFoundError,
  findMatchingSecFiling,
  findPreviousEarningsCall,
  getCallWithSegments,
  getEarningsFinancialResults,
  getExistingAnalysis,
  getExistingComparison,
  getExistingFilingComparison,
  getGuidanceObservations,
} from '@/lib/services/earningsCallService';
import { separateQaExchanges } from '@/lib/earnings/qaSeparation';
import { isAiConfigured } from '@/lib/ai/anthropicClient';
import { EarningsCallDetailWorkspace } from '@/components/company/earnings/EarningsCallDetailWorkspace';
import type {
  EarningsAnalysisResponse,
  EarningsCallDetailResponse,
  EarningsComparisonResponse,
  EarningsFilingComparisonResponse,
  GuidanceObservationResponse,
  QaResponse,
} from '@/lib/api/earnings';
import type { AnalystTopicItem } from '@/lib/ai/earningsSchema';

export const dynamic = 'force-dynamic';

interface EarningsCallDetailPageProps {
  params: { ticker: string; earningsCallId: string };
}

export async function generateMetadata({ params }: EarningsCallDetailPageProps): Promise<Metadata> {
  return { title: `${params.ticker.toUpperCase()} Earnings Call Analysis · Atlas Research` };
}

export default async function EarningsCallDetailPage({ params }: EarningsCallDetailPageProps) {
  const ticker = params.ticker.toUpperCase();

  let result;
  try {
    result = await getCallWithSegments(params.earningsCallId);
  } catch (error) {
    if (error instanceof EarningsCallNotFoundError) notFound();
    throw error;
  }

  const { call, segments } = result;
  const financialResults = await getEarningsFinancialResults(call);

  const detail: EarningsCallDetailResponse = {
    call: {
      id: call.id,
      companyId: call.companyId,
      fiscalYear: call.fiscalYear,
      fiscalQuarter: call.fiscalQuarter,
      periodEndDate: call.periodEndDate ? call.periodEndDate.toISOString() : null,
      callDate: call.callDate ? call.callDate.toISOString() : null,
      provider: call.provider,
      providerTranscriptId: call.providerTranscriptId,
      processingStatus: call.processingStatus,
      processingError: call.processingError,
      createdAt: call.createdAt.toISOString(),
      updatedAt: call.updatedAt.toISOString(),
    },
    segments: segments.map((s) => ({
      id: s.id,
      section: s.section,
      orderIndex: s.orderIndex,
      speakerName: s.speakerName,
      speakerRole: s.speakerRole,
      speakerType: s.speakerType,
      text: s.text,
      anchor: s.anchor,
    })),
    financialResults,
  };

  const existingAnalysis = await getExistingAnalysis(call.id);
  const initialAnalysis: EarningsAnalysisResponse | null = existingAnalysis
    ? {
        id: existingAnalysis.id,
        earningsCallId: existingAnalysis.earningsCallId,
        status: existingAnalysis.status,
        model: existingAnalysis.model,
        error: existingAnalysis.error,
        summary: existingAnalysis.summary,
        businessTrends: existingAnalysis.businessTrends as unknown as EarningsAnalysisResponse['businessTrends'],
        managementCommentary: existingAnalysis.managementCommentary as unknown as EarningsAnalysisResponse['managementCommentary'],
        risks: existingAnalysis.risks as unknown as EarningsAnalysisResponse['risks'],
        capitalAllocation: existingAnalysis.capitalAllocation as unknown as EarningsAnalysisResponse['capitalAllocation'],
        analystTopics: existingAnalysis.analystTopics as unknown as EarningsAnalysisResponse['analystTopics'],
        managementLanguage: existingAnalysis.managementLanguage as unknown as EarningsAnalysisResponse['managementLanguage'],
        inputTokens: existingAnalysis.inputTokens,
        outputTokens: existingAnalysis.outputTokens,
        generatedAt: existingAnalysis.generatedAt.toISOString(),
        updatedAt: existingAnalysis.updatedAt.toISOString(),
      }
    : null;

  const guidanceRows = await getGuidanceObservations(call.id);
  const initialGuidance: GuidanceObservationResponse[] = guidanceRows.map((g) => ({
    id: g.id,
    earningsCallId: g.earningsCallId,
    metric: g.metric,
    metricLabel: g.metricLabel,
    period: g.period,
    low: g.low,
    high: g.high,
    midpoint: g.midpoint,
    priorLow: g.priorLow,
    priorHigh: g.priorHigh,
    priorMidpoint: g.priorMidpoint,
    change: g.change,
    sourceExcerpt: g.sourceExcerpt,
    sourceAnchor: g.sourceAnchor,
    createdAt: g.createdAt.toISOString(),
  }));

  const exchanges = separateQaExchanges(
    segments.map((s) => ({ section: s.section, speakerName: s.speakerName, speakerRole: s.speakerRole, speakerType: s.speakerType, text: s.text, anchor: s.anchor })),
  );
  const analystTopics = (existingAnalysis?.analystTopics as unknown as AnalystTopicItem[] | undefined) ?? null;
  const topicCounts = new Map<string, number>();
  for (const item of analystTopics ?? []) {
    topicCounts.set(item.topic, (topicCounts.get(item.topic) ?? 0) + 1);
  }
  const qa: QaResponse = {
    exchanges,
    analystTopics,
    topicCounts: [...topicCounts.entries()].map(([topic, count]) => ({ topic, count })),
  };

  const previousCallRow = await findPreviousEarningsCall(call);
  const previousCall = previousCallRow
    ? { id: previousCallRow.id, fiscalYear: previousCallRow.fiscalYear, fiscalQuarter: previousCallRow.fiscalQuarter }
    : null;

  const existingComparison = previousCallRow ? await getExistingComparison(call.id, previousCallRow.id) : null;
  const initialComparison: EarningsComparisonResponse | null = existingComparison
    ? {
        id: existingComparison.id,
        earningsCallId: existingComparison.earningsCallId,
        previousEarningsCallId: existingComparison.previousEarningsCallId,
        status: existingComparison.status,
        model: existingComparison.model,
        error: existingComparison.error,
        financialChanges: existingComparison.financialChanges as unknown as EarningsComparisonResponse['financialChanges'],
        languageChanges: existingComparison.languageChanges as unknown as EarningsComparisonResponse['languageChanges'],
        toneComparison: existingComparison.toneComparison as unknown as EarningsComparisonResponse['toneComparison'],
        guidanceSummary: existingComparison.guidanceSummary as unknown as EarningsComparisonResponse['guidanceSummary'],
        generatedAt: existingComparison.generatedAt.toISOString(),
      }
    : null;

  const matchingFilingRow = await findMatchingSecFiling(call.companyId, call);
  const matchingFiling = matchingFilingRow ? { id: matchingFilingRow.id, formType: matchingFilingRow.formType, ticker } : null;

  const existingFilingComparison = matchingFilingRow ? await getExistingFilingComparison(call.id, matchingFilingRow.id) : null;
  const initialFilingComparison: EarningsFilingComparisonResponse | null = existingFilingComparison
    ? {
        id: existingFilingComparison.id,
        earningsCallId: existingFilingComparison.earningsCallId,
        secFilingId: existingFilingComparison.secFilingId,
        status: existingFilingComparison.status,
        model: existingFilingComparison.model,
        error: existingFilingComparison.error,
        alignments: existingFilingComparison.alignments as unknown as EarningsFilingComparisonResponse['alignments'],
        newInCall: existingFilingComparison.newInCall as unknown as EarningsFilingComparisonResponse['newInCall'],
        onlyInFiling: existingFilingComparison.onlyInFiling as unknown as EarningsFilingComparisonResponse['onlyInFiling'],
        riskEmphasisDifferences:
          existingFilingComparison.riskEmphasisDifferences as unknown as EarningsFilingComparisonResponse['riskEmphasisDifferences'],
        guidanceDifferences:
          existingFilingComparison.guidanceDifferences as unknown as EarningsFilingComparisonResponse['guidanceDifferences'],
        generatedAt: existingFilingComparison.generatedAt.toISOString(),
      }
    : null;

  return (
    <EarningsCallDetailWorkspace
      ticker={ticker}
      detail={detail}
      initialAnalysis={initialAnalysis}
      initialGuidance={initialGuidance}
      qa={qa}
      previousCall={previousCall}
      initialComparison={initialComparison}
      matchingFiling={matchingFiling}
      initialFilingComparison={initialFilingComparison}
      aiConfigured={isAiConfigured()}
    />
  );
}
