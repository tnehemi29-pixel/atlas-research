import type { Metadata } from 'next';
import { redirect, notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { getInvestmentCaseDetail, InvestmentCaseNotFoundError } from '@/lib/services/investmentCaseService';
import { getMemo, InvestmentMemoNotFoundError } from '@/lib/services/investmentMemoService';
import { MemoDocument } from '@/components/investment-cases/detail/MemoDocument';
import type { InvestmentMemoContentResponse } from '@/lib/api/investmentCases';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Investment Memo · Atlas Research' };

export default async function InvestmentMemoPage({ params }: { params: { id: string; memoId: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  let caseDetail;
  let memo;
  try {
    caseDetail = await getInvestmentCaseDetail(user.id, params.id);
    memo = await getMemo(user.id, params.id, params.memoId);
  } catch (error) {
    if (error instanceof InvestmentCaseNotFoundError || error instanceof InvestmentMemoNotFoundError) notFound();
    throw error;
  }

  return (
    <MemoDocument
      caseId={caseDetail.id}
      ticker={caseDetail.company.ticker}
      status={memo.status as 'SUCCESS' | 'FAILED'}
      createdAt={memo.createdAt.toISOString()}
      model={memo.model}
      content={memo.content as unknown as InvestmentMemoContentResponse}
    />
  );
}
