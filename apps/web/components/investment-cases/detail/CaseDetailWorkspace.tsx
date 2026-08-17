'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  fetchInvestmentCase,
  fetchInvestmentCaseAssumptions,
  fetchInvestmentCaseCatalysts,
  fetchInvestmentCaseEvidence,
  fetchInvestmentCaseInvalidationCriteria,
  fetchInvestmentCaseReviews,
  fetchInvestmentCaseRisks,
  fetchInvestmentCaseVersions,
  fetchInvalidationEvaluations,
  fetchInvestmentMemos,
  fetchThesisChallenges,
  updateInvestmentCase,
  type InvestmentCaseCatalystResponse,
  type InvestmentCaseDetailResponse,
  type InvestmentCaseInvalidationCriterionResponse,
  type InvestmentCaseReviewResponse,
  type InvestmentCaseRiskResponse,
  type InvestmentCaseStatusValue,
  type InvestmentCaseVersionResponse,
  type InvestmentMemoResponse,
  type InvalidationEvaluationResponse,
  type ThesisChallengeResponse,
} from '@/lib/api/investmentCases';
import { ApiError } from '@/lib/api/companies';
import { INVESTMENT_CASE_STATUS_LABELS } from '@/lib/utils/investmentCaseDisplay';
import { formatDate } from '@/lib/utils/format';
import { ThesisEditor } from './ThesisEditor';
import { AssumptionsPanel } from './AssumptionsPanel';
import { ValuationPanel, type ValuationDisplayData } from './ValuationPanel';
import { EvidenceMatrix } from './EvidenceMatrix';
import { RisksCatalystsPanel } from './RisksCatalystsPanel';
import { InvalidationCriteriaPanel } from './InvalidationCriteriaPanel';
import { ReviewWorkflowPanel } from './ReviewWorkflowPanel';
import { MemoPanel } from './MemoPanel';
import { ThesisAssistantPanel } from './ThesisAssistantPanel';
import { CommitteeReviewPanel } from './CommitteeReviewPanel';

const STATUSES: InvestmentCaseStatusValue[] = ['RESEARCHING', 'WATCHLIST', 'ACTIVE_THESIS', 'UNDER_REVIEW', 'THESIS_CHALLENGED', 'THESIS_INVALIDATED', 'ARCHIVED'];

interface Bundle {
  caseData: InvestmentCaseDetailResponse;
  assumptions: Awaited<ReturnType<typeof fetchInvestmentCaseAssumptions>>;
  evidence: Awaited<ReturnType<typeof fetchInvestmentCaseEvidence>>;
  risks: InvestmentCaseRiskResponse[];
  catalysts: InvestmentCaseCatalystResponse[];
  invalidationCriteria: InvestmentCaseInvalidationCriterionResponse[];
  challenges: ThesisChallengeResponse[];
  invalidationEvaluations: InvalidationEvaluationResponse[];
  reviews: InvestmentCaseReviewResponse[];
  versions: InvestmentCaseVersionResponse[];
  memos: InvestmentMemoResponse[];
}

