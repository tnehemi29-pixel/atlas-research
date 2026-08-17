'use client';

import { useState } from 'react';
import Link from 'next/link';
import type {
  EarningsAnalysisResponse,
  EarningsCallDetailResponse,
  EarningsComparisonResponse,
  EarningsFilingComparisonResponse,
  GuidanceObservationResponse,
  QaResponse,
} from '@/lib/api/earnings';
import { generateEarningsAnalysis } from '@/lib/api/earnings';
import { CompanyNav } from '@/components/company/CompanyNav';
import { formatDate } from '@/lib/utils/format';
import { FinancialResultsPanel } from './FinancialResultsPanel';
import { GuidancePanel } from './GuidancePanel';
import { EarningsAnalysisPanel } from './EarningsAnalysisPanel';
import { ManagementTonePanel } from './ManagementTonePanel';
import { AnalystQaPanel } from './AnalystQaPanel';
import { SourceTranscriptViewer } from './SourceTranscriptViewer';
import { EarningsSearchBox } from './EarningsSearchBox';
import { EarningsComparePanel } from './EarningsComparePanel';
import { EarningsFilingComparePanel } from './EarningsFilingComparePanel';

interface PreviousCallRef {
  id: string;
  fiscalYear: number;
  fiscalQuarter: number;
}

interface MatchingFilingRef {
  id: string;
  formType: string;
  ticker: string;
}

interface EarningsCallDetailWorkspaceProps {
  ticker: string;
  detail: EarningsCallDetailResponse;
  initialAnalysis: EarningsAnalysisResponse | null;
  initialGuidance: GuidanceObservationResponse[];
  qa: QaResponse;
  previousCall: PreviousCallRef | null;
  initialComparison: EarningsComparisonResponse | null;
  matchingFiling: MatchingFilingRef | null;
  initialFilingComparison: EarningsFilingComparisonResponse | null;
  /** Server-checked once (lib/ai/anthropicClient.ts's isAiConfigured) — when
   * false, every AI "Generate" action is hidden rather than shown and then
   * failing, so a visitor never sees an API-key error. */
  aiConfigured: boolean;
}

