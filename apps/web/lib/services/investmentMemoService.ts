import { Prisma, type InvestmentMemo } from '@prisma/client';
import { db } from '@/lib/db';
import { getOwnedInvestmentCase } from '@/lib/services/investmentCaseService';
import { createVersion } from '@/lib/services/investmentCaseVersionService';
import { runDcfForecastValidation } from '@/lib/services/backtestService';
import { buildInvestmentCaseContext, collectValidCitationIds } from '@/lib/investmentCase/context';
import { generateInvestmentMemoNarrative } from '@/lib/ai/generateInvestmentMemoNarrative';
import { AiNotConfiguredError, AiRequestError } from '@/lib/ai/anthropicClient';
import type { CaseSnapshot } from '@/lib/investmentCase/types';
import type { InvestmentMemoContent } from '@/lib/investmentCase/memoTypes';

/**
 * Spec section 21 (memo generation) and section 22 (versioning — every memo
 * is tied 1:1 to a freshly-created InvestmentCaseVersion, so "Version 1 vs
 * Version 2" always has a memo-worthy snapshot behind it). Matches
 * ResearchReport's own AI-generation resilience (Milestone 9): AI failure
 * is caught and persisted as a FAILED row with an `error` message, never
 * thrown past this function — but unlike Milestone 9, the deterministic 14
 * of 16 sections are ALWAYS included even on AI failure, since building
 * them never depends on the AI call succeeding.
 */

export class InvestmentMemoNotFoundError extends Error {
  constructor(message = 'Memo not found.') {
    super(message);
    this.name = 'InvestmentMemoNotFoundError';
  }
}

const MEMO_METHODOLOGY = [
  "This memo synthesizes Atlas Research's existing analysis for this company — DCF and comparable-company valuation (Milestones 5-6), SEC filing and earnings-call analysis (Milestones 7-8), and Milestone 11's research-event detection — into one structured investment case document.",
  "Every figure in this memo (valuation, financials, assumptions) is read directly from Atlas's existing calculation engines or from data the user entered into this investment case — never invented or estimated by an AI model.",
  "Only the Executive Summary and Conclusion sections include AI-written narrative text, and even those may only reference facts and figures already present elsewhere in this memo — every citation is verified against the case's own real evidence and research-event records before being shown.",
  "This is a research and organizational tool, not an automated investment recommendation. The decision status and any conclusion about the thesis remain the user's own judgment.",
];

function buildDeterministicSections(snapshot: CaseSnapshot, historicalValidation: InvestmentMemoContent['historicalValidation'], researchEvents: InvestmentMemoContent['sources']['researchEvents']) {
  return {
    businessOverview: { ticker: snapshot.ticker, companyName: snapshot.companyName, ...snapshot.businessOverview },
    investmentThesis: { status: snapshot.status, horizon: snapshot.horizon, coreThesis: snapshot.coreThesis, keyDrivers: snapshot.keyDrivers },
    financialAnalysis: snapshot.financials,
    valuation: snapshot.valuation,
    bullBaseBear: { bullSummary: snapshot.bullSummary, baseSummary: snapshot.baseSummary, bearSummary: snapshot.bearSummary, assumptions: snapshot.assumptions },
    catalysts: snapshot.catalysts,
    risks: snapshot.risks,
    evidenceFor: snapshot.evidence.filter((e) => e.direction === 'SUPPORTS'),
    evidenceAgainst: snapshot.evidence.filter((e) => e.direction === 'CONTRADICTS'),
    keyAssumptions: snapshot.assumptions.filter((a) => a.scenario === 'BASE'),
    whatWouldChangeMyMind: { strengthen: snapshot.strengthenIndicators, weaken: snapshot.weakenIndicators, invalidate: snapshot.invalidateIndicators, invalidationCriteria: snapshot.invalidationCriteria },
    historicalValidation,
    sources: { evidence: snapshot.evidence, researchEvents },
    methodology: MEMO_METHODOLOGY,
  };
}

