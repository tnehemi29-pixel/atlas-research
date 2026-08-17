'use client';

import { useState } from 'react';
import Link from 'next/link';
import { askWorkspaceAssistant, fetchResearchDigest, type ResearchDigestResponse, type WorkspaceDashboardResponse } from '@/lib/api/workspace';
import { ApiError } from '@/lib/api/companies';
import { formatUpdatedAt } from '@/lib/utils/format';
import { MATERIALITY_STYLE } from '@/lib/utils/researchEventDisplay';

function StatTile({ label, value, href }: { label: string; value: number; href?: string }) {
  const inner = (
    <div className="border-ink/10 bg-paper rounded-xl border p-4">
      <p className="text-ink/40 text-xs font-medium uppercase tracking-wide">{label}</p>
      <p className="text-ink mt-1 font-serif text-2xl">{value}</p>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

/** Spec section 14's dashboard (stat tiles + recent research changes), plus
 * spec sections 22-23's AI research assistant and digest, embedded here
 * rather than as separate pages since both are ad hoc, workspace-wide
 * queries rather than dedicated research artifacts of their own. */
export function WorkspaceDashboard({ workspaceId, initialDashboard }: { workspaceId: string; initialDashboard: WorkspaceDashboardResponse }) {
  const [dashboard] = useState(initialDashboard);

  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [assistantError, setAssistantError] = useState<string | null>(null);

  const [digest, setDigest] = useState<ResearchDigestResponse | null>(null);
  const [digestLoading, setDigestLoading] = useState(false);
  const [digestError, setDigestError] = useState<string | null>(null);

  async function handleAsk(event: React.FormEvent) {
    event.preventDefault();
    if (!question.trim()) return;
    setAsking(true);
    setAssistantError(null);
    setAnswer(null);
    try {
      const result = await askWorkspaceAssistant(workspaceId, question.trim());
      setAnswer(result.payload.answer);
    } catch (err) {
      setAssistantError(err instanceof ApiError ? err.message : 'Failed to reach the research assistant.');
    } finally {
      setAsking(false);
    }
  }

  async function handleDigest(period: 'DAILY' | 'WEEKLY') {
    setDigestLoading(true);
    setDigestError(null);
    try {
      setDigest(await fetchResearchDigest(workspaceId, period));
    } catch (err) {
      setDigestError(err instanceof ApiError ? err.message : 'Failed to generate the digest.');
    } finally {
      setDigestLoading(false);
    }
  }

  return (
    <div className="mt-6 space-y-8">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatTile label="Companies Covered" value={dashboard.companiesCovered} href={`/workspace/${workspaceId}/coverage`} />
        <StatTile label="Active Projects" value={dashboard.activeProjects} href={`/workspace/${workspaceId}/projects`} />
        <StatTile label="Reports In Review" value={dashboard.reportsInReview} href={`/workspace/${workspaceId}/reviews`} />
        <StatTile label="Open Integrity Issues" value={dashboard.openIntegrityIssues} href="/integrity" />
        <StatTile label="Overdue Tasks" value={dashboard.overdueTasks} href={`/workspace/${workspaceId}/tasks`} />
      </div>

      <section>
        <h2 className="text-ink font-serif text-lg">Recent Research Changes</h2>
        {dashboard.recentResearchChanges.length === 0 ? (
          <p className="text-ink/40 mt-2 text-sm">No recent research changes for covered companies.</p>
        ) : (
          <ul className="border-ink/10 mt-2 divide-y divide-black/5 rounded-xl border">
            {dashboard.recentResearchChanges.map((change, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <Link href={`/company/${change.ticker}`} className="text-accent text-sm font-medium hover:underline">
                    {change.ticker}
                  </Link>
                  <span className="text-ink/70 text-sm">{change.title}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${MATERIALITY_STYLE[change.materiality] ?? MATERIALITY_STYLE.LOW}`}>{change.materiality}</span>
                  <span className="text-ink/30 text-xs">{formatUpdatedAt(change.eventDate)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="border-ink/10 bg-paper rounded-xl border p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-ink font-serif text-lg">Research Digest</h2>
          <div className="flex gap-2">
            <button type="button" onClick={() => handleDigest('DAILY')} disabled={digestLoading} className="border-ink/15 rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50">
              {digestLoading ? 'Generating…' : 'Daily'}
            </button>
            <button type="button" onClick={() => handleDigest('WEEKLY')} disabled={digestLoading} className="border-ink/15 rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50">
              {digestLoading ? 'Generating…' : 'Weekly'}
            </button>
          </div>
        </div>
        {digestError && <p className="mt-2 text-sm text-red-700">{digestError}</p>}
        {digest && (
          <div className="mt-3">
            <p className="text-ink/70 text-sm">
              {digest.majorCompanyDevelopments} major company development(s) · {digest.investmentCasesChanged} investment case(s) changed · {digest.secFilingsReviewed} SEC filing(s) reviewed ·{' '}
              {digest.thesisChallenges} thesis challenge(s) · {digest.researchReportsUpdated} research report(s) updated
            </p>
            {digest.narrative ? (
              <p className="text-ink mt-2 text-sm">{digest.narrative}</p>
            ) : (
              <p className="text-ink/40 mt-2 text-xs">AI narrative unavailable (ANTHROPIC_API_KEY not configured) — the counts above are still exact.</p>
            )}
            {digest.highlights.length > 0 && (
              <ul className="mt-2 space-y-1">
                {digest.highlights.map((h, i) => (
                  <li key={i} className="text-ink/60 text-xs">
                    · {h.ticker} — {h.title} ({h.materiality})
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <section className="border-ink/10 bg-paper rounded-xl border p-4 print:hidden">
        <h2 className="text-ink font-serif text-lg">Ask the Research Assistant</h2>
        <p className="text-ink/50 mt-1 text-sm">
          e.g. &quot;Which companies have unresolved research issues?&quot; or &quot;What reports are currently in review?&quot; — answers are grounded only in this workspace&apos;s own data.
        </p>
        <form onSubmit={handleAsk} className="mt-3 flex gap-2">
          <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask a question about this workspace's research…" className="border-ink/15 bg-paper text-ink flex-1 rounded-lg border px-3 py-2 text-sm" />
          <button type="submit" disabled={asking || !question.trim()} className="bg-accent rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {asking ? 'Asking…' : 'Ask'}
          </button>
        </form>
        {assistantError && <p className="mt-2 text-sm text-red-700">{assistantError}</p>}
        {answer && <p className="text-ink border-ink/10 mt-3 border-t pt-3 text-sm">{answer}</p>}
      </section>
    </div>
  );
}
