import type { Metadata } from 'next';
import Link from 'next/link';

export const dynamic = 'force-static';

interface MethodologyPageProps {
  params: { ticker: string };
}

export async function generateMetadata({ params }: MethodologyPageProps): Promise<Metadata> {
  return { title: `Comps Methodology · ${params.ticker.toUpperCase()} · Atlas Research` };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="text-ink font-serif text-base font-semibold">{title}</h2>
      <div className="text-ink/70 mt-2 space-y-2 text-sm leading-relaxed">{children}</div>
    </section>
  );
}

export default function CompsMethodologyPage({ params }: MethodologyPageProps) {
  const ticker = params.ticker.toUpperCase();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link href={`/company/${ticker}/comps`} className="text-accent text-sm hover:underline">
        ← Back to {ticker} comparable companies
      </Link>
      <h1 className="text-ink mt-3 font-serif text-2xl font-semibold">Comparable Company Analysis Methodology</h1>
      <p className="text-ink/60 mt-2 text-sm">
        A concise reference for exactly how Atlas Research&apos;s comps engine (
        <code className="text-ink/80 bg-accent-soft rounded px-1 py-0.5 text-xs">lib/comps/</code>) screens
        for peers, calculates multiples, and estimates an implied valuation. Every number on the
        comps page traces back to something on this page.
      </p>

      <Section title="What is Comparable Company Analysis?">
        <p>
          CCA values a company by looking at what the market currently pays for similar public
          companies — expressed as valuation multiples (e.g. Enterprise Value / EBITDA) — and
          applying those multiples to the target company&apos;s own financials. It answers &ldquo;what
          would this company be worth if the market valued it the way it currently values its
          peers?&rdquo;, which is a different question from a DCF&apos;s &ldquo;what are this company&apos;s own
          future cash flows worth?&rdquo;
        </p>
      </Section>

      <Section title="How are peers selected?">
        <p>
          Candidates come from two places: companies already in Atlas&apos;s own database that share
          the target&apos;s sector or industry, and (when configured) Financial Modeling Prep&apos;s
          stock-peers endpoint. Nothing is invented — a sparsely-populated local database with no
          FMP key configured will suggest fewer candidates, honestly, rather than fabricating a
          peer list.
        </p>
        <p>Each candidate is scored on five dimensions, each normalized to a 0-1 similarity:</p>
        <ul className="list-inside list-disc space-y-1">
          <li><strong>Industry (weight 30%)</strong> — exact industry match = 1.0, sector-only match = 0.5, neither = 0.0.</li>
          <li><strong>Revenue (20%)</strong> and <strong>Market Cap (20%)</strong> — log-scale distance, since these span orders of magnitude; within the same order of magnitude scores well, roughly 32x apart scores 0.</li>
          <li><strong>Growth (15%)</strong> and <strong>EBITDA Margin (15%)</strong> — linear distance; 50 percentage points apart scores 0.</li>
        </ul>
        <p>
          The five scores are combined with these fixed weights into a single 0-100 total. If a
          dimension can&apos;t be computed for a pair (missing data on either side), it&apos;s dropped and
          the remaining weights are rescaled to sum to 1 — a company with only one year of history
          isn&apos;t unfairly penalized for a gap in Atlas&apos;s data. You always have final control: accept
          a suggestion, remove any peer, search for and add another company manually, or reset back
          to the suggested set.
        </p>
      </Section>

      <Section title="Valuation multiples">
        <pre className="border-ink/10 bg-paper overflow-x-auto rounded-lg border p-3 text-xs">
{`Enterprise Value = Market Cap + Total Debt − Cash
EBITDA = EBIT + D&A (always derived — no filer reports it directly)

EV / Revenue,  EV / EBITDA,  EV / EBIT  — enterprise-value multiples
P / E,  Price / Sales,  Price / Book    — equity-value multiples`}
        </pre>
        <p>
          A multiple is marked <strong>N/M (Not Meaningful)</strong> whenever its denominator is zero
          or negative (negative EBITDA, negative earnings, zero revenue) — never manipulated to
          produce a number anyway. It&apos;s marked missing (&ldquo;—&rdquo;) whenever an underlying input
          (most often EBITDA, which many filers don&apos;t report cleanly enough to derive) isn&apos;t
          available at all. These are structurally distinct outcomes, not both collapsed into a
          blank cell.
        </p>
      </Section>

      <Section title="Outlier handling">
        <p>
          Potential outliers are flagged using Tukey&apos;s IQR method: sort the peer set&apos;s values for
          a multiple, split at the median into a lower and upper half, and take Q1/Q3 as the median
          of each half. IQR = Q3 − Q1; anything outside [Q1 − 1.5×IQR, Q3 + 1.5×IQR] is flagged. This
          is purely a suggestion — flagged companies are never removed automatically. The
          &ldquo;Raw&rdquo; statistics always reflect every selected peer; the &ldquo;Adjusted&rdquo; statistics
          reflect the set after you choose to exclude anything (a flagged outlier or otherwise) —
          and the implied valuation always uses the adjusted median.
        </p>
      </Section>

      <Section title="How is implied valuation calculated?">
        <pre className="border-ink/10 bg-paper overflow-x-auto rounded-lg border p-3 text-xs">
{`EV/Revenue, EV/EBITDA, EV/EBIT:
  Target Metric × Peer Adjusted-Median Multiple = Implied Enterprise Value
  Implied Enterprise Value + Cash − Total Debt = Implied Equity Value

P/E:
  Target Net Income × Peer Adjusted-Median P/E = Implied Equity Value (directly)

Implied Equity Value ÷ Diluted Shares Outstanding = Implied Share Price`}
        </pre>
        <p>
          The equity bridge (Enterprise Value → Equity Value → Implied Share Price) reuses the exact
          same formulas as Atlas&apos;s DCF engine — it&apos;s the same bridge regardless of whether the
          Enterprise Value came from a discounted cash flow or a peer multiple. A methodology is
          marked Not Meaningful whenever the target&apos;s own base metric (revenue, EBITDA, EBIT, or
          net income) is missing or non-positive, or the peer median itself isn&apos;t available — never
          silently substituted. The &ldquo;Median Implied Price&rdquo; shown in the summary is the median
          across only the meaningful methodologies, never a blend of them.
        </p>
      </Section>

      <Section title="Known limitations">
        <ul className="list-inside list-disc space-y-1">
          <li>Peer discovery depends on Atlas&apos;s own database and (optionally) an FMP API key — without either, the suggested-peer list may be small or empty, and every peer needs to be added manually.</li>
          <li>Enterprise Value nets out cash and total debt only; minority interest and preferred stock aren&apos;t stored yet, so they aren&apos;t netted (the same limitation the DCF engine documents).</li>
          <li>Historical multiples (current vs. historical median/range) aren&apos;t available yet — Atlas stores only the latest stock quote, not a price history. See the Historical Multiples section on the comps page for the planned architecture.</li>
          <li>EBITDA is always derived (EBIT + D&amp;A); a filer that doesn&apos;t cleanly report D&amp;A will show EBITDA-based multiples as missing rather than an estimate.</li>
          <li>Peer candidates are capped (20 fetched, 15 ranked) to bound how many external requests one page load can trigger.</li>
        </ul>
      </Section>
    </main>
  );
}
