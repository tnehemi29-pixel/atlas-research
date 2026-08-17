# Research Intelligence (Milestone 11)

This document explains how Atlas Research detects, classifies, and surfaces changes across the
companies a user follows. It's a companion to the [main README](../README.md#automated-research-change-detection--intelligence-feed-architecture-milestone-11),
written for someone evaluating the methodology on its own — a reviewer, an interviewer, or a future
contributor who wants the full picture without reading source code first.

The purpose of this milestone, stated plainly: **detect a change, explain it, trace it back to a
real source, and connect it to the areas of existing research it might touch.** It is explicitly not
a signal generator. Atlas never tells you to buy, sell, or that a thesis is right or wrong.

## 1. Event lifecycle

Every research event moves through the same seven stages, regardless of what triggered it:

```
Company followed/viewed
        │
        ▼
1. New Data Detected     — a followed or viewed company's Company.researchEventsSyncedAt
                            is stale (>24h); lib/services/researchEventFeedService.ts triggers
                            runResearchEventDetection(ticker)
        │
        ▼
2. Data Classification    — 8 independent detectors each read one already-existing Milestone
                            1-10 data source (financials, guidance, DCF, comps, filings, 8-Ks,
                            earnings calls, filing-comparison risks, report versions)
        │
        ▼
3. Change Detection        — each detector diffs the current value against the last known value,
                            using one shared, deterministic formula (lib/analytics/ratios.ts's
                            growthRate) — never an LLM
        │
        ▼
4. Materiality Assessment — the change's magnitude is classified LOW/MEDIUM/HIGH/CRITICAL
                            against lib/researchEvents/materialityConfig.ts's centralized
                            thresholds
        │
        ▼
5. Source Verification    — the event is only ever created alongside at least one
                            ResearchEventSource pointing at a real SecFiling/EarningsCall/
                            ResearchReport/financial-data row — never a free-floating claim
        │
        ▼
6. AI Explanation          — ONLY for HIGH/CRITICAL events: the model explains what changed and
                            why it might matter, using only the numbers already computed in
                            steps 3-4. LOW/MEDIUM events skip this step entirely (cost control).
        │
        ▼
7. Feed / Alert            — the event appears in every following user's personalized
                            /research-feed, the company's public /timeline, and — if it clears a
                            configured alert's own criteria — a triggered ResearchAlert
```

Steps 1-5 are fully deterministic and always run. Step 6 is optional and materiality-gated. An event
that never reaches step 6 (because it's LOW/MEDIUM, or because the AI call fails) is still complete
and fully usable — it has its title, description, deterministic changes, deterministic research-area
impacts, and sources. AI narrative is additive, never load-bearing.

## 2. Materiality methodology

Materiality answers one question: **is this change big enough to be worth a user's attention?**
Every threshold lives in one file — `lib/researchEvents/materialityConfig.ts` — so the methodology is
auditable in one place rather than scattered across eight detectors.

The general rule: a magnitude is classified against three cutoffs (`mediumAt`, `highAt`,
`criticalAt`); below `mediumAt` it's LOW (recorded, but never triggers AI or an alert).

| Signal | Unit | MEDIUM at | HIGH at | CRITICAL at |
|---|---|---|---|---|
| Revenue / EPS / FCF / debt / cash / shares | % change | 5% | 15% | 30% |
| Gross / operating / net margin | bps change | 100 | 300 | 600 |
| Guidance midpoint | % change | 3% | 7% | 20% |
| DCF implied share price (Base case) | % change | 5% | 12% | 25% |
| Peer-median EV/EBITDA | % change | 5% | 15% | 25% |

SEC filings and 8-Ks don't use magnitude thresholds — they reuse Milestone 7's own rule-based
`lib/sec/importance.ts` (Low/Medium/High by form type and item codes) and
`lib/sec/eightKItems.ts`'s category table, mapped onto this milestone's four-tier scale. A handful of
8-K categories that Milestone 7 had no reason to rank above "High" are explicitly promoted to
CRITICAL here: `BANKRUPTCY_RESTRUCTURING` and `LEGAL_EVENT`.

When one event is driven by several contributing numbers at once (e.g. a "FY2025 financial results"
event covering revenue, EPS, FCF, debt, cash, and shares in one row), its overall materiality is the
**maximum** of every contributing change's own materiality — a severe EPS beat is never diluted by
averaging it against a flat share count.

**Worked examples**, matched exactly by `lib/researchEvents/changeDetection.test.ts` and
`materialityConfig.test.ts`:

- Revenue $10.0B → $11.0B = **+10.0%** → clears MEDIUM (5%), not HIGH (15%) → **MEDIUM**
- Operating margin 22% → 19% = **-300 bps** → exactly at the HIGH cutoff → **HIGH**
- DCF implied price $150 → $132 = **-12.0%** → exactly at the HIGH cutoff → **HIGH**
- Guidance midpoint $10.5B → $11.0B = **+4.8%** → clears guidance's own MEDIUM cutoff (3%), not
  HIGH (7%) → **MEDIUM**

## 3. Source hierarchy & confidence

Every event's `confidence` field (`HIGH`/`MEDIUM`/`LOW`) reflects how directly its source data
supports the claim — **never** a prediction about the future, and never implied certainty about what
happens next:

- **HIGH** — a direct structured disclosure or already-validated calculation: financial statement
  data (SEC EDGAR XBRL), guidance figures (earnings-call transcript), DCF/comps outputs (Atlas's own
  deterministic engines), a filing's existence and item codes.
- **MEDIUM** — an AI-derived interpretation of unstructured text: specifically, a "new risk"
  detected by Milestone 7's own filing-comparison AI call. This is read-only reuse (never triggers a
  new AI comparison) but the underlying identification is itself an LLM judgment, so it's ranked
  below a direct structured fact.
