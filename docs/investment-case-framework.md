# Investment Committee Research & Decision Framework (Milestone 13)

This document explains how Atlas Research's Investment Committee Research & Decision Framework works.
It's a companion to the
[main README](../README.md#investment-committee-research--decision-framework-architecture-milestone-13),
written for someone evaluating the methodology on its own — a reviewer, an interviewer, or a future
contributor who wants the full picture without reading source code first.

Stated as plainly as the spec itself states it: **this is a decision-support and research-organization
tool, not an automated stock picker.** No component here ever assigns a final decision status,
auto-invalidates a thesis, or lets an AI model write data outside a single, always-validated path.
Every consequential decision requires the user's own explicit confirmation.

## 1. Investment Cases and the structured thesis editor

An `InvestmentCase` is the root resource — one per (user, company) research effort, with a
`status: InvestmentCaseStatus` (`RESEARCHING` → `WATCHLIST` → `ACTIVE_THESIS` → `UNDER_REVIEW` →
`THESIS_CHALLENGED` → `THESIS_INVALIDATED` → `ARCHIVED`). Nothing in this milestone ever sets that
field except an explicit `PATCH` the user triggers themselves — the Thesis Challenge Engine, the
invalidation monitor, and the review-confirmation flow are all deliberately read-only with respect to
it.

The thesis itself is structured rather than one free-text blob: `coreThesis`, `keyDrivers[]`,
per-scenario `bullSummary`/`baseSummary`/`bearSummary`, and the "What Would Change My Mind?"
indicators (`strengthenIndicators`/`weakenIndicators`/`invalidateIndicators`) are each their own
column, and each edits and saves independently in the UI rather than through one giant form submit.

## 2. Bull/Base/Bear valuation — always live, never duplicated

`getQuickDcfScenarios(ticker)` (new this milestone, added to the existing `lib/valuation/
quickValuation.ts` reuse layer) runs the exact same `runDcf()` engine the standalone Valuation page
uses, three times: once unmodified for Base, once with `DEFAULT_BEAR_DELTAS`, once with
`DEFAULT_BULL_DELTAS`. These are the identical deltas `aggregateResearchContext.ts`'s own scenario
analysis (Milestone 9) already applies — no second set of "what does Bull/Bear mean" numbers was
invented for this milestone. A case's Bull/Base/Bear valuation is therefore recomputed fresh on every
page load and is never persisted, with one deliberate exception: a version snapshot (section 7)
freezes it permanently, because a memo or a version comparison must stay reproducible even after the
live DCF later moves.

## 3. Thesis assumptions and the Thesis Challenge Engine

`InvestmentCaseAssumption` tracks a case's own assumptions per `(metric, scenario)` — a broader metric
enum than Milestone 11's report-scoped `ThesisAssumption`, since a case outlives any single research
report version. The Thesis Challenge Engine (`lib/investmentCase/thesisChallengeEngine.ts`) compares
only **BASE**-scenario assumptions against live data:

```ts
export function evaluateAssumptionChallenge(input: AssumptionChallengeInput): ThesisChallenge | null {
  const isRatio = RATIO_METRICS.has(input.metric);
  const change = computeChange(input.assumptionValue, input.liveValue);
  const difference = isRatio ? change.changeAbsolute : change.changePercent;
  if (difference === null) return null;
  const threshold = CHALLENGE_THRESHOLDS[input.metric];
  if (Math.abs(difference) < threshold) return null;
  // ...returns a ThesisChallenge, always labeled a "Potential Challenge"
}
```

Bull/Bear assumptions are deliberately excluded from this comparison: they are shifted "what if"
inputs, not the thesis's real-world expectation, so comparing a Bull-case 25% growth assumption
against a single live reading would be meaningless — proven by a dedicated test asserting only BASE
assumptions ever generate a challenge.

The comparison arithmetic reuses Milestone 11's `computeChange()` unchanged rather than inventing a
second diff formula: ratio-shaped metrics (revenue growth/CAGR, operating margin, FCF margin, WACC,
terminal growth, EPS growth) are compared in **percentage points** via `changeAbsolute` — a plain
subtraction of two already-ratio values, which is exactly what a percentage-point difference is.
Multiple/count/dollar-shaped metrics (exit multiple, debt, share count) are instead compared as
**relative percent change** via `changePercent`, since "the multiple moved 2 points" and "the multiple
moved 2x" mean very different things. This matches the spec's own worked example exactly: an assumed
15% revenue growth against a live/guidance reading of 9-11% produces a reported "Difference: -4 to -6
percentage points" — verified directly in `thesisChallengeEngine.test.ts` and end-to-end in a live
browser run (section 11).

Every challenge that clears its metric's own documented threshold is surfaced as exactly that — a
**Potential Challenge** — never "thesis broken." The engine only ever reads a stored assumption and a
live value and reports the gap; it never writes to the assumption, and it never touches
`InvestmentCase.status`.

Live-value sourcing (`lib/services/investmentCaseChallengeService.ts`) is deliberately conservative and
honestly labeled: revenue growth/CAGR are compared against **trailing** revenue growth from current
fundamentals, not a cross-referenced guidance-implied growth rate (reconciling `GuidanceObservation`'s
dollar-denominated guidance against a prior-period revenue figure was judged out of scope); WACC and
terminal growth come from the live DCF Base case; exit multiple, debt, and share count have no live
source wired up yet and are simply skipped — never a fabricated comparison standing in for missing
data.

## 4. Invalidation criteria — advisory, never automatic

`InvestmentCaseInvalidationCriterion` supports two shapes in the same table: machine-checkable
criteria (a `metric` + `comparator` + `thresholdValue`, optionally requiring `consecutivePeriods` of
data — e.g. "revenue growth below 8% for 3 consecutive quarters"), and purely qualitative criteria
(`metric: null`, reviewed manually only). `evaluateInvalidationCriterion()`
(`lib/investmentCase/invalidationMonitor.ts`) is a pure function that returns an advisory
`{checkable, potentiallyMet, reason}` and **never writes** `InvestmentCaseInvalidationCriterion.status`
— turning "potentially met" into a resolved decision is always a separate, explicit
`PATCH .../invalidation-criteria/[id]` call the user makes themselves, whether from the case detail
page directly or after completing a review.

## 5. Evidence Matrix — one write path, always validated

`validateEvidenceSource()` (`lib/investmentCase/evidenceValidation.ts`) is the single gate every
evidence item passes through — used identically whether a human fills out the Evidence Matrix form or
the AI Thesis Assistant proposes a citation. There is no second, less-checked write path anywhere in
the milestone for AI-originated content.

Row-backed source types require the referenced record to actually exist **and** belong to the case's
own company:

| Source type | Required field | Resolved against |
|---|---|---|
| `TEN_K` / `TEN_Q` / `EIGHT_K` | `secFilingId` | a real `SecFiling` row |
| `EARNINGS_CALL` | `earningsCallId` | a real `EarningsCall` row |
| `RESEARCH_EVENT` | `researchEventId` | a real `ResearchEvent` row |

Non-row-backed types (`FINANCIAL_STATEMENT`, `DCF`, `COMPS`, `HISTORICAL_VALIDATION`) require only a
non-empty `sourceLabel` — there's no single database row to point at for "the DCF model" or "current
fundamentals," so the honesty requirement is a human-readable label instead. The actual database
lookup (`resolveRowBackedSource()`) lives in the service layer; the validator itself stays a pure
function over an already-resolved result, which is what makes it cheap to unit-test exhaustively.
Two tests specifically prove the failure modes the spec calls out by name: evidence with no source at
all (the AI-invented-evidence case) is rejected, and evidence pointing at a real filing id that
belongs to a *different* company is also rejected.

## 6. AI Thesis Assistant — synthesize, never decide

The system prompt (`lib/ai/investmentThesisPrompts.ts`) is written directly against the spec's own
constraint list. The assistant may only **synthesize, compare, explain, identify conflicts, and
surface questions** — it is explicitly instructed never to predict future returns, state a
probability of an outcome, guarantee any result, invent a fact or source, declare a thesis "broken,"
"invalidated," or "confirmed" (only that evidence "supports," "contradicts," or "raises a question"),
alter any assumption or model, change the case's decision status, or give personalized financial
advice.

Citations (`cited_evidence_ids`/`cited_research_event_ids`) reference real database ids directly,
rather than Milestone 9's small-integer source-registry scheme — simpler, and directly verifiable
against `collectValidCitationIds(context)`, a set built from the exact same context object sent to the
model. Any id the model claims that isn't literally present in that set is silently stripped before
the response is ever shown to the user (`sanitizeThesisAssistantPayload`, mirroring Milestone 9's
`sanitizeReportPayload` discipline) — a citation is backend-verified, never trusted from the model's
own claim.

When `ANTHROPIC_API_KEY` isn't configured, the route returns a 503 carrying the underlying
`AiNotConfiguredError`'s own message rather than a bare failure — verified directly in a live browser
run (section 11), where the assistant panel surfaced `ANTHROPIC_API_KEY is not configured` as its
error text.

## 7. Version snapshots and deterministic diffing

`buildCaseSnapshot()` (`lib/services/investmentCaseVersionService.ts`) is the one place a case's full
state is assembled: thesis, assumptions, evidence, risks, catalysts, invalidation criteria, plus a
**freshly re-read** valuation and fundamentals snapshot. Both `createVersion()` and the shared AI
context builder (section 6, section 8) call this same function rather than re-deriving the same case
state twice with two slightly different implementations. This is the one place in the whole milestone
a valuation figure is deliberately frozen — a version or a memo generated from it must stay
reproducible even after the live DCF later moves, which is a genuine exception to this milestone's
otherwise-universal "valuation is always live" rule.

`diffCaseSnapshots()` (`lib/investmentCase/versionDiff.ts`) is a pure, deterministic structural diff
between two frozen snapshots — thesis-field changes (status/horizon/core thesis/key drivers/bull-base-
bear summaries/indicators), assumption value changes (matched by a `metric:scenario` key), added and
removed evidence (by id-set difference), and valuation changes (a fixed, labeled comparison across
seven valuation fields). It is never AI-generated, so a "Version 1 vs. Version 2" comparison is always
exactly reproducible from the two stored snapshots alone, with no model call in the loop at all.

## 8. AI Thesis Assistant / memo shared context

`buildInvestmentCaseContext(userId, caseId)` (`lib/investmentCase/context.ts`) is the one function both
the AI Thesis Assistant and the Investment Memo generator call — built on top of `buildCaseSnapshot()`
plus live challenge/invalidation-evaluation reads and a capped slice (15) of the company's Milestone 11
research-event timeline. This mirrors the role `aggregateResearchContext.ts` plays for Milestone 9's
report generator: gather everything once, from services that already exist, so two different AI
features never independently re-derive the same numbers and risk drifting apart from each other. The
prompt text itself is similarly deduplicated — `renderInvestmentCaseContext()`
(`lib/ai/investmentCaseContextPrompt.ts`) is a shared rendering function both the assistant's and the
memo's prompts call, so the two AI features describe the exact same case data identically.

## 9. Investment Memo generator — 16 sections, only 2 ever AI-written

`generateInvestmentMemo()` (`lib/services/investmentMemoService.ts`) always creates a fresh
`InvestmentCaseVersion` first — the memo and that version are permanently linked one-to-one
(`InvestmentMemo.versionId @unique`) — then assembles all 14 deterministic sections directly from the
frozen snapshot: business overview, investment thesis, financial analysis, valuation, bull/base/bear
case, catalysts, risks, evidence for, evidence against, key assumptions, "what would change my mind,"
historical validation (reusing Milestone 12's `runDcfForecastValidation()` directly — no second
backtest engine anywhere in this milestone), sources, and methodology. Only the Executive Summary and
Conclusion sections are attempted via an AI call, and even those may only reference facts already
present elsewhere in the same memo — verified by a structural test that plants a fabricated dollar
figure in the (mocked) AI narrative text and confirms the memo's own `valuation.dcfBase` field is
untouched by it, since that field is sourced from the frozen snapshot, never from anything the AI
narrative claims.

This deliberately diverges from — and improves on — Milestone 9's own AI-failure pattern. A failed
`ResearchReport` stores `report: null`, i.e. nothing. A failed `InvestmentMemo` instead still persists
`status: 'FAILED'` with all 14 deterministic sections fully populated; only the two narrative sections
are nulled (`{text: null, citedEvidenceIds: [], citedResearchEventIds: []}`). This is documented
explicitly in code as an intentional divergence, not an oversight — the deterministic sections never
depended on the AI call succeeding in the first place, so there is no reason for their absence to be
coupled to it.

## 10. Review workflow

`startReview()` (`lib/services/investmentCaseReviewService.ts`) always creates the
`InvestmentCaseReview` row up front with `outcome: null` — a review that has been started but not yet
confirmed is durable, never lost if the user navigates away mid-review. Its summary is assembled from:
research events new since the previous review (Milestone 11's `getCompanyTimeline()`, reused directly
— no second detection pass), live thesis challenges, live valuation, Milestone 12's historical
forecast validation, new risks and catalysts created since the last review, and the evidence matrix's
supports/contradicts/neutral balance.

`confirmReview()` is the **only** function in the codebase that ever sets a review's `outcome`, and it
is always an explicit, separate user action — selecting one of `THESIS_VALID`, `NEEDS_MODIFICATION`,
`CONTINUE_MONITORING`, or `INVALIDATED` and clicking Confirm. Confirming `INVALIDATED` does **not**
itself change `InvestmentCase.status` — that remains the same separate, explicit status control every
other status change in the milestone goes through, surfaced in the UI with its own note explaining
this is deliberate.

## 11. Live verification

Every mechanism above was exercised end-to-end in a real browser session against a real AAPL
investment case, with `ANTHROPIC_API_KEY` deliberately left unset to prove the AI-failure paths as
well as the happy paths:

1. Created an investment case for AAPL with a core thesis.
2. Added a `REVENUE_GROWTH` / `BASE` assumption of `0.2` — the Thesis Challenge Engine correctly
   compared it against AAPL's live trailing revenue growth (`0.0643`) and surfaced: *"Potential
   Challenge — Revenue Growth: Revenue Growth moved from an assumed 0.2 to a live 0.0643 (Current
   fundamentals). Difference: -13.6 percentage points."* — the exact percentage-point framing the spec's
   own worked example describes, computed from real, live data, not a fixture.
3. Added an evidence item with a non-row-backed `FINANCIAL_STATEMENT` source — accepted immediately
   since only a label was required.
4. Started an Ad-Hoc review — the summary correctly reported the one live assumption challenge and a
   real historical-validation sample size ("Atlas's own historical DCF forecasts for AAPL have been
   scored against 78 actual reported fiscal-year outcomes"), pulled live from Milestone 12. Confirmed
   it with outcome `CONTINUE_MONITORING`.
5. Asked the AI Thesis Assistant a question — it correctly surfaced `ANTHROPIC_API_KEY is not
   configured` as a clear, specific error rather than a silent failure or a generic 500.
6. Generated an Investment Memo — it was created with `status: FAILED` (the AI narrative sections
   couldn't be written), but opening the memo document confirmed all 14 deterministic sections were
   fully populated: business overview, the real thesis text, live financials, live valuation, the one
   tracked assumption, the one evidence item, the real historical-validation summary, sources, and
   methodology — with a banner at the top of the document explaining exactly which two sections were
   unavailable and why.
7. Toggled Investment Committee Mode on the memo document and confirmed it applied without error.
8. Confirmed cross-user isolation directly against the running route handlers
   (`app/api/crossUserAccess.test.ts`'s "investment cases" describe block): a second user gets 404s
   reading/updating/deleting another user's case, adding a child resource to it, starting a review,
   creating a version, generating a memo, or asking the assistant, and never sees it in their own case
   list.

## 12. Known limitations

- Live challenge/invalidation comparison covers six metrics (revenue growth/CAGR, operating margin,
  FCF margin, WACC, terminal growth); exit multiple, debt, and share count have no live source wired
  up and are simply skipped, never fabricated.
- Revenue-growth comparison uses trailing fundamentals, not a guidance-implied growth rate —
  reconciling `GuidanceObservation`'s dollar-denominated guidance against a prior-period revenue
  figure was out of scope for this milestone.
- Evidence source validation confirms a referenced row exists and belongs to the right company; it
  does not verify that the evidence's claim text accurately reflects what the source document says.
- The Evidence Matrix's row-backed source picker is id-entry, not a search/browse interface.
- Investment Committee Mode is a CSS/print presentation toggle, not a separate export pipeline.
- Thesis Health and the dashboard recompute a full live context (including a DCF/comps read) per case
  on every page load — acceptable at the scale of one user's own research cases, not optimized for a
  portfolio of hundreds of cases.