export function CaseDetailWorkspace({
  initialCase,
  initialAssumptions,
  initialEvidence,
  initialRisks,
  initialCatalysts,
  initialInvalidationCriteria,
  initialChallenges,
  initialInvalidationEvaluations,
  initialReviews,
  initialVersions,
  initialMemos,
  initialValuation,
}: {
  initialCase: InvestmentCaseDetailResponse;
  initialAssumptions: Awaited<ReturnType<typeof fetchInvestmentCaseAssumptions>>;
  initialEvidence: Awaited<ReturnType<typeof fetchInvestmentCaseEvidence>>;
  initialRisks: InvestmentCaseRiskResponse[];
  initialCatalysts: InvestmentCaseCatalystResponse[];
  initialInvalidationCriteria: InvestmentCaseInvalidationCriterionResponse[];
  initialChallenges: ThesisChallengeResponse[];
  initialInvalidationEvaluations: InvalidationEvaluationResponse[];
  initialReviews: InvestmentCaseReviewResponse[];
  initialVersions: InvestmentCaseVersionResponse[];
  initialMemos: InvestmentMemoResponse[];
  initialValuation: ValuationDisplayData;
}) {
  const [bundle, setBundle] = useState<Bundle>({
    caseData: initialCase,
    assumptions: initialAssumptions,
    evidence: initialEvidence,
    risks: initialRisks,
    catalysts: initialCatalysts,
    invalidationCriteria: initialInvalidationCriteria,
    challenges: initialChallenges,
    invalidationEvaluations: initialInvalidationEvaluations,
    reviews: initialReviews,
    versions: initialVersions,
    memos: initialMemos,
  });
  const [valuation, setValuation] = useState(initialValuation);
  const [refreshing, setRefreshing] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  async function refresh() {
    setRefreshing(true);
    try {
      const [caseData, assumptions, evidence, risks, catalysts, invalidationCriteria, challenges, invalidationEvaluations, reviews, versions, memos] = await Promise.all([
        fetchInvestmentCase(initialCase.id),
        fetchInvestmentCaseAssumptions(initialCase.id),
        fetchInvestmentCaseEvidence(initialCase.id),
        fetchInvestmentCaseRisks(initialCase.id),
        fetchInvestmentCaseCatalysts(initialCase.id),
        fetchInvestmentCaseInvalidationCriteria(initialCase.id),
        fetchThesisChallenges(initialCase.id),
        fetchInvalidationEvaluations(initialCase.id),
        fetchInvestmentCaseReviews(initialCase.id),
        fetchInvestmentCaseVersions(initialCase.id),
        fetchInvestmentMemos(initialCase.id),
      ]);
      setBundle({ caseData, assumptions, evidence, risks, catalysts, invalidationCriteria, challenges, invalidationEvaluations, reviews, versions, memos });
    } finally {
      setRefreshing(false);
    }
  }

  async function handleStatusChange(status: InvestmentCaseStatusValue) {
    setStatusSaving(true);
    setStatusError(null);
    try {
      const updated = await updateInvestmentCase(initialCase.id, { status });
      setBundle((prev) => ({ ...prev, caseData: { ...prev.caseData, status: updated.status } }));
    } catch (err) {
      setStatusError(err instanceof ApiError ? err.message : 'Failed to update status.');
    } finally {
      setStatusSaving(false);
    }
  }

  const { caseData } = bundle;

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <Link href="/investment-cases" className="text-ink/40 hover:text-accent text-sm">
        ← Investment Cases
      </Link>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-ink font-serif text-3xl">{caseData.company.ticker}</h1>
          <p className="text-ink/50 text-sm">
            {caseData.company.name} · {caseData.horizon} · Created {formatDate(caseData.createdAt)}
          </p>
        </div>
        <div className="text-right">
          <label className="text-ink/40 block text-xs font-medium">Decision Status</label>
          <select
            value={caseData.status}
            onChange={(e) => handleStatusChange(e.target.value as InvestmentCaseStatusValue)}
            disabled={statusSaving}
            className="border-ink/15 bg-paper text-ink mt-1 rounded-lg border px-3 py-2 text-sm font-medium"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {INVESTMENT_CASE_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <p className="text-ink/30 mt-1 text-xs">Always your own explicit decision — never set automatically.</p>
        </div>
      </div>
      {statusError && <p className="mt-2 text-sm text-red-700">{statusError}</p>}
      {refreshing && <p className="text-ink/30 mt-2 text-xs">Refreshing…</p>}

      <div className="mt-10 space-y-12">
        <ThesisEditor caseData={caseData} onUpdated={refresh} />
        <ValuationPanel valuation={valuation} />
        <AssumptionsPanel caseId={caseData.id} assumptions={bundle.assumptions} challenges={bundle.challenges} onChanged={refresh} />
        <EvidenceMatrix caseId={caseData.id} evidence={bundle.evidence} onChanged={refresh} />
        <RisksCatalystsPanel caseId={caseData.id} risks={bundle.risks} catalysts={bundle.catalysts} onChanged={refresh} />
        <InvalidationCriteriaPanel caseId={caseData.id} criteria={bundle.invalidationCriteria} evaluations={bundle.invalidationEvaluations} onChanged={refresh} />
        <ReviewWorkflowPanel caseId={caseData.id} reviews={bundle.reviews} onChanged={refresh} />
        <ThesisAssistantPanel caseId={caseData.id} />
        <MemoPanel caseId={caseData.id} versions={bundle.versions} memos={bundle.memos} onChanged={refresh} />
        <CommitteeReviewPanel caseId={caseData.id} />
      </div>
    </main>
  );
}
