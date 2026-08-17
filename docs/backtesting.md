# Historical Backtesting & Research Validation (Milestone 12)

This document explains how Atlas Research's Historical Backtesting & Research Validation Engine
works. It's a companion to the [main README](../README.md#historical-backtesting--research-validation-engine-architecture-milestone-12),
written for someone evaluating the methodology on its own — a reviewer, an interviewer, or a future
contributor who wants the full picture without reading source code first.

Stated as plainly as the spec itself states it: **this is a research and validation system, not an
automated trading system.** It tests whether Atlas's financial signals, valuation methodologies, and
research indicators would have been useful historically. It never recommends a trade, and no
historical relationship it surfaces is presented as a guarantee of future performance.

## 1. The core requirement: no look-ahead bias

Every other design decision in this milestone is downstream of one rule: **at any historical "as of"
date, only information that would actually have been available at that date is ever used.**

The mechanism is deliberately simple and lives in one place —
`lib/backtest/pointInTimeValuation.ts`'s `filterPeriodsAsOf(periods, asOfDate)`:

```ts
export function filterPeriodsAsOf(periods, asOfDate) {
  const normalizedAsOfDate = toDateOnly(asOfDate);
  return periods.filter(
    (p) => p.periodType === 'annual'
      && p.filingDate !== null
      && toDateOnly(p.filingDate) <= normalizedAsOfDate
  );
}
```

A financial period is only visible as of a given date if its *filing date* — not its fiscal
period-end date — is on or before that date. An analyst on January 3, 2022 could not have acted on a
10-K covering fiscal year 2021 that wasn't actually filed until February. A period with an unknown
(`null`) filing date is excluded too, conservatively: "might not have been available" is treated the
same as "wasn't available." Historical prices follow the identical convention —
`historicalPriceService.ts`'s `getPriceAsOf(ticker, asOfDate)` returns the nearest trading-day close
on or before that date, never a future or current price, and `getForwardReturn()` returns `null`
rather than a stale reused price when a horizon hasn't actually elapsed yet.

### A real bug this discipline caught

`FinancialPeriodData.filingDate`, as returned by `financialDataService.ts` (`filingDate.toISOString()`),
is a full ISO timestamp (`"2019-01-01T00:00:00.000Z"`), not a plain `YYYY-MM-DD` string. Two problems
followed from that mismatch, both found during this milestone's own live browser verification rather
than in unit tests (whose hand-written fixtures always used clean date strings, masking the issue):

1. **A subtle correctness bug.** String-comparing a full timestamp against a plain date
   (`"2022-01-01T00:00:00.000Z" <= "2022-01-01"`) is false even when the period was filed on the exact
   date being evaluated, because the shorter string is a prefix of the longer one and therefore
   compares as "less than" it.
2. **A crash.** Code that took a period's `filingDate` and fed it directly into date-arithmetic
   helpers (`addDays`/`addMonths`, used to look up a price or compute a forward-return target date)
   double-concatenated a `T00:00:00.000Z` suffix onto an already-full timestamp, producing an invalid
   `Date` and a `RangeError: Invalid time value`.

The fix: `historicalPriceService.ts` exports `toDateOnly(dateStr)`, which normalizes any ISO-ish
string to its first 10 characters — a no-op on an already-clean date, and the correct fix for a full
timestamp. `filterPeriodsAsOf` normalizes both sides before comparing; every call site in
`backtestService.ts` that takes a period's `filingDate` and uses it as a date argument normalizes it
first. This is the kind of bug that is invisible in isolated unit tests (which control their own
fixture data) and only surfaces when the full pipeline runs against real data — which is exactly why
this milestone's final verification pass includes a live browser check against real SEC-filed data,
not just a green test suite.

### What this discipline does *not* solve

Excluding not-yet-filed **periods** is the load-bearing protection. It does not protect against a
period being **restated** after the historical date being evaluated: Atlas's Milestone 3 ingestion
pipeline is "latest-filed-wins, fully rebuilt on refresh," not an append-only fact history, so a
period's stored *value* always reflects whichever filing Atlas currently has on record for it. If
that period was restated after `asOfDate`, this system has no way to detect or exclude the
restatement. This is disclosed everywhere a point-in-time result is shown — in code comments, in
every historical snapshot's own `limitations` array, and in the UI's persistent Limitations panel —
rather than silently accepted as solved.

## 2. Data layer

