import type { Metadata } from 'next';
import Link from 'next/link';

export const dynamic = 'force-static';

export const metadata: Metadata = { title: 'Historical Backtesting Methodology · Atlas Research' };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="text-ink font-serif text-base font-semibold">{title}</h2>
      <div className="text-ink/70 mt-2 space-y-2 text-sm leading-relaxed">{children}</div>
    </section>
  );
}

export default function ResearchBacktestMethodologyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/research-backtest" className="text-accent text-sm hover:underline">
        ← Back to Historical Backtesting
      </Link>
      <h1 className="text-ink mt-3 font-serif text-2xl font-semibold">How Historical Backtesting Works</h1>
      <p className="text-ink/60 mt-2 text-sm">
        This is a RESEARCH AND VALIDATION system, not an automated trading system. It tests whether Atlas&apos;s
        financial signals, valuation methodologies, and research indicators would have been useful historically — it
        never recommends a trade, and no historical relationship shown here is a guarantee of future performance.
      </p>

      <Section title="Preventing look-ahead bias — the core requirement">
        <p>
          At any historical &ldquo;as of&rdquo; date, every calculation uses only information that would actually
          have been available then: financial periods are visible only once their SEC filing date is on or before
          that date (never the fiscal period-end date, which an analyst could not have acted on before the filing
          existed), and prices are the actual historical closing price on or before that date, never a later or
          current price.
        </p>
        <p>
          A financial period&apos;s stored VALUE still reflects Atlas&apos;s latest-known filing for that period.
          If the underlying data was later restated, this system has no way to detect or exclude the restatement,
          because Atlas does not persist an append-only filing history — this is a disclosed limitation, not a
          silently-accepted gap.
        </p>
      </Section>

      <Section title="Data vintages, historical prices, and benchmarks">
        <p>
          Historical daily price bars are cached from a market-data provider behind a swappable abstraction layer —
          Atlas is not locked to one vendor. The benchmark defaults to SPY, a practical S&amp;P 500 proxy (the raw
          index itself is unreliable on the underlying provider&apos;s free tier) — always labeled as a proxy, never
          presented as the index itself.
        </p>
        <p>
          Every forward return shown alongside a signal or valuation gap is reported four ways: the raw (gross)
          return, that return net of a disclosed default 20bps round-trip transaction cost (10bps commission + 10bps
          slippage — never assumed frictionless), the benchmark&apos;s own return over the same window, and the
          excess return (asset − benchmark).
        </p>
      </Section>

      <Section title="Valuation validation and DCF forecast validation">
        <p>
          The Valuation tab recomputes a full DCF, point-in-time, at each sampled date (monthly, capped at 120
          samples per request) and compares the implied fair value against the actual market price — then reports
          what actually happened to the price over the next 1/3/6/12 months. It never assumes a valuation gap
          converges; it only reports the observed outcome.
        </p>
        <p>
          The DCF Forecasts tab compares every point-in-time forecast this company has ever supported (revenue,
          operating margin, and unlevered free cash flow) against what was later actually reported for that fiscal
          year — Forecast Error = Actual − Forecast — and only scores a forecast year once it has actually been
          reported.
        </p>
      </Section>

      <Section title="Financial signals, events, and research events">
        <p>
          The Financial Signals tab investigates whether historical relationships exist between financial changes
          (revenue acceleration/deceleration, margin expansion/contraction, FCF growth, debt reduction, guidance
          changes) and subsequent returns — a signal only fires once the underlying change clears the same
          centralized materiality thresholds Milestone 11 uses, and its date is the date the underlying filing or
          event actually happened, never when Atlas detected it.
        </p>
        <p>
          The Events tab runs a simple market-adjusted event study (Abnormal Return = Stock Return − Benchmark
          Return over the same trading-day window) around earnings calls or any Milestone 11 research event type,
          using windows of [-1,+1], [-3,+3], and [-5,+5] trading days.
        </p>
        <p>
          The Research Events tab connects Milestone 11&apos;s detected research events directly to subsequent
          market outcomes. This module never implies causality — results are always phrased as &ldquo;companies
          experiencing this event had an average subsequent return of X% across N observations,&rdquo; never
          &ldquo;this event causes stocks to move.&rdquo;
        </p>
      </Section>

      <Section title="Valuation spread analysis">
        <p>
          The Valuation Spread tab compares a company&apos;s own point-in-time EV/EBITDA multiple against its peer
          group&apos;s median multiple. The company&apos;s own multiple is genuinely point-in-time; the peer-median
          multiple is CURRENT data, not historical, because building a parallel point-in-time comps engine for every
          peer company was out of scope for this milestone. This is loudly disclosed, not hidden — treat the
          resulting spread as directional, not a precise historical reconstruction.
        </p>
      </Section>

      <Section title="Robustness, out-of-sample testing, and walk-forward validation">
        <p>
          Financial-signal and research-event results can optionally be segmented by calendar year and by
          point-in-time market-cap bucket, so a result is never presented as if it held uniformly across every period
          and company size. Sector and market-regime (bull/bear/volatility) segmentation are not implemented — Atlas
          has no point-in-time sector classification or regime-label series, and segmenting by a company&apos;s
          CURRENT sector or a CURRENT regime label would misrepresent historical conditions.
        </p>
        <p>
          Out-of-sample mode runs the exact same fixed methodology independently over a training range and a testing
          range and labels each result accordingly. Walk-forward mode uses an expanding training window (always
          starting at the full range&apos;s own start) and reports only each step&apos;s held-out test-window result.
          This milestone has no parameter that is ever fit or tuned to data (see below), so walk-forward here
          validates the temporal STABILITY of one fixed methodology across periods, not classical protection against
          parameter overfitting.
        </p>
      </Section>

      <Section title="No strategy optimization">
        <p>
          This system never searches parameter combinations, optimizes a threshold for the best-looking result,
          selects the best-performing time period, or cherry-picks companies. Every materiality threshold, spread
          bucket boundary, transaction-cost default, and sampling cap is fixed, disclosed configuration — the goal is
          validation, not curve-fitting a strategy to history.
        </p>
      </Section>

      <Section title="Known limitations">
        <ul className="list-inside list-disc space-y-1">
          <li>
            Restated financial data: a period&apos;s stored value may reflect a later restatement even though the
            period&apos;s existence is correctly gated by its original filing date.
          </li>
          <li>DCF WACC uses the company&apos;s CURRENT beta — no historical beta time series exists.</li>
          <li>
            Results may contain survivorship bias — Atlas has no data source for companies that have since been
            delisted or gone private.
          </li>
          <li>The Valuation Spread tab&apos;s peer-median multiple is current data, not point-in-time.</li>
          <li>Monthly sampling is capped at 120 dates per request to bound live computation cost.</li>
          <li>
            Event-study abnormal return uses a simple market-adjusted model (stock return − benchmark return), not a
            beta-adjusted market-model regression.
          </li>
        </ul>
      </Section>
    </main>
  );
}
