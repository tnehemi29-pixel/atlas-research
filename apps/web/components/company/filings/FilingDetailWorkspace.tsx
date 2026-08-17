'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { FilingAnalysisResponse, FilingComparisonResponse, FilingDetailResponse, FilingSectionResponse } from '@/lib/api/filings';
import { generateFilingAnalysis } from '@/lib/api/filings';
import { CompanyNav } from '@/components/company/CompanyNav';
import { formatDate } from '@/lib/utils/format';
import { AnalysisPanel } from './AnalysisPanel';
import { SourceSectionsViewer } from './SourceSectionsViewer';
import { FilingSearchBox } from './FilingSearchBox';
import { ComparePanel } from './ComparePanel';

const TYPE_LABELS: Record<string, string> = {
  TEN_K: '10-K',
  TEN_Q: '10-Q',
  EIGHT_K: '8-K',
  DEF_14A: 'DEF 14A',
  TWENTY_F: '20-F',
  OTHER: 'Other',
};

interface PreviousFilingRef {
  id: string;
  formType: string;
  filingDate: string;
}

interface FilingDetailWorkspaceProps {
  ticker: string;
  filing: FilingDetailResponse['filing'];
  sections: FilingSectionResponse[];
  initialAnalysis: FilingAnalysisResponse | null;
  previousFiling: PreviousFilingRef | null;
  initialComparison: FilingComparisonResponse | null;
  /** Server-checked once (lib/ai/anthropicClient.ts's isAiConfigured) — when
   * false, every AI "Generate" action is hidden rather than shown and then
   * failing, so a visitor never sees an API-key error. */
  aiConfigured: boolean;
}

export function FilingDetailWorkspace({
  ticker,
  filing,
  sections,
  initialAnalysis,
  previousFiling,
  initialComparison,
  aiConfigured,
}: FilingDetailWorkspaceProps) {
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
      const result = await generateFilingAnalysis(filing.id, regenerate);
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
        <CompanyNav ticker={ticker} active="filings" />
        <Link href={`/company/${ticker}/filings`} className="text-accent text-sm hover:underline">
          ← All Filings
        </Link>
      </div>

      <header className="border-ink/10 border-b pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="border-accent/30 bg-accent-soft text-accent rounded px-2 py-0.5 text-sm font-semibold uppercase tracking-wide">
            {TYPE_LABELS[filing.filingType] ?? filing.formType}
          </span>
          <h1 className="text-ink font-serif text-2xl font-semibold">{ticker}</h1>
        </div>
        <div className="text-ink/50 mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <span>Filed {formatDate(filing.filingDate)}</span>
          {filing.periodEnd && <span>Period ended {formatDate(filing.periodEnd)}</span>}
          <span className="font-mono text-xs">Accession {filing.accessionNumber}</span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <a
            href={filing.secUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="border-accent text-accent hover:bg-accent-soft rounded-lg border px-3 py-1.5 text-xs font-medium"
          >
            View Original SEC Filing ↗
          </a>
          {filing.processingStatus === 'FAILED' && (
            <span className="text-xs text-red-700">Processing failed: {filing.processingError}</span>
          )}
        </div>
      </header>

      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-ink font-serif text-lg font-semibold">Filing Analysis</h2>
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
                disabled={isGenerating || filing.processingStatus !== 'COMPLETE'}
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
            AI-generated analysis isn&apos;t enabled in this environment. The extracted source sections below are
            still fully available.
          </p>
        )}
        {aiConfigured && !displayAnalysis && filing.processingStatus !== 'COMPLETE' && (
          <p className="text-ink/50 mt-2 text-sm">
            This filing hasn&apos;t been processed into sections yet — analysis isn&apos;t available until it has.
          </p>
        )}
        {aiConfigured && !displayAnalysis && filing.processingStatus === 'COMPLETE' && (
          <p className="text-ink/50 mt-2 text-sm">
            No analysis has been generated yet. Generating one calls Atlas&apos;s AI provider once and caches the
            result — it won&apos;t be regenerated automatically on future visits.
          </p>
        )}
        {displayAnalysis && <AnalysisPanel analysis={displayAnalysis} sections={sections} />}
      </section>

      <section className="mt-8">
        <h2 className="text-ink font-serif text-lg font-semibold">Source Document</h2>
        <p className="text-ink/50 mt-1 text-xs">
          Extracted, cleaned sections from the filing above — click &ldquo;View Source&rdquo; on any analysis item to
          jump directly to the section it was drawn from.
        </p>
        <div className="mt-3">
          <SourceSectionsViewer sections={sections} highlightQuery={searchQuery} />
        </div>
      </section>

      <FilingSearchBox filingId={filing.id} onQueryChange={setSearchQuery} />

      <ComparePanel
        filingId={filing.id}
        currentFormType={filing.formType}
        currentFilingDate={filing.filingDate}
        previousFiling={previousFiling}
        initialComparison={initialComparison}
        aiConfigured={aiConfigured}
      />
    </main>
  );
}
