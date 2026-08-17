import type { Metadata } from 'next';
import Link from 'next/link';

export const dynamic = 'force-static';

export const metadata: Metadata = { title: 'Research Feed Methodology · Atlas Research' };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="text-ink font-serif text-base font-semibold">{title}</h2>
      <div className="text-ink/70 mt-2 space-y-2 text-sm leading-relaxed">{children}</div>
    </section>
  );
}

export default function ResearchFeedMethodologyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/research-feed" className="text-accent text-sm hover:underline">
        ← Back to Research Feed
      </Link>
      <h1 className="text-ink mt-3 font-serif text-2xl font-semibold">How the Research Feed Works</h1>
      <p className="text-ink/60 mt-2 text-sm">
        Atlas detects changes across the companies you follow, explains what changed and why it might matter, and
        traces every item back to a real source. It never predicts, recommends, or trades — the goal is DETECT →
        EXPLAIN → TRACE → CONNECT, not PREDICT → TRADE → RECOMMEND.
      </p>

      <Section title="Every detector reuses Atlas's own existing data — never a second pipeline">
        <p>
          Financial and margin changes come from the same SEC-filed financial statements the Financials tab shows.
          Guidance changes come from the same guidance figures the Earnings Calls tab already parsed. DCF and comps
          valuation changes re-run the exact same engines the Valuation and Comparable Companies pages use. New
          filings and corporate events reuse the same 8-K item classification the SEC Filings tab already applies.
          Nothing in this feed is calculated a second, different way.
        </p>
      </Section>

      <Section title="Materiality — a centralized, auditable bar">
        <p>
          A change is only surfaced once it clears a threshold — small, routine fluctuations are recorded but never
          flagged for attention. Thresholds are expressed as a minimum magnitude for each of four tiers:
        </p>
        <pre className="border-ink/10 bg-paper overflow-x-auto rounded-lg border p-3 text-xs">
{`Revenue / EPS / FCF / debt / cash / shares   MEDIUM ≥5%    HIGH ≥15%   CRITICAL ≥30%
Gross / operating / net margin (bps)         MEDIUM ≥100   HIGH ≥300   CRITICAL ≥600
Guidance midpoint                            MEDIUM ≥3%    HIGH ≥7%    CRITICAL ≥20%
DCF implied share price (Base case)          MEDIUM ≥5%    HIGH ≥12%   CRITICAL ≥25%
Peer-median EV/EBITDA                        MEDIUM ≥5%    HIGH ≥15%   CRITICAL ≥25%`}
        </pre>
        <p>
          SEC filings and 8-Ks use a rule-based importance classification instead of a percentage — a filing whose
          disclosed item codes indicate a bankruptcy, restructuring, or major legal event is always CRITICAL.
        </p>
      </Section>

      <Section title="Deduplication — one event, multiple sources">
        <p>
          The same underlying change can surface more than once — a guidance cut visible on the earnings call, later
          referenced again in a follow-up filing. Atlas tracks a stable identity per conceptual event and, when a
          second source corroborates something already recorded, appends that source to the existing event rather
          than creating a duplicate. You will never see the same change reported as four separate feed items.
        </p>
      </Section>

      <Section title="AI explanation — optional, cost-gated, and numbers-first">
        <p>
          An AI explanation is only ever attempted for HIGH or CRITICAL events — small changes are recorded with
          their full detail but never spend a model call. When it does run, the model receives only numbers Atlas
          has already computed; it never calculates a figure itself, never issues a buy/sell recommendation, and
          never claims a model or thesis has been &ldquo;changed&rdquo; or &ldquo;broken&rdquo; — only that
          something is &ldquo;potentially affected.&rdquo; If the AI call fails for any reason, the event stays
          fully visible with everything else intact — the deterministic changes and sources are never dependent on
          the AI step succeeding.
        </p>
      </Section>

      <Section title="Research Thesis Monitor">
        <p>
          On a saved research report, Atlas compares the report&apos;s own originally-assumed Revenue CAGR,
          Operating Margin, FCF Margin, WACC, Terminal Growth Rate, and Revenue Guidance against the best
          currently-available live data. A meaningful drift is flagged as &ldquo;potentially inconsistent with a
          prior research assumption&rdquo; — never a verdict that the thesis is right or wrong, and the underlying
          DCF model is never modified automatically. When no comparable live data exists for a given assumption,
          Atlas shows nothing rather than a fabricated comparison.
        </p>
      </Section>

      <Section title="Read/unread state and personalization">
        <p>
          A research event itself is shared, global data — every user who follows the company sees the same event.
          Only your read/unread state is private to your account. The feed only ever shows events for companies in
          your watchlists, portfolio, or saved research.
        </p>
      </Section>

      <Section title="Known limitations">
        <ul className="list-inside list-disc space-y-1">
          <li>No real background job queue — detection runs lazily when you (or another user) view a company, gated by a 24-hour staleness window, not continuously in the background.</li>
          <li>DCF and comps valuation changes report the overall implied price/multiple only, not a breakdown of which specific input (growth, margin, WACC, terminal value) drove the move.</li>
          <li>Exit Multiple is not currently tracked as a thesis assumption.</li>
          <li>Corporate-event detection relies on SEC 8-K item codes — an event disclosed only in a 10-K/10-Q&apos;s text, without a matching 8-K, won&apos;t be classified as a corporate event.</li>
        </ul>
      </Section>
    </main>
  );
}
