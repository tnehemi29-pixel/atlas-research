# Data Quality, Model Audit & Research Integrity Engine (Milestone 14)

This document explains how Atlas Research's research integrity engine works. It's a companion to the
[main README](../README.md#data-quality-model-audit--research-integrity-engine-architecture-milestone-14),
written for someone evaluating the methodology on its own — a reviewer, an interviewer, or a future
contributor who wants the full picture without reading source code first.

Stated as plainly as the spec itself states it: **the purpose of this milestone is DETECT → VERIFY →
EXPLAIN → FLAG → AUDIT, not GUESS → FIX SILENTLY → HIDE.** Nothing here changes a financial model
because a validation check failed, automatically alters a DCF assumption, rewrites a research report,
hides a data discrepancy or a stale dataset, produces a false confidence score, treats an AI model's
own output as the source of truth, deletes historical research, or auto-invalidates an investment
thesis.

## 1. Data quality methodology

Every check in this milestone is one of eight named dimensions — Completeness, Accuracy, Freshness,
Consistency, Source quality, Traceability, Timeliness, and Calculation integrity — never collapsed
into a single unexplained score. Each check returns the same shared shape,
`IntegrityFinding {check, severity, passed, message}` (`lib/integrity/types.ts`), so a user can always
see exactly which named check produced a given result and why.

**Freshness** (`lib/integrity/freshness.ts`) compares a dataset's own timestamp against a per-dataset
expected refresh window and classifies it CURRENT, AGING (past the window but within a configurable
multiplier of it), STALE (well past it), or UNKNOWN — a missing or future timestamp is UNKNOWN, never
silently treated as current:

```ts
export const DEFAULT_REFRESH_FREQUENCY_DAYS: Record<IntegrityDatasetType, number> = {
  MARKET_DATA: 1,
  COMPS_MODEL: 7,
  FINANCIAL_STATEMENTS: 100,
  SEC_FILINGS: 100,
  EARNINGS: 100,
  DCF_MODEL: 100,
  HISTORICAL_VALIDATION: 100,
  RESEARCH_REPORT: 100,
  INVESTMENT_CASE: 100,
};
```

The spec's own worked example — a DCF created before a major earnings update should display "DCF may
require review because newer financial information is available," never silently recompute — is
exactly how `DCF_STALE` findings behave: they are surfaced as an issue for a human to review, and
nothing about the DCF itself is touched.

**Source hierarchy** (`lib/integrity/sourceHierarchy.ts`) ranks every source type into four
configurable tiers — Tier 1 (SEC filings, audited statements, official earnings releases) down to
Tier 4 (unverified/secondary) — via one lookup table, `SOURCE_TIER_CONFIG`. An unrecognized source
type defaults to Tier 4 rather than being assumed trustworthy; every research claim in the registry
(section 5) carries a `sourceType` that resolves to one of these tiers.

**Completeness** is checked wherever a downstream calculation needs a specific input (revenue,
operating income, FCF, shares, debt, cash, peer data, DCF assumptions). A missing input is reported as
"Data unavailable" — this milestone never fills a gap with an AI-generated estimate to make a
dashboard look more complete.

## 2. Financial reconciliation

`lib/integrity/financialReconciliation.ts` checks the identities the spec calls out by name: Gross
Profit ≈ Revenue − COGS, Operating Income ≈ Gross Profit − OpEx, FCF ≈ OCF − Capex (reusing
`lib/analytics/ratios.ts`'s own `calculateFreeCashFlow` rather than re-deriving the formula), Assets ≈
Liabilities + Equity, and the cash roll-forward (Ending Cash ≈ Beginning Cash + Net Change). Every
check goes through the same `buildCheck()` helper with a shared tolerance —
`DEFAULT_TOLERANCE_PERCENT = 2%`, floored at `DEFAULT_TOLERANCE_ABSOLUTE_FLOOR = $1,000,000` — because
real accounting and data-provider rounding differences are expected between sources, and the spec
explicitly warns against requiring exact equality.

`lib/integrity/marketDataValidation.ts` applies the identical `buildCheck()` pattern to Market Cap ≈
Price × Shares Outstanding and Enterprise Value ≈ Market Cap + Total Debt − Cash. A materially
inconsistent relationship becomes a `MARKET_DATA_INTEGRITY` finding — never a silently overwritten
value.

## 3. DCF audit methodology

`modelAuditService.ts`'s `runDcfModelAudit()` never re-implements the DCF engine — it calls the exact
same `deriveHistoricalYears`, `buildMarketData`, `buildDefaultAssumptions`, and `runDcf` functions
Milestone 5's own Valuation page and Milestone 9's report aggregator already call, producing one real,
freshly computed result. `lib/integrity/dcfAudit.ts`'s `auditDcf()` then audits that real result's own
internal arithmetic:

- **EV → Equity Value → Implied Share Price**, checked against `lib/valuation/bridge.ts`'s own
  `computeEnterpriseValue` / `computeEquityValue` / `computeImpliedSharePrice` functions, at a tight
  internal tolerance (`INTERNAL_TOLERANCE_PERCENT = 0.5%`, floored at `$10`) — much tighter than the
  cross-source tolerance in section 2, because this is Atlas checking its own arithmetic against
  itself, not absorbing real-world data noise, so a genuine disagreement here is a bug.
- **Terminal growth vs. WACC — the one explicit CRITICAL check the spec calls out by name.** For a
  perpetuity-growth terminal value, `checkTerminalGrowthBelowWacc()` fails with CRITICAL severity
  whenever `terminalGrowthRate >= wacc`, exactly matching the spec's instruction: "do not allow the
  model to silently produce a result."
- **Milestone 5's own validation issues**, surfaced as findings rather than swallowed — if the DCF
  engine's own `ERROR`-severity `ValidationIssue`s (e.g., "WACC could not be calculated") exist, the
  audit reports them as CRITICAL findings too.

`lib/integrity/dcfSensitivityAudit.ts` separately checks the expected monotonic relationships in a
sensitivity grid: a higher WACC should generally lower valuation, and a higher terminal growth rate
should generally raise it. `checkAxisMonotonicity()` walks each axis and flags any step that moves the
wrong direction (beyond a small float-noise tolerance) as a "potential model calculation issue" —
never silently accepted.

## 4. Comps audit methodology

`runCompsModelAudit()` reuses `getPeerCandidates`, `fetchTargetAndPeers`, and `runComps` unchanged —
no second comps engine. `lib/integrity/compsAudit.ts` then checks peer-data completeness and a minimum
peer count (`MIN_PEER_COUNT = 3`), plus one "defense in depth" check specific to this milestone:
Milestone 6's own `Multiple.status` field already refuses to display a misleading multiple when its
denominator is non-positive (returning `notMeaningful` → rendered as "N/M" in the UI rather than a
number). `auditMultipleIntegrity()` fires a CRITICAL finding only if that invariant was ever violated
— a multiple marked `ok` despite a non-positive EBITDA/EBIT/revenue/net-income denominator — proven
directly by a test that constructs exactly that broken state and confirms the audit catches it.

## 5. AI claim validation

`lib/integrity/claimValidation.ts`'s `validateResearchClaim()` is the one validation gate every
tracked research claim passes through — human-entered or AI-proposed, with no separate, less-checked
path for either. It combines two independent checks, and either one failing rejects the claim:

- **`validateClaimNumber`** — the claim's stated value against its source value, within a
  ratio-appropriate tolerance (`DEFAULT_CLAIM_TOLERANCE_PERCENT = 5%`, floored at 1 percentage point,
  since claims like growth rates are ratio-shaped). The spec's own worked example — a report claiming
  "revenue grew 18%" when the underlying data says 11% — produces exactly this: `REJECTED`.
- **`validateClaimCitation`** — the claim's cited source id against a `ReadonlySet<string>` of source
  ids that actually exist. An invalid citation always rejects the claim outright, regardless of whether
  the number happens to be correct — the AI is never treated as the source of truth for its own
  sourcing, mirroring Milestone 9's `sanitizeReportPayload` and Milestone 13's
  `collectValidCitationIds` discipline.

`researchClaimService.ts`'s `createClaim()` persists the result as a `ResearchClaim` row with
`ClaimSource[]` children and a `ClaimValidationStatus` — `VERIFIED` / `UNVERIFIED` / `CONTRADICTED` /
`STALE` / `REJECTED` — forming the research claim registry the spec asks for: "this becomes the
foundation for research integrity across Atlas." Every claim carries its `sourceType`, `sourceDate`,
and a `dataSnapshotAt`, so it stays traceable back to exactly what was known and when.

## 6. Historical-data integrity

`lib/integrity/historicalValidationAudit.ts`'s `auditHistoricalValidationDisclosure()` checks that a
historical-validation result honestly discloses its own limitations: sample size (flagging a sample
under `MIN_SAMPLE_SIZE_FOR_CONFIDENCE = 5` outcomes as too small to support a confidence claim),
methodology, and benchmark. The deeper guarantee — that a point-in-time snapshot genuinely cannot see
data that wasn't filed yet — is proven, not re-implemented: a dedicated regression test imports
Milestone 12's own `filterPeriodsAsOf` directly and constructs a period filed *after* the snapshot
date, confirming it is excluded. This directly satisfies the spec's own required test case ("Future
filing exists → Expected: Historical snapshot cannot access it") without a second point-in-time
valuation engine anywhere in this milestone.

## 7. Research contradictions

`lib/integrity/contradictionDetection.ts` detects a genuine reversal in a metric's trend, not a raw
value-to-value diff. `computeTrendDirection()` walks a chronological sequence of values and only
reports `INCREASING` or `DECREASING` if every consecutive step moves the same way beyond a small
flat-noise threshold; a sequence that moves up then down, or stays essentially flat, is `STABLE` —
never an arbitrary pick between two roughly-equal readings.
`detectDirectionalContradiction(priorTrend, newTrend)` then flags a `POTENTIAL_RESEARCH_CONTRADICTION`
only when the two trends are genuine opposites (`INCREASING` vs. `DECREASING`), matching the spec's
worked example exactly: a report claiming "operating margins are expanding" against three consecutive
quarters of actual decline. A contradiction is surfaced with the original claim, the new evidence, and
both dates and sources — the older claim is never deleted; historical research stays fully auditable.

## 8. Thesis conflicts

`InvestmentCase` (Milestone 13) is private, per-user data — unlike every other table this milestone
introduces, which is global and company-scoped. This is a genuine architectural tension the spec
doesn't resolve on its own, and it's resolved here in favor of the privacy boundary Milestone 13
already established: `thesisIntegrityService.ts`'s `auditInvestmentCaseThesis(userId, caseId)` is
scoped through the exact same ownership check Milestone 13's own `getInvestmentCaseDetail` uses
(throwing `InvestmentCaseNotFoundError` for a non-owning caller). Its findings are **never** written
into the shared `ResearchIntegrityIssue` table and **never** shown on the global `/integrity`
dashboard — a company's snapshot only shows a coarse, non-identifying count ("N investment cases
tracked for this company. Thesis-vs-guidance conflicts are checked per-case by each case's own
owner.").

`lib/integrity/thesisIntegrityAudit.ts`'s `auditThesisAssumptionAgainstGuidance()` flags an
`ASSUMPTION CONFLICT` — MEDIUM severity, never auto-invalidating the thesis — matching the spec's
worked example: a thesis assuming 15% revenue CAGR against management guidance of 8-10% growth.
Reaching that comparison required closing a gap Milestone 13 explicitly documented as out of scope:
`computeGuidanceImpliedGrowthRange(guidance, priorPeriodRevenue)` converts a dollar-denominated
`GuidanceObservation` range into an implied growth-rate range using the prior fiscal year's actual
reported revenue as the baseline, returning `null` — never a fabricated rate — when there's no
baseline available to divide by. The `THESIS_ASSUMPTION_CONFLICT` alert type reuses this same function,
scoped to the alert-owning user's own cases only.

## 9. Model versioning

DCF and comps results themselves are never persisted or rewritten by this milestone — they stay
exactly as live and recomputed-on-demand as Milestones 5 and 6 originally designed them, since
persisting them would both contradict the spec's own "do not rewrite Milestones 1-13 unnecessarily"
and duplicate state that's already cheap to recompute. What "model versioning" means here instead is
versioning Atlas's own **evaluation** of a model run: `ModelAudit` rows are append-only, each carrying
a `methodologyVersion` string, the full list of `IntegrityFinding`s produced, and a frozen
`inputsSnapshot` — the exact assumptions, result, market data (for a DCF audit) or comps result (for a
comps audit) that was actually audited. This means a past audit stays fully reproducible even after
the live model's inputs later change, without ever needing to freeze the model itself.

`AuditLogEntry` is the parallel append-only record of the integrity engine's own actions — every check
run, every issue created/acknowledged/resolved/ignored/auto-resolved, every claim created and
validated, and every snapshot computed, each with a timestamp and (where applicable) the acting user's
id. This directly answers the spec's own framing: "what did Atlas know, when did it know it, and why
did it produce this conclusion." It is deliberately scoped to this milestone's own writes — this
milestone does not retrofit an audit-log hook into every mutation path across Milestones 1-13, which
would itself be "rewriting Milestones 1-13 unnecessarily."

## 10. Known limitations

- **No automated report-text scanning yet.** The mechanism to validate an individual numeric claim
  against source data exists and is fully tested (`validateResearchClaim`, section 5), and the
  `RESEARCH_REPORT_MISMATCH` issue category and alert type exist to carry the result — but nothing in
  this milestone automatically extracts claims from a generated `ResearchReport`'s own narrative text.
  Claims must be created explicitly today, by a future automated pipeline or by an analyst.
- **The company integrity panel groups checks into seven dimensions** (Market Data, Financial
  Statements, SEC Filings, Earnings, DCF Model, Comparable Companies, Investment Cases) rather than a
  literal eight-item list including a standalone "Research Report" tile — report-level findings surface
  through the Research Claim Registry and the general issues list instead. This is a deliberate
  information-architecture choice, not a missing check.
- **The global dashboard's category filter runs client-side** over the set of companies that already
  have a computed snapshot — appropriate at the scale of companies Atlas has actually checked, not
  designed for a portfolio of thousands of tickers.
- **Thesis-integrity findings are permanently excluded from the global dashboard and the shared issue
  table**, by design (section 8) — a genuine trade-off between company-wide visibility and the
  per-user privacy boundary Milestone 13 established for investment cases.
- **`IntegritySnapshot` recomputation is all-or-nothing per company.** Refreshing a snapshot re-derives
  every dimension from scratch — including a fresh DCF run and a fresh comps run — rather than
  incrementally recomputing only the one dimension whose underlying data actually changed. The 15-
  minute TTL cache (section "Performance" in the README) keeps this from happening on every page load,
  but a refresh is still a full recompute, not a partial one.
- **Auto-resolution is a fixed, narrow allowlist** (`DATA_FRESHNESS`, `DATA_COMPLETENESS`,
  `SOURCE_UNVERIFIED`, `DCF_STALE`, `HISTORICAL_VALIDATION_LIMITATION`) rather than a per-issue
  configurable policy — this matches the spec's own explicit list of what must never auto-resolve
  (financial discrepancies, model errors, contradictions, thesis conflicts), but a category outside
  that allowlist can never be made auto-resolvable without a code change.
