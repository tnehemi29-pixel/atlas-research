import type { Metadata } from 'next';
import Link from 'next/link';

export const dynamic = 'force-static';

export const metadata: Metadata = { title: 'Portfolio Methodology · Atlas Research' };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="text-ink font-serif text-base font-semibold">{title}</h2>
      <div className="text-ink/70 mt-2 space-y-2 text-sm leading-relaxed">{children}</div>
    </section>
  );
}

export default function PortfolioMethodologyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/portfolio" className="text-accent text-sm hover:underline">
        ← Back to portfolio
      </Link>
      <h1 className="text-ink mt-3 font-serif text-2xl font-semibold">How Portfolio Calculations Work</h1>
      <p className="text-ink/60 mt-2 text-sm">
        Atlas Research is a manual portfolio tracker, not a brokerage — every figure below is computed from the
        shares and average cost you enter, plus the same live price/fundamentals data every other Atlas page uses.
      </p>

      <Section title="Manual tracking, not a brokerage connection">
        <p>
          Atlas never connects to a brokerage account and never executes a trade. A holding is simply a record you
          maintain: ticker, shares, average cost, an optional purchase date, and notes. Editing a holding replaces
          its shares/average cost directly — if you buy more of a position later, you compute the new blended
          average cost yourself and update the holding, the same way you would in a basic tracking spreadsheet.
        </p>
      </Section>

      <Section title="The core formulas">
        <pre className="border-ink/10 bg-paper overflow-x-auto rounded-lg border p-3 text-xs">
{`Market Value        = Shares × Current Price
Cost Basis           = Shares × Average Cost
Unrealized Gain/Loss = Market Value − Cost Basis
Unrealized Return    = Unrealized Gain/Loss ÷ Cost Basis
Portfolio Weight     = Holding Market Value ÷ Total Portfolio Market Value`}
        </pre>
        <p>
          The current price comes from the same company data every Atlas page shares (Milestone 2) — never fetched
          or cached separately per user, so viewing the same ticker across many users&apos; portfolios never
          multiplies external API requests.
        </p>
      </Section>

      <Section title="Edge cases — handled explicitly, never guessed">
        <ul className="list-inside list-disc space-y-1">
          <li>
            <strong className="text-ink">Zero cost basis</strong> (e.g. gifted shares): the return is mathematically
            undefined, so Atlas shows &ldquo;—&rdquo; rather than dividing by zero.
          </li>
          <li>
            <strong className="text-ink">Missing current price</strong>: that holding&apos;s market value, weight,
            and gain/loss show &ldquo;—&rdquo;, and the portfolio summary notes that totals reflect only holdings
            with a known price — the total is never silently understated without explanation.
          </li>
          <li>
            <strong className="text-ink">Fractional shares</strong>: supported directly — every formula above is
            plain multiplication/division, no rounding to whole shares anywhere.
          </li>
        </ul>
      </Section>

      <Section title="Allocation and concentration">
        <p>
          Sector and industry allocation group holdings by their current company classification and sum market
          value within each group. A slice above 35% of the portfolio is flagged with the neutral note &ldquo;High
          concentration relative to the rest of the portfolio&rdquo; — Atlas never labels an allocation as
          objectively good or bad, only relatively large.
        </p>
      </Section>

      <Section title="Weighted portfolio fundamentals">
        <p>
          Weighted Revenue Growth, Operating Margin, FCF Margin, EV/EBITDA, and P/E are each a market-value-weighted
          average across holdings. A holding missing the underlying figure — or with a not-meaningful multiple
          (e.g. negative earnings making P/E undefined) — is excluded from that specific average rather than
          counted as zero, so one incomplete holding can never silently drag a portfolio-level average toward a
          number the data doesn&apos;t actually support.
        </p>
      </Section>

      <Section title="Valuation Monitor — reused engines, never recalculated">
        <p>
          The DCF-implied price and comps-implied price shown for each holding are produced by re-running the exact
          same DCF and comparable-company engines (Milestones 5/6) the Valuation and Comparable Companies pages use
          — with their own default assumptions and auto-selected peer set. Nothing here is a separate or
          simplified calculation, and nothing here is a buy/sell recommendation; it is a neutral point of
          comparison against the current price.
        </p>
      </Section>

      <Section title="Known limitations">
        <ul className="list-inside list-disc space-y-1">
          <li>One default portfolio per user (&ldquo;Personal Portfolio&rdquo;) — multiple named portfolios aren&apos;t exposed in this milestone&apos;s UI.</li>
          <li>No transaction/lot history — a holding stores a single blended shares/average-cost pair, not individual purchase lots.</li>
          <li>&ldquo;Historical Multiple&rdquo; in the Valuation Monitor is always &ldquo;Not available&rdquo; — Atlas has no stored multiple time series to compare against.</li>
        </ul>
      </Section>
    </main>
  );
}
