import type { Metadata } from 'next';
import Link from 'next/link';

export const dynamic = 'force-static';

export const metadata: Metadata = { title: 'Investment Case Framework Methodology · Atlas Research' };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="text-ink font-serif text-base font-semibold">{title}</h2>
      <div className="text-ink/70 mt-2 space-y-2 text-sm leading-relaxed">{children}</div>
    </section>
  );
}

export default function InvestmentCaseMethodologyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/investment-cases" className="text-accent text-sm hover:underline">
        ← Back to Investment Cases
      </Link>
      <h1 className="text-ink mt-3 font-serif text-2xl font-semibold">How the Investment Case Framework Works</h1>
      <p className="text-ink/60 mt-2 text-sm">
        This is a research-organization and decision-support tool, not an automated stock picker. Atlas never assigns a
        final decision status, never auto-invalidates a thesis, and never gives personalized investment advice — every
        consequential decision in this framework requires your own explicit confirmation.
      </p>

      <Section title="Decision status is always yours">
        <p>
          A case&apos;s status (Researching, Watchlist, Active Thesis, Under Review, Thesis Challenged, Thesis
          Invalidated, Archived) only ever changes when you explicitly set it. Nothing in this framework — not the
          Thesis Challenge Engine, not an invalidation-criterion evaluation, not confirming a review — changes it on
          your behalf.
        </p>
      </Section>

      <Section title="Bull / Base / Bear valuation is always live">
        <p>
          The three valuation scenarios shown on a case are never stored — they&apos;re recomputed on every page load
          from Atlas&apos;s own DCF engine (the same engine behind the Valuation page), using the same deltas the
          Research Report generator applies for its own scenario analysis. If the underlying fundamentals or DCF
          assumptions elsewhere in Atlas change, this valuation reflects that immediately.
        </p>
      </Section>

      <Section title="The Thesis Challenge Engine — always a 'Potential Challenge,' never a verdict">
        <p>
          Only your case&apos;s BASE-scenario assumptions are compared against live data (Bull/Bear assumptions are
          deliberately shifted &ldquo;what if&rdquo; inputs, not your real-world expectation, so comparing them
          wouldn&apos;t mean anything). Ratio-shaped metrics (growth, margins, WACC, terminal growth) are compared in
          percentage points; multiple/count/dollar-shaped metrics (exit multiple, debt, share count) are compared as a
          relative percent change. A gap below a documented per-metric threshold is treated as normal noise and never
          surfaced. Every surfaced gap is labeled a &ldquo;Potential Challenge&rdquo; — it never declares the thesis
          broken, confirmed, or invalidated; that judgment is always yours.
        </p>
      </Section>

      <Section title="Invalidation criteria are advisory, never automatic">
        <p>
          You write your own invalidation criteria in advance — some machine-checkable against a metric and threshold
          (optionally requiring several consecutive periods), others purely qualitative. A machine-checkable
          criterion&apos;s live evaluation can only ever report &ldquo;Potentially Met&rdquo; — it is never written
          back as a confirmed status, and it never touches the case&apos;s decision status. Resolving a
          &ldquo;Potentially Met&rdquo; flag is always your own explicit action.
        </p>
      </Section>

      <Section title="Thesis Health is a documented framework, not a hidden score">
        <p>
          A case&apos;s Thesis Health (Stable, Watch, Challenged, Review Required) is always accompanied by the exact,
          plain-language reasons it was assigned — open Potential Challenges, potentially-met invalidation criteria,
          high-impact open risks, failed catalysts, and how overdue the case is for review. There is no weighted or
          blended scoring formula behind it; every input is a simple, explainable count.
        </p>
      </Section>

      <Section title="Evidence must always be a real, verifiable Atlas source">
        <p>
          Every Evidence Matrix item must resolve to a real record: a specific SEC filing, earnings call, or research
          event already in Atlas (verified to belong to the case&apos;s own company), or a plainly labeled non-row
          source (financial statements, the DCF or comps model, or historical validation). This is the one write path
          for evidence in the whole system — a human filling out the form and the AI assistant proposing evidence both
          go through the identical check, so there is no separate, less-checked path for AI-originated content.
        </p>
      </Section>

      <Section title="The AI Thesis Assistant — a research aid, never a decision-maker">
        <p>
          The assistant only ever synthesizes, compares, explains, identifies conflicts, and surfaces questions from
          this case&apos;s own real data. It never predicts returns, guarantees an outcome, invents a fact or source,
          decides the thesis&apos;s status, alters any model or assumption, or gives personalized financial advice.
          Every citation it returns is re-verified against the case&apos;s real evidence and research-event ids before
          being shown — a fabricated citation is silently stripped, never trusted from the model&apos;s own claim.
        </p>
      </Section>

      <Section title="Review workflow and the Investment Memo">
        <p>
          Starting a review assembles a read-only summary — new research events since the last review, live thesis
          challenges, current valuation, historical forecast-validation results, and the evidence matrix balance.
          Confirming a review is a separate, explicit action, and even confirming &ldquo;Invalidated&rdquo; does not
          itself change the case&apos;s decision status. Generating a memo always freezes a fresh version snapshot
          first; only the Executive Summary and Conclusion sections carry AI-written narrative text — the other 14
          sections are assembled directly from Atlas&apos;s own data and are never affected by an AI failure. A
          version-to-version comparison is always a plain, deterministic structural diff, never an AI summary.
        </p>
      </Section>

      <Section title="Integration with existing Atlas research">
        <p>
          This framework reuses, rather than duplicates, prior milestones: research-event integration reads directly
          from the same detection pipeline behind the Research Feed and Company Timeline, and historical validation
          reads directly from the Historical Backtesting engine. Neither runs a second, separate analysis.
        </p>
      </Section>
    </main>
  );
}