export function EarningsCallDetailWorkspace({
  ticker,
  detail,
  initialAnalysis,
  initialGuidance,
  qa,
  previousCall,
  initialComparison,
  matchingFiling,
  initialFilingComparison,
  aiConfigured,
}: EarningsCallDetailWorkspaceProps) {
  const { call, segments, financialResults } = detail;
  const [analysis, setAnalysis] = useState(initialAnalysis);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // A FAILED row cached from before AI was disabled is treated as if
  // nothing had been generated — a visitor never sees an API-key failure
  // message. A SUCCESS row is always shown regardless of current configuration.
  const displayAnalysis = analysis && (aiConfigured || analysis.status === 'SUCCESS') ? analysis : null;

  async function handleGenerateAnalysis(regenerate: boolean) {
    setIsGenerating(true);
    setError(null);
    try {
      const result = await generateEarningsAnalysis(call.id, regenerate);
      setAnalysis(result);
    } catch {
      setError('Failed to generate the analysis. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <div className="mb-2 flex items-center justify-between">
        <CompanyNav ticker={ticker} active="earnings" />
        <Link href={`/company/${ticker}/earnings`} className="text-accent text-sm hover:underline">
          ← All Earnings Calls
        </Link>
      </div>

      <header className="border-ink/10 border-b pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="border-accent/30 bg-accent-soft text-accent rounded px-2 py-0.5 text-sm font-semibold uppercase tracking-wide">
            Q{call.fiscalQuarter} {call.fiscalYear}
          </span>
          <h1 className="text-ink font-serif text-2xl font-semibold">{ticker} Earnings Call</h1>
        </div>
        <div className="text-ink/50 mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {call.periodEndDate && <span>Period ended {formatDate(call.periodEndDate)}</span>}
          {call.callDate && <span>Call date {formatDate(call.callDate)}</span>}
        </div>
        {call.processingStatus === 'UNAVAILABLE' && (
          <p className="mt-3 text-xs text-amber-700">Transcript unavailable: {call.processingError}</p>
        )}
        {call.processingStatus === 'FAILED' && (
          <p className="mt-3 text-xs text-red-700">Processing failed: {call.processingError}</p>
        )}
      </header>

      <section className="mt-8">
        <h2 className="text-ink font-serif text-lg font-semibold">Financial Results</h2>
        <div className="mt-3">
          <FinancialResultsPanel results={financialResults} />
        </div>
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-ink font-serif text-lg font-semibold">Call Analysis</h2>
          <div className="flex items-center gap-2">
            {aiConfigured && displayAnalysis && (
              <button
                type="button"
                onClick={() => handleGenerateAnalysis(true)}
                disabled={isGenerating}
                className="border-ink/15 text-ink/70 hover:bg-accent-soft rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
              >
                {isGenerating ? 'Regenerating…' : 'Regenerate'}
              </button>
            )}
            {aiConfigured && !displayAnalysis && (
              <button
                type="button"
                onClick={() => handleGenerateAnalysis(false)}
                disabled={isGenerating || call.processingStatus !== 'COMPLETE'}
                className="bg-accent rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {isGenerating ? 'Analyzing…' : 'Generate Analysis'}
              </button>
            )}
          </div>
        </div>
        {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
        {!aiConfigured && !displayAnalysis && (
          <p className="text-ink/50 mt-2 text-sm">
            AI-generated analysis isn&apos;t enabled in this environment. Financial results above are unaffected.
          </p>
        )}
        {aiConfigured && !displayAnalysis && call.processingStatus !== 'COMPLETE' && (
          <p className="text-ink/50 mt-2 text-sm">
            {call.processingStatus === 'UNAVAILABLE'
              ? 'No transcript is available for this call, so no AI analysis can be generated. Financial results above are unaffected.'
              : "This call hasn't been processed into a transcript yet — analysis isn't available until it has."}
          </p>
        )}
        {aiConfigured && !displayAnalysis && call.processingStatus === 'COMPLETE' && (
          <p className="text-ink/50 mt-2 text-sm">
            No analysis has been generated yet. Generating one calls Atlas&apos;s AI provider once and caches the
            result — it won&apos;t be regenerated automatically on future visits.
          </p>
        )}
        {displayAnalysis && <EarningsAnalysisPanel analysis={displayAnalysis} segments={segments} />}
      </section>

      <section className="mt-8">
        <h2 className="text-ink font-serif text-lg font-semibold">Guidance</h2>
        <p className="text-ink/50 mt-1 text-xs">
          Low/high figures are what management stated; midpoint and the change label are always computed
          deterministically against the prior call&apos;s guidance for the same metric and period — never by the
          AI itself.
        </p>
        <div className="mt-3">
          <GuidancePanel observations={initialGuidance} />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-ink font-serif text-lg font-semibold">Management Language</h2>
        <div className="mt-3">
          <ManagementTonePanel items={analysis?.status === 'SUCCESS' ? analysis.managementLanguage : []} segments={segments} />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-ink font-serif text-lg font-semibold">Analyst Q&amp;A</h2>
        <div className="mt-3">
          <AnalystQaPanel qa={qa} segments={segments} aiConfigured={aiConfigured} />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-ink font-serif text-lg font-semibold">Source Transcript</h2>
        <p className="text-ink/50 mt-1 text-xs">
          The parsed transcript this analysis was drawn from — click &ldquo;View Source&rdquo; on any analysis item
          to jump directly to the speaker turn it came from.
        </p>
        <div className="mt-3">
          <SourceTranscriptViewer segments={segments} highlightQuery={searchQuery} />
        </div>
      </section>

      <EarningsSearchBox earningsCallId={call.id} onQueryChange={setSearchQuery} />

      <EarningsComparePanel
        earningsCallId={call.id}
        currentFiscalYear={call.fiscalYear}
        currentFiscalQuarter={call.fiscalQuarter}
        previousCall={previousCall}
        initialComparison={initialComparison}
        aiConfigured={aiConfigured}
      />

      <EarningsFilingComparePanel
        earningsCallId={call.id}
        matchingFiling={matchingFiling}
        initialComparison={initialFilingComparison}
        aiConfigured={aiConfigured}
      />
    </main>
  );
}