- **LOW** — not currently produced by any detector in this milestone; reserved for a future,
  lower-confidence signal (e.g. a language-tone shift) that the spec anticipates but this milestone
  doesn't yet implement.

Every event carries at least one `ResearchEventSource`, each one a typed pointer into a real
Milestone 1-10 record (`secFilingId`, `earningsCallId`, or `researchReportId`) or, for
financial-data/valuation events with no single row to point at, a labeled description ("FY2025 annual
financial statements — SEC EDGAR", "Atlas DCF Model — Base case, default assumptions"). There is no
code path that creates a `ResearchEvent` without also creating its source in the same call.

## 4. AI usage — what the model does and does not do

The AI layer (`lib/ai/explainResearchEvent.ts`, `lib/ai/researchEventPrompts.ts`,
`lib/ai/researchEventSchema.ts`) is invoked exactly once per qualifying event, after every number is
already final. Its system prompt states the rules explicitly:

- Use only the information given in the event context — never invent a fact, figure, quote, or cause.
- Never output "Buy", "Sell", "Strong Buy", "Strong Sell", or any investment recommendation.
- Never claim a DCF, comps model, or research thesis has been "changed" or "broken" — only that
  something is "potentially affected" or "potentially inconsistent with" a prior assumption.
- `affected_research_areas` may only contain values from the closed list already given in the
  prompt (the same list the deterministic impact mapping uses) — never a new, invented category.
- `confidence` reflects how well the given data supports the explanation, not a forecast.

The structured output — `summary`, `why_it_matters`, `affected_research_areas`,
`questions_to_investigate`, `confidence` — is validated against a zod schema before it's ever stored;
a response that doesn't validate is treated as a failure (`aiStatus: 'FAILED'`), not silently
accepted with missing fields.

**Cost control** is structural, not a runtime check that could be forgotten: `persistCandidate()`
only calls `explainResearchEvent()` when `shouldRunAiAnalysis(candidate.materiality)` is true — i.e.
HIGH or CRITICAL — and `isAiConfigured()` returns true. Every AI call's model name and input/output
token counts are stored directly on the `ResearchEvent` row it explained
(`aiModel`/`aiInputTokens`/`aiOutputTokens`), which is sufficient to compute total spend without a
separate cost-tracking table.

## 5. Thesis monitoring

A saved research report captures a point-in-time view: at generation time, its DCF Base case assumed
some revenue trajectory, some operating margin, some WACC; its aggregated earnings-call context
carried whatever guidance existed then. The Thesis Monitor's job is to periodically ask: **does the
world still look like what this report assumed?**

**Extraction** (`lib/services/thesisMonitorService.ts`'s `deriveThesisAssumptions`) is a pure function
over the report's own already-stored content — no new calculation, no LLM. It reads:

| Assumption | Read from |
|---|---|
| Revenue CAGR | Implied from the DCF Base case's final-year revenue vs. the report's own latest historical revenue, over the DCF's own forecast horizon |
| Operating Margin | DCF Base case, final forecast year |
| FCF Margin | DCF Base case final-year unlevered FCF ÷ final-year revenue |
| WACC | DCF Base case |
| Terminal Growth Rate | DCF Base case (backfilled from the exit multiple's implied growth when that terminal-value method was used) |
| Revenue Guidance | The report's own aggregated latest earnings-call guidance, matched by metric label containing "revenue" |

Any assumption whose inputs aren't present in a particular report — no revenue history, no DCF, no
guidance — is simply **omitted from the list**, never filled in with a guessed or zero value.

**Comparison** happens against the best currently-available live data: current trailing revenue
growth/operating margin/free-cash-flow margin, a freshly-run WACC, or — for revenue guidance
specifically — the most recent `GUIDANCE_CHANGE` research event's own recorded new value (linking the
comparison directly to a traceable, source-backed event). A comparison is only ever recorded when a
live value is actually available; when it isn't, the assumption's `latestComparison` is simply `null`
— never a fabricated "no change" result standing in for missing data.

Each comparison stores both the original assumption value and the new live value, their absolute and
percent difference, and a boolean `flagged` — true when the drift clears a per-assumption threshold
in `materialityConfig.ts`'s `ASSUMPTION_FLAG_THRESHOLDS` (e.g. WACC moving ≥50bps, revenue guidance
moving ≥3%). The `note` text is programmatically generated from one of exactly two templates:

- Flagged: *"Potentially inconsistent with a prior research assumption: {label} was assumed at
  {value}, live data now shows {value}."*
- Not flagged: *"Consistent with the prior research assumption for {label}."*

Neither template — nor any other code path in this service — can produce the phrase "thesis broken"
or any other verdict on whether the original research call was correct. The underlying DCF, comps, or
report content is never modified by this service; it only ever reads a report and writes
`AssumptionComparison` rows.

## 6. Known limitations

See the [README's own Known Limitations section](../README.md#known-limitations-milestone-11) for
the complete list. The most consequential for anyone extending this milestone:

- **No real background job queue.** Detection is triggered lazily, gated by a 24-hour TTL, the same
  pattern every prior Atlas milestone already uses for its own "sync on view" behavior. A company
  nobody has viewed recently simply won't have fresh events until the next view.
- **DCF/comps monitoring is top-line only.** The spec's "which input drove the DCF change" breakdown
  isn't implemented — Atlas's DCF/comps engines don't currently expose a per-input attribution for a
  period-over-period delta, only the final output number.
- **Exit Multiple isn't a tracked thesis assumption** — the underlying report snapshot only ever
  stores a terminal *growth rate* (even when the DCF used an exit-multiple method internally), so
  extracting the raw multiple honestly would require a Milestone 9 schema change that was out of
  scope here.