`HistoricalPriceBar` is the one new persisted table this milestone needs. Everything else —
point-in-time DCFs, signal detection, event windows, spread analysis — is computed fresh from data
Milestones 1-11 already store, the same "no separate materialization job to keep in sync" philosophy
every prior milestone's own read paths use.

Historical prices are fetched and cached through a provider abstraction
(`lib/providers/marketData/`'s `MarketDataProvider` interface, currently backed by one FMP
implementation) so Atlas is never locked to a single vendor. The benchmark defaults to `SPY`, a
practical S&P 500 proxy — FMP's free tier serves the raw `^GSPC` index unreliably, so the SPDR S&P 500
ETF trust is used instead and always labeled as a proxy, never presented as the index itself.

`historicalSnapshotService.ts`'s `getSnapshotAsOf(ticker, asOfDate)` assembles "what Atlas knew" at a
historical date entirely from existing reads — filings, earnings calls, research events, financials,
price, and a point-in-time DCF, each filtered to `<= asOfDate`. It deliberately **omits**
comparable-company data rather than populate it with today's peer multiples under a misleading "as
of" label, since Atlas has no point-in-time peer-group fundamentals engine. The Valuation Spread
analysis (section 5 below) makes a different, narrower, explicitly-flagged compromise for that one
specific feature — the general-purpose snapshot stays conservative.

## 3. Valuation validation & DCF forecast validation

**Valuation validation** answers: *if you'd compared Atlas's DCF to the market price on some past
date, what actually happened to the price afterward?* At each monthly-sampled date in a range, a full
DCF is recomputed using only periods filed by that date and the actual historical price on that date
(reusing Milestone 5's engine completely unchanged — only the inputs differ). The result reports the
premium/discount and the subsequent 1/3/6/12-month return — it never assumes the gap converges, it
only reports what happened.

**DCF forecast validation** answers a different question: *how accurate were Atlas's own forecasts,
historically?* For every annual filing date a company has, a point-in-time DCF's forecast (revenue,
operating margin, unlevered free cash flow) is compared against what was later actually reported for
that fiscal year: `Forecast Error = Actual - Forecast`, `Forecast Error % = Forecast Error / Forecast`.
A forecast year is only scored once it has actually been reported — never against a fabricated
"actual" for a year that hasn't happened yet. The "actual" side of the FCF comparison uses the exact
same unlevered-FCF formula the forecast itself uses (not the reported, levered free-cash-flow line),
so the comparison is apples-to-apples.

## 4. Financial signals, event studies, and research-event outcomes

**Financial signal validation** investigates historical relationships between eight signal types and
subsequent returns: revenue acceleration/deceleration (a *growth-of-growth* comparison — this
period's YoY growth rate against the prior period's, not simply "did revenue grow"), margin
expansion/contraction, FCF growth, debt reduction, and guidance increase/decrease. A signal only
fires once the underlying change clears Milestone 11's own centralized materiality thresholds — a
trivial, immaterial change never counts. Guidance signals reuse Milestone 11's already-detected
`GUIDANCE_CHANGE` events directly rather than re-deriving guidance direction from scratch.

**Event studies** compute a plain market-adjusted abnormal return — `Stock Return - Benchmark Return`
over the same trading-day window — around earnings calls or any Milestone 11 research-event type,
using `[-1,+1]`, `[-3,+3]`, and `[-5,+5]`-trading-day windows. This is a deliberately simple,
disclosed methodology choice, not a beta-adjusted market-model regression. Windows are found by
counting actual price rows around the event's own nearest trading day, so weekends and holidays never
misalign the window the way calendar-day arithmetic would.

**Research-event outcome validation** is the general-purpose version: it connects *any* Milestone 11
event type directly to subsequent market outcomes. Its methodology text is unit-tested to always
phrase results as "companies experiencing this event had an average subsequent return of X% across N
observations" and never imply causality ("this event causes stocks to move").

## 5. Valuation spread analysis

Compares a company's own point-in-time EV/EBITDA multiple against its peer group's multiple. The
target side is genuinely point-in-time (EV from point-in-time market cap + debt - cash; EBITDA from
point-in-time operating income + D&A). The peer side is **current** data — building a parallel
point-in-time comps engine for every peer company was out of scope for this milestone. This is
disclosed as a persistent, structured field on the result (`peerDataIsCurrentNotHistorical: true`),
not just a sentence in a methodology array a UI could omit. Discount/Neutral/Premium buckets use
configurable thresholds, defaulting to ±15% of the peer median — the spec's own worked example (12x
company vs. 18x peer median = -33% = Discount) is exercised directly in `valuationSpread.test.ts`.