export async function generateInvestmentMemo(userId: string, caseId: string): Promise<InvestmentMemo> {
  const investmentCase = await getOwnedInvestmentCase(userId, caseId);

  // A memo always creates a fresh version snapshot — the memo and this
  // version are permanently 1:1 linked (InvestmentMemo.versionId is
  // @unique), so re-reading a memo later always shows exactly the data it
  // was generated from, never a value that could have since drifted.
  const version = await createVersion(userId, caseId);
  const snapshot = version.snapshot as unknown as CaseSnapshot;

  const [context, forecastValidation] = await Promise.all([
    buildInvestmentCaseContext(userId, caseId),
    runDcfForecastValidation(snapshot.ticker).catch(() => null),
  ]);
  const validIds = collectValidCitationIds(context);

  const historicalValidation: InvestmentMemoContent['historicalValidation'] = {
    available: forecastValidation !== null && forecastValidation.comparisons.length > 0,
    summary:
      forecastValidation && forecastValidation.comparisons.length > 0
        ? `Atlas's own historical DCF forecasts for ${snapshot.ticker} have been scored against ${forecastValidation.comparisons.length} actual reported fiscal-year outcomes.`
        : 'No historical forecast-validation data is available yet for this company.',
    sampleSize: forecastValidation?.comparisons.length ?? null,
    methodology: forecastValidation?.methodology ?? [],
    limitations: ['Historical forecast accuracy and valuation relationships are not a guarantee of future performance — see /research-backtest/methodology.'],
  };

  const deterministic = buildDeterministicSections(snapshot, historicalValidation, context.recentResearchEvents);

  try {
    const narrative = await generateInvestmentMemoNarrative({ context }, validIds);
    const content: InvestmentMemoContent = {
      ...deterministic,
      executiveSummary: {
        text: narrative.payload.executive_summary.text,
        citedEvidenceIds: narrative.payload.executive_summary.cited_evidence_ids,
        citedResearchEventIds: narrative.payload.executive_summary.cited_research_event_ids,
      },
      conclusion: {
        text: narrative.payload.conclusion.text,
        citedEvidenceIds: narrative.payload.conclusion.cited_evidence_ids,
        citedResearchEventIds: narrative.payload.conclusion.cited_research_event_ids,
      },
    };

    return db.investmentMemo.create({
      data: {
        investmentCaseId: investmentCase.id,
        versionId: version.id,
        status: 'SUCCESS',
        model: narrative.model,
        content: content as unknown as Prisma.InputJsonValue,
        inputTokens: narrative.inputTokens,
        outputTokens: narrative.outputTokens,
      },
    });
  } catch (error) {
    if (!(error instanceof AiNotConfiguredError) && !(error instanceof AiRequestError)) throw error;

    const content: InvestmentMemoContent = {
      ...deterministic,
      executiveSummary: { text: null, citedEvidenceIds: [], citedResearchEventIds: [] },
      conclusion: { text: null, citedEvidenceIds: [], citedResearchEventIds: [] },
    };

    return db.investmentMemo.create({
      data: {
        investmentCaseId: investmentCase.id,
        versionId: version.id,
        status: 'FAILED',
        error: error.message,
        content: content as unknown as Prisma.InputJsonValue,
      },
    });
  }
}

export async function listMemos(userId: string, caseId: string): Promise<InvestmentMemo[]> {
  const investmentCase = await getOwnedInvestmentCase(userId, caseId);
  return db.investmentMemo.findMany({ where: { investmentCaseId: investmentCase.id }, orderBy: { createdAt: 'desc' } });
}

export async function getMemo(userId: string, caseId: string, memoId: string): Promise<InvestmentMemo> {
  const investmentCase = await getOwnedInvestmentCase(userId, caseId);
  const memo = await db.investmentMemo.findFirst({ where: { id: memoId, investmentCaseId: investmentCase.id } });
  if (!memo) throw new InvestmentMemoNotFoundError();
  return memo;
}
