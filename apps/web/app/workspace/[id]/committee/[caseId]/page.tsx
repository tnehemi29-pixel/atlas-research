import type { Metadata } from 'next';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth/session';
import { WorkspaceNotFoundError } from '@/lib/services/workspaceService';
import { getCommitteeReviewDetail } from '@/lib/services/committeeReviewService';
import { InvestmentCaseNotFoundError } from '@/lib/services/investmentCaseService';
import { WorkspaceNav } from '@/components/workspace/WorkspaceNav';
import { CommitteeReactionForm } from '@/components/workspace/CommitteeReactionForm';
import { formatUpdatedAt } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Committee Case Review · Atlas Research' };

/** Spec section 20's worked example: Company, Thesis, Valuation, Bull/Base/
 * Bear, Evidence, Risks, Catalysts, Historical Validation, Research
 * Integrity, Open Questions — read-only for workspace peers, plus reactions. */
export default async function CommitteeCaseDetailPage({ params }: { params: { id: string; caseId: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  let detail;
  try {
    detail = await getCommitteeReviewDetail(user.id, params.caseId);
  } catch (error) {
    if (error instanceof WorkspaceNotFoundError || error instanceof InvestmentCaseNotFoundError) notFound();
    throw error;
  }

  const reactions = detail.committeeReactions.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <WorkspaceNav workspaceId={params.id} active="committee" />
      <header className="border-ink/10 border-b pb-6">
        <Link href={`/company/${detail.company.ticker}`} className="text-accent text-sm font-medium hover:underline">
          {detail.company.ticker} · {detail.company.name}
        </Link>
        <h1 className="text-ink font-serif text-2xl font-semibold">Committee Review</h1>
        <p className="text-ink/40 mt-1 text-xs">Horizon: {detail.horizon}</p>
      </header>

      <section className="mt-6">
        <h2 className="text-ink font-serif text-lg">Core Thesis</h2>
        <p className="text-ink mt-2 whitespace-pre-wrap text-sm">{detail.coreThesis}</p>
      </section>

      <section className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <p className="text-ink/40 text-xs">Assumptions</p>
          <p className="text-ink font-serif text-xl">{detail.assumptions.length}</p>
        </div>
        <div>
          <p className="text-ink/40 text-xs">Evidence</p>
          <p className="text-ink font-serif text-xl">{detail.evidence.length}</p>
        </div>
        <div>
          <p className="text-ink/40 text-xs">Risks</p>
          <p className="text-ink font-serif text-xl">{detail.risks.length}</p>
        </div>
        <div>
          <p className="text-ink/40 text-xs">Catalysts</p>
          <p className="text-ink font-serif text-xl">{detail.catalysts.length}</p>
        </div>
      </section>

      <p className="text-ink/40 mt-4 text-xs">
        For the full thesis (valuation, evidence matrix, historical validation, research integrity), view this case&apos;s owner-side detail page if you have access, or ask them directly — committee
        review here intentionally shows a read-only summary, not the full editing workspace.
      </p>

      <CommitteeReactionForm caseId={params.caseId} initialReactions={reactions} />
    </main>
  );
}