## 6. Benchmark returns, excess returns, and transaction costs

Every forward-return observation across all five analyses above — valuation validation, financial
signals, event studies (which already had their own abnormal-return concept), research-event
outcomes, and valuation spread — carries four figures, computed together by one shared
`buildForwardOutcome()` helper in `backtestService.ts`:

- the raw (gross) return,
- that return net of a disclosed default 20bps round-trip transaction cost (10bps commission + 10bps
  slippage — never assumed frictionless, per the spec's explicit "do not assume zero friction
  automatically"),
- the benchmark's own return over the identical window, and
- the excess return (asset return minus benchmark return).

This is worth calling out because the pure math for it (`lib/backtest/returns.ts`'s `excessReturn`
and `applyTransactionCosts`) was built and unit-tested early in the milestone but not actually wired
into any result until a later review — a gap between "the function exists and is tested in isolation"
and "the function is actually used" that's easy to miss when building bottom-up. It was found and
fixed before the frontend was built, specifically because the frontend's own Results panel needed
these fields to exist.

## 7. Robustness segmentation

Any dated observation set can be segmented two ways: by calendar year, and by point-in-time
market-cap bucket (small/mid/large/mega, matching the company's market cap at the time of the
observation, not today's). These are the two axes Atlas can support "where data permits." Sector and
market-regime (bull/bear/volatility) segmentation are **not implemented** — Atlas has no point-in-time
sector classification or regime-label time series, and segmenting by a company's *current* sector or
a *current* regime label would misrepresent historical conditions rather than genuinely test
robustness across them. This is a disclosed scope limitation, stated directly in the segmentation
result's own methodology text, not a silent omission.

## 8. Out-of-sample testing and walk-forward validation

**Out-of-sample mode** runs the exact same fixed methodology independently over a training date range
and a testing date range, and labels each result IN-SAMPLE / OUT-OF-SAMPLE. The two results are never
blended into one combined statistic, and — because this milestone has no tunable parameter to begin
with (every materiality threshold, spread bucket boundary, and transaction-cost default is fixed,
disclosed configuration per the spec's "no strategy optimization" requirement) — there is nothing to
fit on the training range in the first place.

**Walk-forward mode** builds an *expanding* window schedule: the training window always starts at the
full range's own beginning and only grows; the test window slides forward one step at a time. Each
step reports only its own held-out test-window result — a training window's performance is never
shown as if it were out-of-sample. Because there is no parameter that ever gets fit to a training
window, walk-forward here validates the temporal **stability** of one fixed methodology across
different historical periods, not classical protection against parameter overfitting in the sense the
term usually carries in strategy research. This nuance is worth stating explicitly rather than
implying a stronger guarantee than the design actually provides.

## 9. Statistical rigor

Every return distribution in this milestone — regardless of which analysis produced it — is
summarized by exactly one function, `lib/backtest/statistics.ts`'s `summarizeDistribution()`: sample
count, mean, median, sample standard deviation, positive-outcome rate, and a 95% confidence interval
via a normal approximation. Below five observations, the confidence interval is withheld and an
`insufficientData` flag is set, so a caller shows "Insufficient observations for meaningful
statistical inference" instead of a number that implies more confidence than the sample supports.
This one convention means "average return" and "N observations" mean exactly the same thing on every
tab of the `/research-backtest` workspace.

## 10. Known limitations

- A financial period's stored value reflects Atlas's latest-known filing for that period; a
  restatement after the historical date being evaluated cannot be detected or excluded (section 1).
- DCF WACC uses the company's current beta — no historical beta time series exists.
- Results may contain survivorship bias: Atlas has no data source for companies that have since been
  delisted or gone private.
- Valuation Spread's peer-median multiple is current data, not point-in-time (section 5).
- Monthly sampling is capped at 120 dates per request to bound live computation cost; a request whose
  range would need more is honestly flagged as capped, not silently truncated.
- Event-study abnormal return uses a simple market-adjusted model, not a beta-adjusted market-model
  regression (section 4).
- Only calendar-year and market-cap-bucket robustness segmentation are implemented — no sector or
  market-regime segmentation (section 7).
- The underlying service functions accept a `tickers: string[]` array, so watchlist-wide pooling is
  architecturally supported, but the current `/research-backtest` UI only drives them with one
  selected company at a time.
