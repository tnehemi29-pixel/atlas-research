/**
 * Historical multiples (current vs. historical median/range) require a
 * time series of historical share price / market cap, which Atlas Research
 * doesn't retrieve yet — companyService only stores a single latest-quote
 * snapshot (see prisma/schema.prisma's Company model comment), not a price
 * history table. Rather than fabricate a trend from one data point, this
 * section is intentionally left as an honest "not yet available" panel.
 *
 * The architecture is ready for it: once a historical-price time series
 * exists (a new `PriceHistory` model + a provider call), computing
 * historical EV/Revenue, EV/EBITDA, and P/E is just `computeCompanyMultiples`
 * (lib/comps/multiples.ts) applied to each historical (price, financial
 * period) pair instead of only the latest one — the multiple formulas
 * themselves need no changes at all.
 */
export function HistoricalMultiplesPanel() {
  return (
    <section className="mt-8">
      <h2 className="text-ink font-serif text-lg font-semibold">Historical Multiples</h2>
      <div className="border-ink/10 bg-paper text-ink/50 mt-3 rounded-xl border p-6 text-sm">
        <p>
          Not yet available. Atlas Research currently stores only the latest stock quote for each
          company, not a historical price series — so a current-vs-historical multiple comparison
          (e.g. &ldquo;is this trading above or below its 5-year median EV/EBITDA?&rdquo;) can&apos;t be
          computed without fabricating a trend from a single data point.
        </p>
        <p className="mt-2">
          The calculation itself is already in place —{' '}
          <code className="text-ink/70 bg-accent-soft rounded px-1 py-0.5 text-xs">computeCompanyMultiples</code> in{' '}
          <code className="text-ink/70 bg-accent-soft rounded px-1 py-0.5 text-xs">lib/comps/multiples.ts</code> works
          on any (price, financial period) pair, not just the latest one. This panel will populate
          once a historical price time series is added to the data layer.
        </p>
      </div>
    </section>
  );
}
