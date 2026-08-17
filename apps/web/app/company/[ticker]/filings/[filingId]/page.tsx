import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  FilingNotFoundError,
  findPreviousFiling,
  getExistingAnalysis,
  getExistingComparison,
  getFilingWithSections,
} from '@/lib/services/secFilingService';
import { isAiConfigured } from '@/lib/ai/anthropicClient';
import { FilingDetailWorkspace } from '@/components/company/filings/FilingDetailWorkspace';
import type { FilingAnalysisResponse, FilingComparisonResponse, FilingDetailResponse } from '@/lib/api/filings';

export const dynamic = 'force-dynamic';

interface FilingDetailPageProps {
  params: { ticker: string; filingId: string };
}

export async function generateMetadata({ params }: FilingDetailPageProps): Promise<Metadata> {
  return { title: `${params.ticker.toUpperCase()} Filing Analysis · Atlas Research` };
}

export default async function FilingDetailPage({ params }: FilingDetailPageProps) {
  const ticker = params.ticker.toUpperCase();

  let result;
  try {
    result = await getFilingWithSections(params.filingId);
  } catch (error) {
    if (error instanceof FilingNotFoundError) notFound();
    throw error;
  }

  const { filing, sections } = result;

  const filingResponse: FilingDetailResponse['filing'] = {
    id: filing.id,
    companyId: filing.companyId,
    filingType: filing.filingType,
    formType: filing.formType,
    filingDate: filing.filingDate.toISOString(),
    periodEnd: filing.periodEnd ? filing.periodEnd.toISOString() : null,
    accessionNumber: filing.accessionNumber,
    primaryDocument: filing.primaryDocument,
    secUrl: filing.secUrl,
    description: filing.description,
    items: filing.items,
    processingStatus: filing.processingStatus,
    processingError: filing.processingError,
    createdAt: filing.createdAt.toISOString(),
    updatedAt: filing.updatedAt.toISOString(),
  };

  const sectionsResponse = sections.map((section) => ({
    id: section.id,
    sectionType: section.sectionType,
    title: section.title,
    itemCode: section.itemCode,
    anchor: section.anchor,
    content: section.content,
    charCount: section.charCount,
  }));

  const existingAnalysis = await getExistingAnalysis(filing.id);
  const initialAnalysis: FilingAnalysisResponse | null = existingAnalysis
    ? {
        id: existingAnalysis.id,
        filingId: existingAnalysis.filingId,
        status: existingAnalysis.status,
        model: existingAnalysis.model,
        error: existingAnalysis.error,
        summary: existingAnalysis.summary,
        keyChanges: existingAnalysis.keyChanges as FilingAnalysisResponse['keyChanges'],
        risks: existingAnalysis.risks as FilingAnalysisResponse['risks'],
        managementCommentary: existingAnalysis.managementCommentary as FilingAnalysisResponse['managementCommentary'],
        capitalAllocation: existingAnalysis.capitalAllocation as FilingAnalysisResponse['capitalAllocation'],
        accountingChanges: existingAnalysis.accountingChanges as FilingAnalysisResponse['accountingChanges'],
        inputTokens: existingAnalysis.inputTokens,
        outputTokens: existingAnalysis.outputTokens,
        generatedAt: existingAnalysis.generatedAt.toISOString(),
        updatedAt: existingAnalysis.updatedAt.toISOString(),
      }
    : null;

  const previousFilingRow = await findPreviousFiling(filing);
  const previousFiling = previousFilingRow
    ? { id: previousFilingRow.id, formType: previousFilingRow.formType, filingDate: previousFilingRow.filingDate.toISOString() }
    : null;

  const existingComparison = previousFilingRow ? await getExistingComparison(filing.id, previousFilingRow.id) : null;
  const initialComparison: FilingComparisonResponse | null = existingComparison
    ? {
        id: existingComparison.id,
        filingId: existingComparison.filingId,
        previousFilingId: existingComparison.previousFilingId,
        status: existingComparison.status,
        model: existingComparison.model,
        error: existingComparison.error,
        financialChanges: existingComparison.financialChanges as unknown as FilingComparisonResponse['financialChanges'],
        newRisks: existingComparison.newRisks as unknown as FilingComparisonResponse['newRisks'],
        removedRisks: existingComparison.removedRisks as unknown as FilingComparisonResponse['removedRisks'],
        changedLanguage: existingComparison.changedLanguage as unknown as FilingComparisonResponse['changedLanguage'],
        guidanceChanges: existingComparison.guidanceChanges as unknown as FilingComparisonResponse['guidanceChanges'],
        managementCommentaryChanges:
          existingComparison.managementCommentaryChanges as FilingComparisonResponse['managementCommentaryChanges'],
        generatedAt: existingComparison.generatedAt.toISOString(),
      }
    : null;

  return (
    <FilingDetailWorkspace
      ticker={ticker}
      filing={filingResponse}
      sections={sectionsResponse}
      initialAnalysis={initialAnalysis}
      previousFiling={previousFiling}
      initialComparison={initialComparison}
      aiConfigured={isAiConfigured()}
    />
  );
}
