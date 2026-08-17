# Atlas Research

An AI-assisted institutional equity research platform: company search and financial statement
analysis, DCF and comparable-company valuation, SEC filing and earnings-call intelligence,
AI-generated research reports, portfolio/watchlist tracking, automated research-change detection,
historical backtesting, an investment-case decision framework, a research data-quality/integrity
engine, and a multi-analyst research workspace with role-based review — built incrementally, one
milestone at a time, and documented milestone-by-milestone below.

**Status:** Feature-complete through Milestone 15 (Institutional Research Workspace &
Collaboration Layer). Every milestone listed in the table of contents below is implemented, tested,
and documented in its own section further down this file.

## Stack

Next.js 14 (App Router, TypeScript) · Tailwind CSS · Prisma · PostgreSQL · pnpm workspaces +
Turborepo · Vitest

Data sources: **SEC EDGAR** (XBRL company facts and filings — free, no API key) and **Financial
Modeling Prep** (company search/overview, peers, historical prices — free-tier API key). AI
features (filing/earnings-call analysis, research report generation, investment-thesis and
workspace assistants) run on **Anthropic Claude** and degrade gracefully — clearly labeled as
unavailable, never fabricated — when no API key is configured.

There is a single backend: Next.js Route Handlers under `apps/web/app/api/`, in the same process as
the frontend. No separate service, no Python/FastAPI component, no background job queue.

## Project structure

```
apps/web/
  app/            Next.js App Router — pages under app/, JSON API under app/api/
  components/     React components, one directory per feature area
  lib/
    providers/    Outbound adapters for SEC EDGAR, Financial Modeling Prep, and market data
    ai/           The Anthropic client and every AI-schema/prompt/orchestrator module
    services/     Business logic and Prisma orchestration, one file per domain
    auth/         Password hashing (scrypt), session tokens, requireUser() guard
    <feature>/    Pure, DB-free calculation/validation logic (valuation, comps, backtest, etc.)
  prisma/         schema.prisma + migrations
packages/
  types/          Shared TypeScript contracts
  config/         Shared TypeScript compiler config
infra/
  docker-compose.yml   Local Postgres for development
docs/             One deep-dive doc per major subsystem
```

Each milestone section below (Financial Data, DCF Valuation, Comparable Companies, SEC Filing
Intelligence, Earnings Call Intelligence, Research Report Generator, Portfolio & Watchlist
Intelligence, Research Change Detection, Historical Backtesting, Investment Committee Framework,
Research Integrity Engine, Research Workspace & Collaboration) documents that area's own file
layout, design decisions, and known limitations in detail.

## Prerequisites

- Node.js 20+
- pnpm 9+ (`npm install -g pnpm`)
- A local PostgreSQL instance — either:
  - Docker: `docker compose -f infra/docker-compose.yml up -d`, or
  - A native PostgreSQL install (see `apps/web/.env.example` for the expected connection format)
- No signup required for financial statement data — SEC EDGAR is free and keyless. Company
  search/overview (Milestone 2) needs a free [Financial Modeling Prep](https://site.financialmodelingprep.com/register)
  API key; without one, search and the overview panel degrade gracefully but the Financials
  section still works fully, since it's independent (SEC EDGAR, not FMP).

## Setup

1. Install dependencies from the repo root:

   ```bash
   pnpm install
   ```

2. Configure environment variables:

   ```bash
   cp apps/web/.env.example apps/web/.env
   ```

   Edit `apps/web/.env`:

   - `DATABASE_URL` — point at your local Postgres instance.
   - `SEC_USER_AGENT` — set to `"Your Name your@email.com"`. SEC requires every request to
     identify the requester (no signup, just a compliant header) — see
     [SEC's developer FAQ](https://www.sec.gov/os/webmaster-faq#developers). Requests without a
     real one risk being rate-limited or blocked.
   - `FMP_API_KEY` — optional, only needed for company search/overview (Milestone 2).

3. Start Postgres (skip if you're using a native install that's already running):

   ```bash
   docker compose -f infra/docker-compose.yml up -d
   ```

   If you're on native PostgreSQL instead of Docker, create the matching role and database once:

   ```sql
   CREATE USER erp WITH PASSWORD 'erp_dev_password';
   CREATE DATABASE erp_dev OWNER erp;
   ```

4. Generate the Prisma client and apply migrations:

   ```bash
   pnpm db:generate
   pnpm db:migrate
   ```

5. Run the dev server:

   ```bash
   pnpm dev
   ```

   The app is served at [http://localhost:3000](http://localhost:3000). Try
   `http://localhost:3000/company/AAPL` directly — financial statement data works with no
   configuration beyond `SEC_USER_AGENT`.

## Verifying it's working

- Health check: `curl http://localhost:3000/api/v1/health`
- Financials API directly: `curl "http://localhost:3000/api/v1/companies/AAPL/financials"` should
  return real Apple income statement / balance sheet / cash flow data going back several years.
  Add `?period=quarterly` for quarterly periods.
- Company page: open `http://localhost:3000/company/AAPL` and scroll to "Financials" — a stat
  grid (revenue, growth, net income, EPS, FCF, assets, debt, cash, operating cash flow) and a
  multi-year table.
- DCF valuation: open `http://localhost:3000/company/AAPL/valuation` — historical performance
  table populated from real SEC data, every forecast/WACC/terminal-value assumption editable, and
  (if `FMP_API_KEY` isn't configured) a "Model Status" banner explaining exactly which market
  input is missing rather than silently guessing one.
- Comparable companies: open `http://localhost:3000/company/AAPL/comps` — real SEC-derived
  revenue/EBITDA/EBIT/net income for the target; try `curl
  "http://localhost:3000/api/v1/companies/AAPL/valuation-multiples?peers=JPM"` directly to see the
  comps engine run against two real companies' real financials (JPM's EBIT/EBITDA correctly come
  back `missingData` — a bank's income statement has no operating-income line to derive it from).
- SEC Filing Intelligence: open `http://localhost:3000/company/AAPL/filings` — a real, current
  chronological feed pulled from SEC EDGAR's submissions API. Click "Analyze" on any 10-K to watch
  the real document get fetched and sectioned live (Business, Risk Factors, MD&A, Liquidity,
  Market Risk, Financial Statements, Controls and Procedures all correctly identified from real,
  current Apple filings). Without `ANTHROPIC_API_KEY` configured, "Generate Analysis" correctly
  reports "ANTHROPIC_API_KEY is not configured" and the extracted sections/search/original-filing
  link all remain fully usable; "Compare with Previous Filing" still computes real, correct
  financial deltas (deterministic, not AI) even with the AI portion unavailable.

## Financial data architecture (Milestone 3)

### Data flow

```
SEC EDGAR (XBRL company facts, per company)
    -> lib/providers/secEdgar.ts        raw fetch, CIK resolution, HTTP-level error handling
    -> lib/xbrl/periods.ts              derives the fiscal-period calendar from fact dates
    -> lib/xbrl/normalize.ts            resolves each standardized field via conceptMap.ts,
                                         across candidate tags, deduped by latest-filed-wins
    -> lib/xbrl/validate.ts             sanity checks; ERROR-level issues null the specific field
    -> lib/xbrl/persist.ts + financialDataService.ts   maps to Prisma rows, writes transactionally
    -> Postgres (financial_periods / income_statements / balance_sheets / cash_flow_statements)
    -> app/api/v1/companies/[ticker]/financials/route.ts   serves standardized JSON
    -> components/company/FinancialsSection.tsx             renders it
```

No provider-specific shape (an XBRL tag name, SEC's fact-array format) ever crosses out of
`lib/xbrl/` and `lib/providers/secEdgar.ts` — everything above the normalization layer works
with `packages/types`' `FinancialPeriodData`/`IncomeStatementData`/`BalanceSheetData`/`CashFlowData`.

### Why dates, not SEC's `fy`/`fp` fields, determine the period

This was the single most important thing verifying against real data caught. SEC's XBRL facts
carry `fy`/`fp` metadata, but that describes which _filing_ a fact was submitted in, not which
period it reports on — a 10-K shows three years of comparative income statement data, and every
fact in it (the current year and both prior-year comparatives) carries the _filing's_ fy/fp, not
its own. Confirmed against real Apple data: a fact with `start=2016-09-25, end=2017-09-30`
(Apple's actual FY2017) is tagged `fy:2019, fp:FY` because it appears as a comparative figure
inside the FY2019 10-K. `lib/xbrl/periods.ts` instead classifies every duration fact by its
actual length (350–380 days = annual, 80–100 days = quarterly) and derives the fiscal year from
the calendar year of the period's `end` date.

### How restatements are handled

Also confirmed against real data: Apple's FY2008 `Assets` figure was originally reported as
$39.572B in a 10-K, then restated to $36.171B in a 10-K/A (a real historical restatement).
`normalize.ts` always keeps the fact with the latest `filed` date for a given (tag, period) —
restated/amended figures supersede originally reported ones. The `accessionNumber` and
`filingType` of the winning fact are stored alongside the value for traceability.

### How different reporting structures are handled

`lib/xbrl/conceptMap.ts` maps each standardized field to a priority-ordered list of candidate
XBRL tags, because filers genuinely use different tags for the same concept (and the same filer
changes tags over time — e.g. Apple's revenue moved from `Revenues` to
`RevenueFromContractWithCustomerExcludingAssessedTax` under ASC 606). A lower-priority tag only
fills periods a higher-priority tag has no data for at all — it never overrides a period the
preferred tag already covered.

Verified against two structurally different real filers:

- **Apple** (`RevenueFromContractWithCustomerExcludingAssessedTax`, `CostOfGoodsAndServicesSold`,
  reports inventory) — every field in this README's requirements list resolved correctly, and
  the FY2023 balance sheet balanced (Assets = Liabilities + Equity) to 0% error.
- **JPMorgan Chase** (a bank; reports `Revenues` directly, has **no**
  `CostOfGoodsAndServicesSold`/`InventoryNet`/`CostOfRevenue` tags at all — banks don't report
  cost of goods sold or inventory) — cost of revenue, gross profit, and inventory correctly
  resolve to `null` for every period rather than a fabricated value.

A further real, verified quirk worth naming explicitly: JPMorgan stopped tagging a
quarterly-duration `Revenues` fact after 2014 — only annual `Revenues` facts appear in their
filings since then. Requesting `?period=quarterly` for JPM correctly returns `revenue: null` for
recent quarters (while EPS, which they do tag quarterly, is still populated) rather than
inventing a number. This is real filer behavior, not a bug — see Known Limitations.

### Database structure

| Table                         | Purpose                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------- |
| `companies`                   | Identity + FMP quote snapshot (M2) + `cik`/`financialsSyncedAt` (M3)                              |
| `financial_periods`           | One row per (company, fiscal year, fiscal period) — the spine everything else hangs off           |
| `income_statements`           | 1:1 with a period                                                                                 |
| `balance_sheets`              | 1:1 with a period                                                                                 |
| `cash_flow_statements`        | 1:1 with a period                                                                                 |
| `raw_financial_facts`         | Provenance: which XBRL tag, from which filing, produced each stored number (see below)            |
| `financial_data_refresh_logs` | Audit trail of every refresh attempt — status, periods found, validation warnings, error messages |

Constraints: `financial_periods` has `@@unique([companyId, fiscalYear, fiscalPeriod])` — this is
the actual, DB-enforced guarantee that annual periods can't be duplicated (not just an
application-level check; `financialDataService.test.ts` verifies this holds against the real
database). `income_statements`/`balance_sheets`/`cash_flow_statements` each have a unique
`periodId` foreign key, enforcing the 1:1 relationship. All child tables cascade-delete with
their period/company. Indexes: `(companyId, periodType, fiscalYear)` on periods for the API's
`?period=` filter, `(companyId, xbrlConcept)` and `(periodId)` on raw facts.

`raw_financial_facts` is fully regenerated (deleted, then reinserted) on every refresh rather than
upserted — it's a derived provenance trail, not user-owned data, so there's no need for a
DB-level uniqueness constraint on a table that's always rebuilt from scratch.

### API endpoints

| Endpoint                                    | Description                                                                |
| ------------------------------------------- | -------------------------------------------------------------------------- |
| `GET /api/v1/companies/{ticker}/financials` | Standardized financials. `?period=annual` (default) or `?period=quarterly` |
| `GET /api/v1/companies/{ticker}`            | Company overview (Milestone 2, FMP-backed)                                 |
| `GET /api/v1/companies/search?q=`           | Autocomplete search (Milestone 2, FMP-backed)                              |

The financials endpoint never returns raw SEC/XBRL shapes — always the standardized
`CompanyFinancialsResponse` shape from `packages/types`. Status codes: `404` (SEC has no filer
for the ticker), `429` (SEC rate limit, after one internal retry), `502` (SEC unreachable),
`503` (config error), `200` with `stale: true` (refresh failed but a cached snapshot exists).

### How financial data is refreshed

On-demand, per company, with a 24-hour TTL (`financialDataService.ts`): the first request for a
ticker's financials fetches from SEC, normalizes, validates, and persists; subsequent requests
within 24 hours are served straight from Postgres. Financial statements change on a filing
cadence (quarterly at fastest), so this TTL is far longer than Milestone 2's 15-minute stock-quote
cache. If a refresh is needed but SEC is unreachable, the service falls back to the existing
cached snapshot (`stale: true` in the response) rather than failing the request outright — unless
there's no cached data at all, in which case the error propagates (mapped to `502`/`503`/`429`
by the route).

There is no scheduled/automatic refresh job yet — every refresh is triggered by an incoming
request hitting a stale cache. The `financial_data_refresh_logs` table and the `financialsSyncedAt`
TTL check are exactly the pieces a future cron-based refresher (Milestone roadmap: background
workers) would query to find stale companies and refresh them proactively without waiting on
user traffic.

### Data validation

`lib/xbrl/validate.ts` runs on every normalized period before it's persisted:

- **Balance equation** — Assets ≈ Liabilities + Equity (1% of assets tolerance) → **WARNING** if
  violated (kept, not corrected — a real event, like noncontrolling interest treatment, can cause
  a small legitimate mismatch; a human should look, not have it silently rewritten).
- **EPS plausibility** — an EPS value over 10,000 is almost certainly a misrouted dollar-value
  tag, not a real per-share figure → **ERROR**, and `applyValidation()` nulls just that field.
- **Shares plausibility** — a share count under 1,000 is almost certainly a misrouted per-share
  value → **ERROR**, field nulled.
- **Period-type consistency** — defensive re-check that a period's actual day-span matches its
  `annual`/`quarterly` label → **ERROR** if not (shouldn't happen given how `periods.ts`
  constructs the calendar, but checked anyway rather than trusted blindly).
- **Magnitude jump** — revenue or net income changing more than 50x vs. the prior same-type
  period → **WARNING** (flagged as a likely unit mismatch, not auto-corrected, since a real
  business event — an acquisition, a one-time gain — can legitimately cause a huge swing).

**Negative values are never treated as an error.** Negative net income, negative free cash flow,
negative working-capital changes are all financially normal and are preserved end-to-end; nothing
in this pipeline calls `Math.abs()` on a reported value, only on _differences_ for comparison.

Issues are logged (`console.warn`, prefixed `[financialDataService]`) and a full list is stored as
JSON on the corresponding `financial_data_refresh_logs` row for audit history — not silently
swallowed and not silently "fixed" beyond the narrow ERROR-field-nulling described above.

### Assumptions made

- **Fiscal year label** = the calendar year of the period's `end` date. This matches how Apple
  (fiscal year ending in September, labeled by the ending year) and JPMorgan (calendar-year
  fiscal year) both actually label their own fiscal years, and is the common convention across
  the vast majority of SEC filers. A company whose fiscal year ends in early January is the one
  realistic edge case this convention could mislabel — not specifically handled.
- **Free cash flow** = Operating Cash Flow − Capex. This is a derived, universally-accepted
  definition, not a raw XBRL concept — no filer reliably tags "free cash flow" directly.
- **Restated figures always supersede originally reported ones** for the same tag and period
  (latest `filed` date wins). This is standard financial-analysis practice, not just a
  convenient default — a company's own restatement is definitionally what they say is now true.
- **A quarter is only reported when SEC XBRL directly tags a ~80–100 day duration fact for it.**
  Standalone "Q4" figures are not derived as FY − Q1 − Q2 − Q3 (see Known Limitations).

### Known limitations

- **No standalone Q4.** Most filers don't tag a discrete Q4 duration fact for income-statement/
  cash-flow items (Q4 is implied by FY minus the three reported quarters). Deriving it via
  subtraction was deliberately left out — it compounds any error in the other three quarters and
  adds real complexity for a metric this milestone doesn't require yet. Quarterly balance sheet
  data at fiscal year end is unaffected (it's an instant fact, already covered by the annual
  period's own balance sheet).
- **A period's displayed `filingType`/`filingDate` is "whichever filing most recently touched any
  field in this period,"** not necessarily the original 10-K/10-Q. A later 10-Q that includes an
  annual period as a prior-year comparative can "win" that metadata even though the values
  themselves are unchanged — cosmetically surprising, though the underlying values are still
  correct (verified: real Apple FY2025 annual data currently shows `filingType: "10-Q"` for
  exactly this reason).
- **Quarterly coverage varies by filer and by field**, and this is filer behavior, not a bug —
  see the verified JPMorgan quarterly-revenue example above. `stale`/`null` fields are the
  intended, honest signal, not something to work around by estimating.
- **Single data source, no fallback provider.** Milestone 2's FMP-backed data has a fallback
  pattern documented in the architecture; financial statements currently depend entirely on SEC
  EDGAR being reachable. SEC's uptime is generally very good and the API is free/unlimited
  (10 req/sec fair-use), but there's no secondary provider yet if SEC has an outage and nothing
  is cached.
- **No scheduled refresh job.** Every refresh is request-triggered; a company nobody has looked
  at in the app never gets refreshed proactively. See "How financial data is refreshed" above for
  what a future scheduler would build on.
- **`raw_financial_facts` only stores the _winning_ fact per field per period**, not every
  candidate tag/filing SEC has ever reported — a deliberate bound on table size (a company can
  have 500+ XBRL concepts and dozens of filings; storing every combination would be unbounded and
  mostly unused) in exchange for full traceability of what's actually displayed.

## DCF valuation architecture (Milestone 5)

An institutional-style, fully auditable Discounted Cash Flow model built entirely from the
company data Milestones 2-4 already retrieve — nothing about a company's financials is entered by
hand. Workflow: **Company → Valuation → DCF**, at `/company/[ticker]/valuation`, with a concise
in-app methodology page at `/company/[ticker]/valuation/methodology`.

### The calculation engine (`apps/web/lib/valuation/`)

A dedicated, pure, deterministic calculation layer — no React, no Prisma, no `fetch` — the same
architectural pattern as `lib/xbrl/` (Milestone 3) and `lib/analytics/` (Milestone 4). Every
function takes plain data in and returns plain data out, so `runDcf()` is testable and callable
without a browser or database:

| Module                | Responsibility                                                             |
| ---------------------- | --------------------------------------------------------------------------- |
| `types.ts`             | `Tagged<T>` provenance wrapper + every assumption/result shape             |
| `historicals.ts`       | Derives the historical baseline from Milestone 3/4's normalized financials |
| `historicalAverages.ts`| Single source of truth for "historical average" figures (engine + UI both read this — never two independently-computed numbers) |
| `forecast.ts`          | Revenue/margin/tax/driver forecasting (3 methods each, see below)          |
| `fcf.ts`               | NOPAT and unlevered FCF — the one formula, applied identically everywhere  |
| `discounting.ts`       | Discount factors and present value                                        |
| `terminalValue.ts`     | Perpetuity growth and exit multiple, each cross-checking the other        |
| `wacc.ts`               | Cost of equity, cost of debt, capital weights, WACC                        |
| `bridge.ts`             | Enterprise Value → Equity Value → Implied Share Price                      |
| `validate.ts`           | Every blocking/warning condition — WACC ≤ g, missing shares/debt/cash, etc. |
| `sensitivity.ts`        | A generic, dynamically-centered 2D grid (takes a `recompute` callback — no knowledge of the DCF internals) |
| `scenarios.ts`          | Bear/Base/Bull deltas applied to resolved forecast series                  |
| `marketData.ts`         | The boundary that turns a `CompanyOverview` + `FinancialPeriodData[]` into the engine's `DcfMarketData` |
| `engine.ts`             | `runDcf()` — the single entry point that wires everything above together   |

### The `Tagged<T>` provenance pattern

Every number the UI shows is wrapped: `{ value, source: 'actual' | 'estimate' | 'calculated' |
'user', note? }`. This is how the app satisfies "clearly distinguish ACTUAL / ESTIMATE / USER
ASSUMPTION / CALCULATED" — it's a structural property of the data, not a UI label applied after
the fact, so it can never drift out of sync with what a number actually is.

### FCF formula (exact, no deviation)

```
NOPAT = EBIT × (1 − Tax Rate)
Unlevered FCF = NOPAT + D&A − CapEx − ΔNWC
```

Built from EBIT, never net income; CapEx is stored as a positive outflow magnitude and always
subtracted. Operating NWC = `(Current Assets − Cash) − (Current Liabilities − Short-Term Debt)`,
falling back to gross working capital when a filer doesn't break out cash/short-term debt (never
nulls the whole figure over one missing sub-field).

### Forecast methodology

- **Revenue** — Historical Growth, User Assumption (a distinct rate per forecast year), or Fade
  (linear interpolation from a starting rate to a long-term normalized rate).
- **EBIT margin** — Historical Average, User-Defined, or Gradual (linear interpolation). The
  default is always Historical Average — the model never assumes margin expansion on its own.
- **Tax rate** — historical effective rate (bounded to a plausible [-50%, 100%] range) or a user
  rate, shared identically between the FCF forecast and the WACC calculation's tax shield.
- **D&A / CapEx / NWC** — one shared three-method driver model: Historical Average % of revenue
  (calculated), User % of Revenue, or a flat dollar amount that doesn't scale with revenue.
- A forecast year is only ever assembled when every one of its inputs resolves — a single missing
  input blanks the whole forecast table rather than rendering a partial, misleading row.

### WACC methodology

```
Cost of Equity = Risk-Free Rate + Beta × Equity Risk Premium
WACC = (Equity Weight × Cost of Equity) + (Debt Weight × After-Tax Cost of Debt)
```

Risk-free rate and equity risk premium are always user-entered (Atlas Research has no live
market-data feed for them). Beta is retrieved from Financial Modeling Prep when configured,
otherwise defaults to a market-neutral 1.0 tagged as a user assumption. Pre-tax cost of debt is
either calculated (latest interest expense ÷ total debt) or user-entered. Market capitalization
has a dedicated user-override field (`marketCapOverride` on `WaccAssumptions`) for the case where
no market-data provider is configured — supplying it is tagged `user`, not `actual`, so the
provenance stays honest even when the model is unblocked manually.

### Terminal value

Two methodologies, switchable, each reporting the other's implied value as a cross-check:

```
Perpetuity Growth:  TV = FCF(n+1) / (WACC − g),  FCF(n+1) = FCF(n) × (1 + g)
Exit Multiple:      TV = (Final-year EBIT + D&A) × Exit EV/EBITDA Multiple
```

`g ≥ WACC` is a hard, blocking validation error (undefined/negative denominator), never silently
clamped.

### Equity bridge

```
Enterprise Value = PV(Forecast FCF) + PV(Terminal Value)
Equity Value = Enterprise Value + Cash − Total Debt
Implied Share Price = Equity Value ÷ Diluted Shares Outstanding
```

Cash, total debt, and diluted shares outstanding all come from the company's latest actual balance
sheet / income statement. Minority interest and preferred stock aren't netted — see Known
Limitations.

### Scenarios

Bear/Bull apply an editable delta on top of the **Base case's already-resolved** per-year revenue
growth and EBIT margin, and shift the equity risk premium (which flows into WACC through the same
cost-of-equity formula as the base case — never an unexplained WACC override). Applying deltas to
the resolved series, not the assumption objects, means a scenario works identically no matter
which forecast method the base case uses, and any Base assumption edit automatically carries
through to both scenarios.

### Sensitivity analysis

A grid of implied share price across WACC (columns, always) and either terminal growth or the
exit multiple (rows, depending on the selected terminal value method), dynamically centered on the
current base-case values — `buildSensitivityGrid()` takes a `recompute` callback and has no
knowledge of the DCF internals, so it's reusable and trivially testable. WACC is varied *directly*
for this grid via `runDcf()`'s `waccOverride` parameter, rather than back-solved through the
equity risk premium, matching how a real sensitivity table is built.

### Testing the DCF engine

```bash
pnpm test
```

150+ tests across the 15 files in `lib/valuation/`, entirely independent of the browser/UI:

- Every module above has its own unit tests (`fcf.test.ts`, `wacc.test.ts`, `terminalValue.test.ts`, etc.)
- **`engine.test.ts`** includes a fully hand-derived, independently-calculated end-to-end case:
  round-number historicals compounding at a flat 10% growth rate with a WACC that also happens to
  equal 10%, chosen specifically so every year's present value collapses to the same clean number
  (144.00) — verified against `runDcf()`'s output to 4-6 decimal places. It also covers
  scenario-delta ordering (Bear < Base < Bull), `waccOverride` behavior, and every blocking
  validation path (WACC ≤ g, missing shares/debt/cash, empty historicals) propagating correctly
  through the *whole* pipeline, not just the isolated function that first detects them.
- `wacc.test.ts` and `terminalValue.test.ts` each include their own hand-verified cases
  (e.g. Rf 4% + beta 1.2 × ERP 5.5% = 10.6% cost of equity, cross-checked against 80/20 debt
  weighting to a WACC of 9.23%).

### Known limitations (Milestone 5)

- Risk-free rate and equity risk premium are always user-entered — no live market-data feed yet.
- Equity value nets out cash and total debt only; minority interest and preferred stock aren't
  stored yet, so they aren't netted.
- Beta and market capitalization depend on the Financial Modeling Prep integration (`FMP_API_KEY`);
  when unconfigured, beta defaults to a market-neutral 1.0 and market cap needs the manual
  override field described above.
- Net working capital falls back to a gross (not operating) definition when a filer doesn't break
  out cash or short-term debt.
- Tax rate is a single flat forecast rate, not faded or scheduled year by year.
- Bear/Bull scenarios share one editable delta set rather than fully independent assumption
  objects — a deliberate simplification (see `scenarios.ts`'s module doc comment) that still
  satisfies "every scenario is editable" without duplicating the entire assumptions UI three times.
- Explicitly out of scope for this milestone: comparable company analysis, precedent transactions,
  an AI investment memo, earnings-call analysis, and portfolio management.

## Comparable Company Analysis architecture (Milestone 6)

A comps engine that screens for peers using financial and business characteristics (not just
market cap), calculates the standard set of valuation multiples with explicit N/M handling, and
estimates an implied valuation — reusing Milestone 2-5's data and calculation infrastructure
wherever possible. Workflow: **Company → Valuation → Comparable Companies**, at
`/company/[ticker]/comps`, with a methodology page at `/company/[ticker]/comps/methodology`.

### The calculation engine (`apps/web/lib/comps/`)

Same architectural pattern as `lib/valuation/` — pure, deterministic, no React/Prisma/fetch:

| Module               | Responsibility                                                                 |
| --------------------- | ------------------------------------------------------------------------------- |
| `types.ts`             | `CompanyValuationMetrics`, `Multiple`, `CompanyMultiples`, `PeerCandidate`, `CompsResult`, etc. |
| `metrics.ts`           | Builds a company's metrics snapshot from `CompanyOverview` + `FinancialPeriodData` (EBITDA derivation) |
| `multiples.ts`         | EV, EV/Revenue, EV/EBITDA, EV/EBIT, P/E, P/S, P/B — with N/M status handling     |
| `statistics.ts`        | median/mean/min/max                                                             |
| `outliers.ts`          | Tukey's IQR outlier flagging                                                    |
| `peerScoring.ts`       | The documented, weighted similarity-scoring formula                             |
| `impliedValuation.ts`  | Target Metric × Peer Median Multiple → implied EV/equity/share price (reuses `lib/valuation/bridge.ts`) |
| `engine.ts`            | `runComps()` — the single entry point wiring everything above together          |

`Tagged<T>`/`AssumptionSource`/`ValidationIssue` were extracted from `lib/valuation/types.ts` into
`lib/shared/tagged.ts` (Milestone 5's file still re-exports them unchanged — no existing import
needed to change) specifically so this engine could reuse the same provenance convention rather
than inventing a parallel one.

### Peer-selection methodology

Candidates come from two sources: companies already in Atlas's own database sharing the target's
sector/industry, and (when `FMP_API_KEY` is configured) Financial Modeling Prep's stock-peers
endpoint. Nothing is invented — a sparsely-populated local database with no FMP key will honestly
suggest fewer (or zero) candidates rather than fabricating a peer list; the user can always search
for and add any company manually regardless.

Each candidate is scored on five normalized (0-1) dimensions, combined with fixed, documented
weights into a single 0-100 total:

```
Industry (30%)    — exact industry match = 1.0, sector-only match = 0.5, neither = 0.0
Revenue (20%)     — log-scale distance (spans orders of magnitude); ~32x apart scores 0
Market Cap (20%)  — same log-scale approach as revenue
Growth (15%)      — linear distance on revenue growth; 50 percentage points apart scores 0
EBITDA Margin (15%) — linear distance; 50 percentage points apart scores 0
```

If a dimension can't be computed (missing data on either side), it's dropped from the weighted
average and the remaining weights are rescaled to sum to 1 — a company with one year of history
isn't unfairly penalized for a gap in Atlas's data. The user always has final control: accept a
suggestion, remove any peer, search for and add another company, or reset to the suggested set.

### Valuation multiples and N/M handling

```
Enterprise Value = Market Cap + Total Debt − Cash
EBITDA = EBIT + D&A (always derived, never a directly-reported line item)
```

Every multiple routes through one function (`computeMultiple`) that returns a `{ value, status }`
pair rather than a bare number: `status` is `'ok'`, `'notMeaningful'` (denominator ≤ 0 — negative
EBITDA, negative earnings, zero revenue), or `'missingData'` (an input, most often EBITDA, isn't
available at all). These are structurally distinct outcomes, verified live against JPMorgan's real
SEC data — a bank reports no operating-income line, so its EV/EBIT and EV/EBITDA correctly come
back `missingData` rather than a fabricated or estimated figure.

### Outlier methodology

Potential outliers are flagged per multiple using Tukey's IQR method: sort the peer set's values,
split at the median into a lower/upper half, Q1/Q3 = the median of each half, IQR = Q3 − Q1,
bounds = [Q1 − 1.5×IQR, Q3 + 1.5×IQR]. Flagging is purely informational — nothing is excluded
automatically. "Raw" statistics always reflect every selected peer; "Adjusted" statistics reflect
the set after the user's own exclusions (which may or may not be the flagged companies); the
implied valuation always uses the adjusted median.

### Implied valuation

```
EV/Revenue, EV/EBITDA, EV/EBIT:
  Target Metric × Peer Adjusted-Median Multiple = Implied Enterprise Value
  Implied Enterprise Value + Cash − Total Debt = Implied Equity Value   (reuses lib/valuation/bridge.ts)
P/E:
  Target Net Income × Peer Adjusted-Median P/E = Implied Equity Value  (directly, no EV step)
Implied Equity Value ÷ Diluted Shares Outstanding = Implied Share Price
```

A methodology is Not Meaningful whenever the target's own base metric is missing or non-positive,
or the peer median itself is unavailable — the row is still shown, just with nulls, never removed.
The "Median Implied Price" is the median across only the meaningful methodologies, never a blend.

### API design

Four endpoints under `/api/v1/companies/[ticker]/`, following the app's existing route
conventions: `peer-candidates` (ranked, scored suggestions), `comps?peers=A,B,C` (raw data —
the UI fetches this once and runs `runComps()` itself client-side so toggling a peer recomputes
instantly, the same pattern as Milestone 5's `DcfWorkspace`), `valuation-multiples` and
`implied-valuation` (both run the engine server-side and return a focused slice — a demonstration
that the engine is genuinely isomorphic, and standalone endpoints for any API consumer).

### Testing the calculation engine

```bash
pnpm test
```

66+ tests across `lib/comps/`'s 7 modules, entirely independent of the browser/UI, plus a fully
hand-derived end-to-end case in `engine.test.ts`: 8 synthetic peers with EV/Revenue multiples
10-16x and one 100x outlier, matching the exact shape already hand-verified in `outliers.test.ts`
(bounds [5.5, 21.5], only the 100x peer flagged). It verifies raw statistics ignore exclusion, the
outlier is flagged without being auto-removed, adjusted statistics recompute once the user excludes
it (median 13.5 → 13), and the implied valuation uses that adjusted median (target revenue 1000 ×
13 = 13,000 implied EV → $128 implied share price) — not the raw one.

### Known limitations (Milestone 6)

- Peer discovery depends on Atlas's own database and (optionally) an FMP API key — verified live:
  with neither populated, the suggested-peer list is honestly empty rather than fabricated.
- Peer candidates are capped (20 fetched, 15 ranked) to bound external requests per page load.
- Historical multiples (current vs. historical median/range) aren't available yet — Atlas stores
  only the latest stock quote, not a price history; the architecture is ready (`computeCompanyMultiples`
  works on any price/period pair already) but the panel is intentionally left as "not yet available."
- Bear/Bull-style scenario multiples aren't part of this milestone — only a single peer-median-based
  implied valuation per methodology.
- Explicitly out of scope: precedent transactions, an AI investment memo, earnings-call analysis,
  and portfolio management.

## SEC Filing Intelligence architecture (Milestone 7)

A filing research system that retrieves, parses, and (on request) AI-analyzes a company's SEC
filings — 10-K, 10-Q, 8-K, and where available DEF 14A/20-F. Workflow: **Company → Research → SEC
Filings**, at `/company/[ticker]/filings`, with a detail/analysis page per filing and a methodology
page at `/company/[ticker]/filings/methodology`.

### SEC data pipeline

`lib/providers/secEdgar.ts` (extended from Milestone 3, same `fetchSec`/rate-limit/User-Agent
plumbing) adds `getSubmissions()` (SEC's filing-list JSON, reshaped from its columnar
parallel-array format into one record per filing) and `getFilingDocument()` (the raw HTML of a
filing's primary document). `buildFilingUrl()` constructs the public sec.gov Archives URL from a
CIK and accession number. `lib/sec/types.ts`'s `classifyFormType()` buckets a raw SEC form label
("10-K", "10-K/A", "8-K", ...) into Atlas's supported `SecFilingType`.

### Filing-processing pipeline (`lib/sec/`, `lib/services/secFilingService.ts`)

Deliberately five separate, independently-tested modules — never one function doing everything:

```
SEC EDGAR submissions -> SecFiling metadata (dedup on companyId+accessionNumber)
  -> filing document retrieval (getFilingDocument, on demand)
  -> lib/sec/htmlExtraction.ts   — a real DOM walk (cheerio) into an ordered sequence of
                                    text/table blocks; not regex-over-HTML, since EDGAR filings
                                    are generated by dozens of vendor toolchains with wildly
                                    inconsistent markup for the same visual structure
  -> lib/sec/sectionExtraction.ts — identifies 10-K/10-Q Items and 8-K items by matching each
                                    block's own text against documented heading patterns; the
                                    LAST match of each pattern wins, which reliably picks the real
                                    section over an identical Table-of-Contents reference
  -> lib/sec/textCleaning.ts     — removes bare page-number lines and boilerplate, normalizes
                                    whitespace; never touches a surviving line's numbers/dates/words
  -> FilingSection rows (regenerated on reprocessing, same delete+recreate pattern as
     RawFinancialFact), FilingProcessingStatus tracks exactly which stage a filing is at
```

Verified live against real, current Apple 10-K/10-Q/8-K filings: all 8 expected 10-K sections
(Business, Risk Factors, Legal Proceedings, MD&A, Liquidity, Market Risk, Financial Statements,
Controls and Procedures) were correctly identified and separated, including Liquidity being
correctly carved out from inside MD&A's range.

### AI-analysis pipeline (`lib/ai/`)

`lib/ai/anthropicClient.ts` is the only file that knows the Anthropic API shape — every AI call
forces a single tool call (`strict: true`) so the model can only respond in the exact JSON shape
`lib/ai/schema.ts` defines (zod schemas that double as the source of truth for the JSON Schema
sent to Anthropic). `lib/ai/runStructuredAnalysis.ts` validates the response against that zod
schema independently of Anthropic's own `strict` guarantee, retries once with a corrective message
on failure, and reports a clean failure rather than fabricating a result if it fails twice.
`lib/ai/sectionSelection.ts` is the cost-control layer — only narrative sections are sent (never
Financial Statements' raw tables), capped at ~8,000 characters per section and ~40,000 total.
`lib/ai/analyzeFiling.ts` (full analysis) and `lib/ai/compareFilings.ts` (qualitative comparison
only — see below) are the two orchestrators; `lib/services/secFilingService.ts` calls them, never
automatically, only when a user clicks Generate/Regenerate.

### AI output schema

```json
{
  "summary": "...",
  "key_changes": [{ "description": "...", "source": { "section": "MDA", "excerpt": "..." } }],
  "risks": [{ "description": "...", "category": "operational", "source": { "section": "RISK_FACTORS", "excerpt": "..." } }],
  "management_commentary": [...],
  "capital_allocation": [...],
  "accounting_changes": [...]
}
```

`category` is restricted to exactly the eight required values (financial, operational, regulatory,
legal, competitive, macroeconomic, liquidity, governance) — an invalid category fails validation,
it's never silently accepted.

### Citation / source traceability

Every AI-generated item carries a `source: { section, excerpt }`. The UI's `CitationBadge`
resolves `section` against the filing's actual extracted `FilingSection` rows and renders a "View
Source →" link that scrolls to (and expands, if collapsed) that exact section in the Source
Document view. Because SEC HTML filings have no stable per-line anchors the way a paginated PDF
does, citations are section + verbatim excerpt — the most precise traceability that's honestly
available — documented as a known limitation rather than faked as line-level.

### Filing comparison

"Compare with Previous Filing" splits into two genuinely different kinds of comparison, computed
and displayed separately:

- **Financial changes** (`lib/sec/financialChanges.ts`) — revenue/net-income growth, operating
  margin (in percentage points, not a growth-rate-of-a-ratio), cash, and debt — computed
  deterministically from Atlas's own stored `FinancialPeriod` data for both filings, reusing
  `lib/analytics/ratios.ts`. Verified live: correctly computed Apple's FY2025-vs-FY2024 10-K
  revenue growth (+6.43%), margin change (+0.5pp), and debt change (-6.19%) — and kept working
  even when the AI portion below it failed for lack of an API key.
- **Qualitative changes** (AI-generated) — new/removed risks, notable wording changes (always
  labeled "Potentially notable language change," never asserted as significant), guidance changes,
  and management-commentary changes — comparing only the Risk Factors, MD&A, and Liquidity
  sections of both filings.

### 8-K event categorization and the research timeline

`lib/sec/eightKItems.ts` maps SEC's own published Item taxonomy (Item 2.02 = Results of
Operations, Item 5.02 = Officer/Director changes, etc.) to a category and label — a fixed lookup
table, not an AI guess. `lib/sec/importance.ts` classifies every filing's research-timeline
importance (High/Medium/Low) from the same table plus filing type, entirely rule-based — 10-K/
10-Q are always High; 8-Ks disclosing earnings/acquisitions/bankruptcy are High; executive
changes/financing/material contracts are Medium; everything else is Low.

### Cost-control strategy

- An analysis or comparison is generated once and stored (`FilingAnalysis`/`FilingComparison`,
  one row per filing / per filing pair); viewing a filing again never re-calls the model.
- A **failed** generation is itself cached (status `FAILED` + the error message) so a persistent
  failure (e.g. no API key) doesn't retry on every page view either — only an explicit
  "Regenerate" click tries again.
- Every stored analysis/comparison records the model used and (for analyses) input/output token
  counts.
- Only narrative sections are sent to the model, with a documented per-section and total character
  budget (`lib/ai/sectionSelection.ts`).
- Financial figures in comparisons are computed once from already-stored data, never re-derived by
  the model from raw text.

### Testing

```bash
pnpm test
```

150+ tests across `lib/sec/` and `lib/ai/`, entirely independent of the browser and of real SEC/AI
network calls:

- `lib/sec/htmlExtraction.test.ts`, `sectionExtraction.test.ts`, `textCleaning.test.ts` — synthetic
  HTML fixtures covering nested markup, non-semantic "headings," inline XBRL tags, Table-of-Contents
  disambiguation, and 8-K item extraction.
- `lib/sec/eightKItems.test.ts`, `importance.test.ts` — the rule tables, including multi-item 8-Ks.
- `lib/sec/financialChanges.test.ts` — a hand-verified deterministic comparison case.
- `lib/sec/search.test.ts` — substring search, snippet splitting, per-section result capping.
- `lib/ai/schema.test.ts` — zod validation (including that the JSON Schema sent to Anthropic and
  the zod schema require the exact same fields) and that an invalid category/note is rejected.
- `lib/ai/sectionSelection.test.ts` — the character-budget/truncation logic.
- `lib/ai/runStructuredAnalysis.test.ts`, `analyzeFiling.test.ts`, `compareFilings.test.ts` — the
  retry-on-invalid-schema behavior and prompt construction, with the Anthropic client mocked (no
  real API calls, no API key needed to run the suite).
- `lib/services/secFilingService.test.ts` — a real-Postgres integration test (SEC and the LLM
  mocked, following financialDataService.test.ts's precedent): sync + duplicate prevention,
  processing a filing into real sections, AI-analysis caching (confirms the provider is called
  exactly once per generation, not on every view), and search.

### Configuring the LLM API

Set `ANTHROPIC_API_KEY` (and optionally `ANTHROPIC_MODEL`, default `claude-sonnet-4-5`) in
`apps/web/.env` — see `.env.example`. Without it, filing retrieval, processing, section browsing,
and search all work exactly the same; only "Generate Analysis"/"Generate Comparison" report a
clear, cached failure rather than fabricating a result — verified live throughout this milestone's
development, since no key is configured in this dev environment.

### Known limitations (Milestone 7)

- Section extraction is heading-pattern based; a filing with highly unusual formatting may leave
  some content uncategorized as "Other" rather than under its specific section.
- DEF 14A and 20-F filings are retrieved, listed, and linked to their original SEC document, but
  section extraction/AI analysis currently focus on 10-K/10-Q/8-K, as the milestone prioritized.
- Citations are section + excerpt, not a line/page number — SEC HTML filings have no stable
  per-line anchors to cite precisely.
- The filing list reads SEC's "recent filings" window (roughly the last ~1,000 filings per
  company), which comfortably covers active research use but not a company's very oldest filings.
- No background job queue exists yet; processing/analysis run synchronously on request rather than
  via a worker — the pipeline functions are already decoupled from the trigger, so a future queue
  can call the same `processFiling`/`analyzeFiling` functions without changes.
- A single LLM provider (Anthropic) is wired up; `lib/ai/anthropicClient.ts` is the one file that
  would need to change to support an alternate provider.

## Earnings Call Intelligence architecture (Milestone 8)

An earnings-call research system that retrieves, parses, and (on request) AI-analyzes a company's
quarterly earnings-call transcripts alongside its financial results and SEC filings. Workflow:
**Company → Research → Earnings Calls**, at `/company/[ticker]/earnings`, with a detail/analysis
page per call and a methodology page at `/company/[ticker]/earnings/methodology`.

### Transcript data source

Transcripts come from Financial Modeling Prep, isolated in `lib/providers/fmp.ts` behind
`getEarningsCallTranscriptFmp()`/`getEarningsCallTranscriptDatesFmp()` — the only file that knows
FMP's transcript-endpoint shape, so a second/alternate provider could be added later without
touching `lib/earnings/` or `lib/services/earningsCallService.ts`. FMP gates full transcript
access behind a paid subscription tier this project's key doesn't have; a 402/403 response is
treated as a normal, expected "not available" outcome (`ProviderRequestError.status`), not an
error — the earnings-call service classifies it as `UNAVAILABLE`, distinct from `FAILED`
(an unexpected error). FMP has no endpoint to list "which quarters exist" without that same paid
tier, so the call list is instead derived from the company's own already-ingested quarterly
`FinancialPeriod` data (Milestones 3/4) — a company that filed a 10-Q for a quarter is assumed to
have held a corresponding call, and each call's transcript is then fetched independently. Nothing
is ever fabricated: a call with no retrievable transcript shows "Transcript unavailable," never
placeholder text.

### The transcript-processing pipeline (`lib/earnings/`, `lib/services/earningsCallService.ts`)

```
FMP earnings-call-transcript endpoint (isolated in lib/providers/fmp.ts)
  -> EarningsCall metadata (dedup on companyId+fiscalYear+fiscalQuarter, derived from
     Atlas's own quarterly FinancialPeriod data)
  -> raw transcript retrieval, on demand — a 402/403 or missing transcript marks the call
     UNAVAILABLE, never fabricated
  -> lib/earnings/transcriptParsing.ts — deterministic speaker/section parsing: splits
     the raw text into Opening Remarks / Prepared Remarks / Q&A, tagging each turn's
     speaker name, role, and type (executive/analyst/operator) via heading-pattern and
     roster heuristics, not an LLM
  -> TranscriptSegment rows (regenerated on reprocessing, same delete+recreate pattern as
     FilingSection), CallProcessingStatus tracks exactly which stage a call is at
```

Speaker classification works by building an "executive roster" as the transcript is walked in
order: anyone who speaks before the Q&A transition is management by construction; during Q&A, a
speaker already on that roster (or whose stated title contains a keyword like "Chief"/"Officer")
is EXECUTIVE, anyone new is ANALYST. Verified in `lib/earnings/transcriptParsing.test.ts` against
a synthetic multi-speaker transcript, including a CFO answering in Q&A being correctly recognized
from the prepared-remarks roster rather than misread as an analyst.

### Financial results — never AI-generated

`lib/earnings/financialResults.ts` computes every reported figure (revenue, diluted EPS, gross/
operating/net margin, net income, free cash flow) deterministically from Atlas's own normalized
`FinancialPeriod` data — the same figures the Financials and Valuation pages already show — with
both a quarter-over-quarter and a year-over-year comparison. The transcript and the AI model are
never the source of a reported number. Atlas has no analyst-estimates data source configured, so
ESTIMATE comparisons are simply omitted (`Do NOT invent analyst estimates` from the spec), never
fabricated; the UI states this explicitly rather than silently hiding the gap.

### Guidance methodology (`lib/earnings/guidance.ts`)

The AI extracts guidance *candidates* only — metric, period, and the low/high figures management
actually said — from prepared remarks and Q&A, explicitly instructed not to compute a midpoint or
compare against prior guidance itself. Midpoint (`(Low + High) / 2`, or the single stated value
for a one-sided guide) and the change label are always computed afterward in plain TypeScript,
matched against the *previous call's* `GuidanceObservation` rows for the same metric + period
(exact string match). Verified end-to-end in `lib/services/earningsCallService.test.ts` against a
real Postgres database: a first call's revenue guidance ($400–410B midpoint 405) resolves to
`NEW` (no prior to compare against), and the next quarter's revised guidance ($410–420B midpoint
415) resolves to `INCREASED` against it — exactly the spec's worked example
("$10.0–10.5B → $10.5–11.0B ⇒ Guidance increased"), reproduced with real values through the full
sync → process → analyze → resolve pipeline, not just in isolation.

### AI-analysis pipeline (`lib/ai/`)

Reuses Milestone 7's generic AI infrastructure unchanged — `lib/ai/anthropicClient.ts` (forced
single tool call, `strict: true`) and `lib/ai/runStructuredAnalysis.ts` (independent zod
validation, one corrective retry, clean failure rather than a fabricated result). Three new,
earnings-specific pieces:

- `lib/ai/earningsSchema.ts` — the zod + hand-written JSON Schema pair for all three earnings AI
  calls, cross-checked in `earningsSchema.test.ts` the same way Milestone 7's schema is.
- `lib/ai/earningsSectionSelection.ts` — the cost-control layer: only Prepared Remarks and Q&A
  transcript segments are sent (the operator's procedural opening is excluded), budgeted per
  segment and in total, since a transcript is naturally many small speaker turns rather than a
  few large filing sections.
- `lib/ai/analyzeEarningsCall.ts`, `compareEarningsCalls.ts`, `compareEarningsToFiling.ts` — the
  three orchestrators; `lib/services/earningsCallService.ts` calls them, never automatically, only
  on Generate/Regenerate.

### AI output schema

```json
{
  "summary": "...",
  "business_trends": [{ "category": "demand", "description": "...", "source": { "speaker": "Alex Chen (CEO)", "excerpt": "..." } }],
  "management_commentary": [...],
  "guidance_observations": [{ "metric": "REVENUE", "metric_label": "...", "period": "Q4 2025", "low": 10.5, "high": 11.0, "source": {...} }],
  "risks": [{ "category": "supply_chain", "description": "...", "source": {...} }],
  "capital_allocation": [...],
  "analyst_topics": [{ "analyst": "...", "firm": "...", "topic": "Margins", "question_summary": "...", "response_summary": "...", "source": {...} }],
  "management_language": [{ "dimension": "confidence", "level": "high", "observation": "...", "source": {...} }]
}
```

Every enum (`category`, `metric`, `dimension`, `level`) is a fixed zod enum an invalid value fails
validation against — the model can't invent its own category the way it can't in Milestone 7.
Citations use `{ speaker, excerpt }` rather than filing's `{ section, excerpt }`, since a
transcript's useful unit of traceability is who said it, not a coarse document section.

### Q&A analysis — deterministic pairing, AI summarization

`lib/earnings/qaSeparation.ts` pairs each analyst turn in the Q&A section with the management
turn(s) that follow it — pure code, no AI. The AI is only asked to summarize each already-paired
exchange and assign it a short topic label; the per-topic *question counts* shown in the UI are
always a deterministic rollup grouped from those labels in the `/qa` API route, never counted by
the model itself.

### Management-tone methodology

Explicitly labeled **"AI-based language analysis"** throughout the UI and methodology page — never
presented as a measurement of management's true intentions. Five dimensions (confidence, caution,
uncertainty, optimism, defensiveness), each a categorical `low`/`moderate`/`high` level — never a
numeric score — always backed by a cited excerpt. `lib/ai/compareEarningsCalls.ts` extends this
into a tone comparison against the previous call when one exists.

### Citation / source traceability

Every AI-generated item carries a `source: { speaker, excerpt }`. The UI's
`EarningsCitationBadge` resolves the excerpt against the call's actual `TranscriptSegment` rows by
substring match (`resolveSegmentAnchor.ts`) and renders a "View Source →" link that scrolls to
that exact speaker turn in the Source Transcript view. When no matching segment is found, the
excerpt still displays — never hidden — just without a jump link.

### Filing comparison

Two genuinely different comparisons, computed and displayed separately:

- **"Compare with Previous Quarter"** — deterministic financial changes (reusing the same QoQ
  figures `lib/earnings/financialResults.ts` already computed) plus a deterministic guidance-
  change summary (the current call's already-resolved `GuidanceObservation` rows), alongside
  AI-generated qualitative language changes (labeled exactly "New topic," "Changed emphasis," or
  "Similar commentary" — never asserted to be a business change on its own) and a tone comparison.
- **"Compare with SEC Filing"** — cross-source research against the 10-Q/10-K whose period best
  matches the call (`findMatchingSecFiling`, reusing Milestone 7's `getFilingWithSections`),
  entirely AI-generated since both sources are narrative. Every difference uses neutral framing —
  "Potential difference in emphasis" — and the prompt explicitly forbids ever claiming management
  is contradicting the filing.

### Cost-control strategy

- An analysis or comparison is generated once and stored (`EarningsAnalysis`/`EarningsComparison`/
  `EarningsFilingComparison`, one row per call / call pair / call+filing pair); viewing a call
  again never re-calls the model.
- A **failed** generation is itself cached (status `FAILED` + the error message) so a persistent
  failure doesn't retry on every page view — only an explicit "Regenerate" click tries again.
- Every stored analysis records the model used and input/output token counts.
- Only Prepared Remarks and Q&A segments are sent to the model, with a documented per-segment and
  total character budget (`lib/ai/earningsSectionSelection.ts`).
- Financial figures and guidance math are computed once from already-stored data, never
  re-derived by the model from text.

### Testing

```bash
pnpm test
```

86 new tests (393 → 479 total) across `lib/earnings/`, `lib/ai/`, and `lib/services/`, entirely independent of the
browser and of real FMP/AI network calls:

- `lib/earnings/transcriptParsing.test.ts` — a synthetic multi-speaker fixture covering section
  transitions, speaker-role parsing, continuation-paragraph merging, and boilerplate-header
  dropping.
- `lib/earnings/qaSeparation.test.ts` — question/answer pairing, multi-executive answers, operator
  turns that don't break an exchange, and consistency against a fully-parsed transcript.
- `lib/earnings/financialResults.test.ts` — hand-verified QoQ/YoY growth and margin-points math,
  plus prior-quarter/prior-year period lookup including year rollover.
- `lib/earnings/guidance.test.ts` — midpoint computation and the change label, including the
  spec's own worked example reproduced exactly.
- `lib/earnings/search.test.ts` — substring search, snippet splitting, per-segment result capping.
- `lib/ai/earningsSchema.test.ts` — zod validation of all three AI output shapes, including that
  every hand-written JSON Schema's required fields match its zod schema's.
- `lib/ai/earningsSectionSelection.test.ts` — the character-budget/truncation/opening-remarks-
  exclusion logic.
- `lib/ai/analyzeEarningsCall.test.ts`, `compareEarningsCalls.test.ts`,
  `compareEarningsToFiling.test.ts` — prompt construction and payload validation, Anthropic client
  mocked (no real API calls, no key needed to run the suite).
- `lib/services/earningsCallService.test.ts` — a real-Postgres integration test (SEC financial
  data and the LLM mocked, FMP transcripts mocked including one quarter deliberately returning no
  transcript): call-list sync + duplicate prevention, transcript processing into real segments (and
  the graceful `UNAVAILABLE` path), AI-analysis caching, and the guidance NEW → INCREASED
  resolution across two real calls end-to-end.

### Configuring the LLM API

Same `ANTHROPIC_API_KEY`/`ANTHROPIC_MODEL` configuration as Milestone 7 (`apps/web/.env`) — no
separate key is needed for earnings-call analysis. Without it, transcript retrieval, processing,
segment browsing, and search all work exactly the same; only "Generate Analysis"/"Generate
Comparison" report a clear, cached failure.

### Known limitations (Milestone 8)

- Live transcript retrieval requires an FMP plan with transcript access, which this project's key
  doesn't have — the full pipeline (schema, parsing, AI analysis, UI, tests with fixtures) is built
  and verified against a real Postgres database with FMP mocked; live transcripts will start
  flowing the moment the FMP plan is upgraded, with no code changes required.
- Speaker classification (executive vs. analyst) is heuristic; an executive whose only appearance
  is answering a Q&A question, without a recognizable title keyword, can occasionally be
  misclassified as an analyst.
- Analyst-question topic labels are the AI's own short phrases; semantically identical topics
  worded slightly differently across questions may not always group together in the count rollup.
- The earnings-call list is derived from Atlas's own ingested quarterly financial data, so a
  company with no quarterly filings ingested yet won't show any calls until that data syncs.
- Analyst-estimate comparisons are not available — no estimates data source is configured, and
  none is fabricated.
- No background job queue exists yet, matching Milestone 7 — processing/analysis run
  synchronously on request; the pipeline functions are already decoupled from the trigger, so a
  future queue can call the same functions unchanged.

## Research Report Generator architecture (Milestone 9)

A structured, source-cited equity research report that synthesizes everything Atlas already knows
about a company — fundamentals, DCF, comps, SEC filing intelligence, earnings-call intelligence —
into one document. Workflow: **Company → Research Report**, at `/company/[ticker]/report`, with a
version selector, a print/export button, and a methodology page at
`/company/[ticker]/report/methodology`. It is explicitly not a chatbot: the model is never given a
tool or API of its own, and it never calculates a number — it only organizes and explains a fixed
context the backend assembles for it.

### The research-data aggregation pipeline (`lib/research/aggregateResearchContext.ts`)

```
User → "Generate Research Report"
  -> lib/research/aggregateResearchContext.ts (the ONLY place that decides what goes
     into a report's context)
       - Company profile & market data           (Milestone 2, getCompanyOverview)
       - Historical financial statements          (Milestones 3/4, getFinancials)
       - DCF valuation, Bear/Base/Bull             (Milestone 5's runDcf/buildDefaultAssumptions,
                                                     re-run fresh with the same default
                                                     assumptions the Valuation page uses —
                                                     never recalculated by hand, never persisted)
       - Comparable-company valuation               (Milestone 6's runComps, re-run fresh against
                                                     the same auto-selected top-6-peer set the
                                                     Comps page defaults to)
       - Latest SEC filing analysis                 (Milestone 7, read via the read-only
                                                     getExistingAnalysis accessor — never triggers
                                                     a new AI call or filing fetch)
       - Latest earnings-call analysis + guidance    (Milestone 8, same read-only pattern)
  -> a normalized ResearchContext: every number pre-computed, every fact paired with a
     source ID from a backend-owned, closed source registry
  -> lib/ai/reportPrompts.ts renders the ENTIRE context into one plain-text prompt —
     every figure already formatted with the exact same formatCompactCurrency/
     formatRatioAsPercent helpers the UI uses, plus the numbered list of sources the
     model is permitted to cite
  -> the LLM (structured tool call, lib/ai/generateResearchReport.ts)
  -> lib/ai/generateResearchReport.ts strips any cited source ID that doesn't exist in
     the registry
  -> lib/services/researchReportService.ts persists it as a NEW, numbered ResearchReport
     version (never overwrites a prior one)
  -> components/company/report/ (the report UI)
```

Both the DCF and comps engines are reused exactly as the Valuation and Comparable Companies pages
already call them — `deriveHistoricalYears` → `buildMarketData` → `buildDefaultAssumptions` →
`runDcf` (once per scenario, using `lib/valuation/scenarios.ts`'s existing `DEFAULT_BEAR_DELTAS`/
`DEFAULT_BULL_DELTAS`), and `getPeerCandidates` + `fetchTargetAndPeers` → `runComps` with the same
`DEFAULT_PEER_COUNT = 6` the Comps page defaults to. Neither engine is a Prisma model — both are
pure, side-effect-free functions with no persisted state, so re-running them for a report introduces
no duplication and can never drift from what the Valuation/Comps pages themselves show. SEC and
earnings-call insights are read via each service's `getExistingAnalysis` accessor only (aliased
per-module, since both `secFilingService.ts` and `earningsCallService.ts` export a function with
that exact name) — never the `getOrCreate*`/`process*` functions that would trigger a new,
costly AI call as a hidden side effect of generating a report.

### How the model receives context

`lib/ai/reportPrompts.ts` renders the full `ResearchContext` into one text block: company overview,
financial performance (a formatted table, oldest-to-newest), DCF scenarios (assumptions and outputs
per Bear/Base/Bull), comps multiples and peer set, SEC filing insights, earnings-call insights and
guidance, and a numbered `AVAILABLE SOURCES` list. SEC/earnings-call insight lists are truncated
first via `lib/ai/reportSectionSelection.ts` (`MAX_LIST_ITEMS = 12`, `MAX_CHARS_PER_ITEM = 400`) —
a simpler budget than Milestones 7/8 need, since the input here is already-synthesized analysis
JSON, not a raw filing or transcript. The model is never shown a raw database row and never given
a tool, function, or external API of its own.

### Structured output — no field for a number anywhere

`lib/ai/reportSchema.ts`'s `researchReportAiSchema` is narrative-only: 14 top-level fields, each
either `{ text, source_ids }`, a categorized `{ category, description, source_ids }` list item
(growth drivers, SEC insights, earnings insights, catalysts each get their own category enum
matching the milestone spec's vocabulary), the richer risk shape (`risk`/`why_it_matters`/
`evidence`/`source_ids`), or the five-field neutral conclusion. **There is no numeric field
anywhere in this schema** — no price, no percentage, no multiple — which is the concrete mechanism
behind "the LLM must not calculate financial metrics": there is structurally no place to put a
number. Every actual number in the rendered report comes from `ResearchContext`, merged in
server-side. The response is validated against the same zod schema server-side (independent of the
provider's own schema enforcement, matching Milestones 7/8's `runStructuredAnalysis` — one
corrective retry, then a recorded failure).

### Citation architecture — a closed, backend-built registry

`aggregateResearchContext.ts`'s `createSourceRegistry()` assigns sequential 1-based IDs as each
context section is actually built (in order: financial statements → DCF model → comps model → SEC
filing → earnings call) — a source is only ever registered once its data is confirmed to exist,
never speculatively added and popped on failure, so a thrown exception can never leave an orphaned,
uncited source ID behind. The model may only cite IDs from this closed list; after generation,
`lib/ai/generateResearchReport.ts`'s `sanitizeReportPayload()` walks every `source_ids` array in the
response and drops any ID that doesn't resolve to a real source — the backend injects valid
citations, it never trusts the model's own claim at face value. In the UI, every citation renders as
a small numbered chip (`components/company/report/SourceCitation.tsx`) that jumps to and briefly
highlights the matching card in the Research Sources section
(`components/company/report/SourcesSection.tsx`), which links out to the underlying SEC filing or
earnings-call detail page where one exists.

### Hallucination safeguards

- No numeric field exists anywhere in the AI's output schema (see above) — every number comes from
  Atlas's own engines, never from the model.
- Every citation is checked against the closed, backend-built source registry; invented IDs are
  silently stripped before storage.
- The system prompt (`RESEARCH_REPORT_SYSTEM_PROMPT` in `lib/ai/reportPrompts.ts`) explicitly
  instructs the model to write "Insufficient data to determine." rather than guess, and forbids
  inventing a financial number, analyst estimate, management quote, corporate event, source,
  catalyst, or risk.
- Growth drivers, SEC/earnings insights, catalysts, and risks are all optional lists — an empty
  array is a valid, expected outcome (verified directly by
  `aggregateResearchContext.test.ts`'s incomplete-data test and
  `reportSchema.test.ts`'s empty-arrays-valid test), not something the model is pressured to fill.
- The model is explicitly forbidden from outputting "Buy"/"Sell"/"Strong Buy"/"Strong Sell"; the
  conclusion schema's fields are framed as neutral research language
  (`ConclusionSection.tsx` reinforces this with an explicit "not a recommendation" line in the UI).
- Catalysts are always labeled "Potential catalyst" in the UI
  (`CategorizedList.tsx`'s `itemBadge` prop) regardless of the model's own phrasing, so the
  labeling requirement can never be silently dropped by an imperfect generation.

### Report versioning

`ResearchReport` (`companyId`, `version`, `status`, `model`, `error`, `dataSnapshotAt`, `content`,
token counts) is unique on `(companyId, version)`. `researchReportService.createReport()` always
computes `version = (latest ?? 0) + 1` and **inserts a new row** — it never upserts onto or
overwrites a previous version, so every regeneration is independently browsable and comparable. A
failed generation (AI not configured, or a request/validation failure after the corrective retry)
is not swallowed as an exception; it's persisted as its own `FAILED` version with the error message,
same "cache the failure, don't silently retry on every view" discipline as Milestones 7/8.
`content` (a Json column) stores the full merged `{ context, report }` — every number, source, and
narrative field a version needs — so re-rendering a stored report never touches the AI or the
calculation engines again.

### PDF / print export

The "Print / Export" button (`ReportWorkspace.tsx`) calls the browser's native print dialog, which
offers "Save as PDF" on every major browser — deliberately not a custom PDF-rendering library, which
would risk becoming exactly the "low-quality screenshot-style PDF" the milestone spec explicitly
warns against. `app/globals.css` adds print-specific rules: every collapsed `<details>` section
(`ReportSection.tsx`) forces open regardless of its on-screen state, and `print:hidden` hides
navigation, buttons, and citation chips in favor of the numbered Research Sources list — the printed
document is a clean, text-first artifact, not a screenshot of the on-screen layout.

### Report freshness

Every `ResearchContext` carries a `dataSnapshotAt` timestamp and a `warnings: string[]` array —
populated whenever a data source came back stale, unavailable, or couldn't fully resolve (e.g. a
DCF that can't compute WACC, no comps peers found), never silently dropped. The report header
(`ReportHeader.tsx`) always displays "Research data through: [date]" and additionally flags "Some
research inputs may be outdated" whenever the snapshot is older than 14 days or any warning exists —
the report never implies real-time information it doesn't actually have.

### AI-generation gating

Same `isAiConfigured()` pattern introduced for Milestones 7/8: when `ANTHROPIC_API_KEY` isn't set,
the "Generate"/"Regenerate" buttons never render, and a cached `FAILED` version renders the same
neutral "AI-generated report analysis isn't enabled in this environment" message rather than a raw
error — applied to the report workspace from the start, rather than retrofitted after the fact.

### Testing

New tests across `lib/research/`, `lib/ai/`, and `lib/services/`, entirely independent of the
browser and of real FMP/AI network calls:

- `lib/research/aggregateResearchContext.test.ts` — a full happy-path fixture asserting the exact
  source order/IDs, **the spec's explicitly-required incomplete-data test** (empty periods/comps
  candidates/filings/calls in → every downstream section present-but-null with descriptive
  warnings, never fabricated), company-not-found propagation/rewrapping, and a
  no-peers-means-no-`COMPS_MODEL`-source test (the dangling-citation bug fix, verified directly).
- `lib/ai/reportSchema.test.ts` — zod validation of the full payload shape, invalid category
  rejection, missing/non-integer/non-positive `source_ids` rejection, empty-arrays-valid and
  empty-`source_ids`-valid (an empty list/citation is not an error), and tool-schema/zod-schema key
  consistency.
- `lib/ai/reportSectionSelection.test.ts` — the item-count/character-budget truncation logic.
- `lib/ai/generateResearchReport.test.ts` — the validated payload/token-usage path, and (the
  citation-validation/hallucination-safeguard test) that a source ID the model invented is stripped
  from top-level narrative sections and from nested category items (risks, catalysts, growth
  drivers) alike, with `AiNotConfiguredError` propagated untouched.
- `lib/services/researchReportService.test.ts` — a real-Postgres integration test (the aggregator
  and AI generation mocked, since both are independently tested already): version 1 on first
  generation, version increments without deleting prior versions, a `FAILED` version persisted
  rather than an exception thrown, and `getLatestReport`/`getReport`/`ResearchReportNotFoundError`.

### Known limitations (Milestone 9)

- SEC filing and earnings-call insights are drawn only from the single most recent filing/call — a
  report doesn't synthesize a longer history of either.
- If no SEC filing or earnings-call analysis has been generated yet (Milestones 7/8), those
  sections of the report note that plainly rather than fabricating content.
- Comparable Company Analysis depends on Atlas being able to auto-select a peer set for the ticker;
  some tickers have no identifiable peers, in which case that section (and its contribution to
  Valuation) is simply omitted.
- Citation granularity is per-source, not per-sentence — a citation points to "the latest 10-K" or
  "the DCF model," not a specific paragraph or excerpt within it, unlike Milestones 7/8's
  per-excerpt citations.
- DCF output depends entirely on the same inputs the Valuation page needs (e.g. a company whose
  filings don't separately disclose interest expense can't resolve WACC without a manual override
  there) — a report for such a company faithfully shows the same blocking issue rather than
  papering over it, since the DCF engine is reused unmodified.
- No background job queue exists yet, matching Milestones 7/8 — generation runs synchronously on
  request.

## Portfolio & Watchlist Intelligence architecture (Milestone 10)

A research- and portfolio-monitoring layer on top of Milestones 1-9 — explicitly **not** a trading
platform: no brokerage connections, no order execution, and no buy/sell recommendation anywhere in
this milestone. Users can save companies to multiple watchlists, track a manually-entered portfolio,
monitor valuation/research changes, and configure research alerts, all scoped strictly to their own
account.

### Authentication

A lightweight, dependency-free design matching this codebase's own style (hand-rolled pipelines, no
auth framework):

- **Passwords** (`lib/auth/password.ts`) are hashed with Node's built-in `scrypt` — a random 16-byte
  salt per password, stored as `salt:hash`, verified with a constant-time comparison
  (`timingSafeEqual`). No new dependency (bcrypt/argon2) needed.
- **Sessions** (`lib/auth/session.ts`) are a random 32-byte token; only its SHA-256 hash is ever
  written to `Session.tokenHash` — the raw token lives solely in an httpOnly, `sameSite=lax` cookie.
  A leaked database dump alone can never be replayed as a valid session. The DB-only logic
  (`issueSession`/`resolveSessionToken`/`revokeSessionToken`) is separated from the
  `next/headers`-`cookies()`-bound wrappers so the former is directly unit-testable against a real
  Postgres database with no request context.
- **`requireUser()`** (`lib/auth/requireUser.ts`) is the single choke point every API route uses to
  either get a real `User` or throw `UnauthorizedError` → 401 — never a silent "no user" fallback.
- Routes: `POST /api/auth/register`, `POST /api/auth/login` (deliberately generic "Invalid email or
  password" for both an unknown email and a wrong password), `POST /api/auth/logout`,
  `GET /api/auth/me`. Pages: `/register`, `/login`.

### User-data architecture — shared vs. private

Per the milestone spec's own instruction ("Company financials → shared, Portfolio holdings →
private"), every M10 model is one of two kinds:

- **Private, per-user state**: `User`, `Session`, `UserPreferences`, `Watchlist`,
  `WatchlistCompany`, `Portfolio`, `PortfolioHolding`, `ResearchAlert`. Every read and write is
  scoped by `userId` — see Security below.
- **A thin private pointer onto shared data**: `SavedReport` is a join table onto Milestone 9's
  `ResearchReport` — the report content itself stays exactly where it was (global, versioned, one
  copy shared by every user), only the "I bookmarked this" row is private. `WatchlistCompany` and
  `PortfolioHolding` work the same way: they reference the shared `Company` row, they never copy or
  fork company data per user.

This means two different users watching the same ticker on their watchlists never duplicates the
underlying FMP/SEC requests — both read through the exact same TTL-cached `Company`/
`FinancialPeriod` rows every other Atlas page already shares (see Caching below).

### Watchlist architecture

`lib/services/watchlistService.ts` owns all CRUD (create/rename/delete a watchlist; add/remove/
reorder companies) plus row enrichment. Every mutation and read is funneled through
`getOwnedWatchlist(userId, watchlistId)`, which returns the **same** "not found" outcome whether the
ID doesn't exist at all or simply isn't owned by the caller — an API consumer probing IDs can never
learn "that id exists, you just don't own it."

Row data (current price, market cap, revenue growth, operating margin, FCF, EV/EBITDA, P/E, DCF
implied price, DCF upside/downside) is never computed in this file — it's entirely delegated to the
new `lib/valuation/quickValuation.ts`, a thin reuse layer that calls the *exact same* engine
functions (`runDcf`, `computeCompanyMultiples`) and services (`getCompanyOverview`, `getFinancials`,
`getCompanyValuationMetrics`) the Valuation/Comps/Research Report pages already call — nothing here
is a second, competing calculation.

Routes: `GET/POST /api/watchlists`, `GET/PATCH/DELETE /api/watchlists/[id]`,
`POST /api/watchlists/[id]/companies`, `DELETE /api/watchlists/[id]/companies/[ticker]`,
`POST /api/watchlists/[id]/reorder`. UI: `/watchlists` (list + create), `/watchlists/[id]` (detail —
add via the same `CompanySearch` component company pages use, given a new optional `onSelect` prop;
remove; reorder via up/down buttons, each reorder scoped by `watchlistId` + `companyId` together so
a foreign ID simply matches zero rows).

### Portfolio calculations

Manual tracking only — **not** a brokerage connection. One default portfolio per user ("Personal
Portfolio," auto-created on first use), matching the spec's own singular example and singular API
paths; the schema (`Portfolio.userId` + unique `[userId, name]`) would support multiple named
portfolios later without a migration, just not exposed in this milestone's UI/API.

Every formula lives in `lib/portfolio/calculations.ts` — pure functions, no I/O, independently
tested for the exact edge cases the spec calls out:

```
Market Value          = Shares × Current Price        (null if price is unavailable)
Cost Basis             = Shares × Average Cost
Unrealized Gain/Loss   = Market Value − Cost Basis
Unrealized Return      = Unrealized Gain/Loss ÷ Cost Basis   (null, not Infinity, for a zero cost basis)
Portfolio Weight       = Holding Market Value ÷ Total Portfolio Market Value
```

`lib/services/portfolioService.ts` (`addHolding`/`editHolding`/`removeHolding`, ownership-checked
via `getOwnedHolding`) fetches rows and calls `quickValuation.ts` for current prices — it computes
nothing itself. A holding missing its current price is shown as "—", and the portfolio summary sets
`hasMissingPrices: true` so the UI can note that totals reflect only what's known, rather than
silently understating the total.

**Allocation** (`lib/portfolio/allocation.ts`, also pure) groups holdings by sector/industry, sums
market value per group, and flags any slice above 35% of the portfolio with the neutral note "High
concentration relative to the rest of the portfolio" — never framed as objectively bad.

**Weighted portfolio fundamentals** (Weighted Revenue Growth/Operating Margin/FCF Margin/EV-EBITDA/
P/E) reuse `calculations.ts`'s `weightedAverage()`, weighted by each holding's market value. A
holding missing the underlying metric — or with a not-meaningful multiple (e.g. negative earnings
making P/E undefined) — is **excluded** from that specific average, never counted as zero; this is
the concrete mechanism behind "do not calculate meaningless weighted metrics."

**Valuation Monitor** re-runs the exact same DCF/comps engines per holding via `quickValuation.ts`
(current price, DCF implied price/upside, comps implied price/upside, current EV/EBITDA) — neutral
research indicators only, never a buy/sell signal. "Historical Multiple" is always "Not available":
Atlas has no stored multiple time series to compare against (see Known Limitations).

Routes: `GET /api/portfolio`, `POST /api/portfolio/holdings`,
`PATCH/DELETE /api/portfolio/holdings/[id]`, `GET /api/portfolio/analytics`. UI: `/portfolio`
(summary cards, holdings table with inline edit, allocation, fundamentals, valuation monitor) and an
in-app `/portfolio/methodology` page explaining every formula and edge case in plain language.

### Research-feed architecture

`lib/services/researchFeedService.ts` is a **computed-on-demand feed, deliberately not a persisted
`ResearchFeedItem` table**, despite the spec listing one under required models. Reasoning: no
background job/notification queue exists anywhere in this codebase (a documented limitation since
Milestone 7) — materializing per-user feed rows would need exactly that kind of fan-out worker.
Computing the feed fresh from Milestones 7/8/9's own already-stored data (`listFilings`,
`listEarningsCalls`, `listReports`) avoids inventing that infrastructure and guarantees the feed can
never show a stale or duplicated row.

For every company across a user's watchlists + portfolio (`lib/services/followedCompaniesService.ts`
— the single, security-critical function every monitoring feature relies on to stay scoped to real,
`userId`-filtered relations), the feed assembles: recent filings, recent calls, the latest research
report (new vs. updated, by version), and — by running the new deterministic
`lib/research/compareReports.ts` diff against the latest two report versions — valuation changes
(DCF implied price moved ≥5%), guidance changes, and newly-flagged filing risks (from the report's
own `sec_analysis` insights, never a fresh AI call).

**`compareReports.ts` is fully deterministic** — every numeric change is a plain subtraction/
division over numbers Milestone 9's aggregator already computed; the LLM is never involved. New/
removed risks and catalysts are identified by **exact-text set difference** (see Known Limitations
for why a fuzzier match wasn't attempted). An optional LLM layer to *explain* (not calculate)
meaningful qualitative differences was deliberately scoped out of this milestone — see Known
Limitations; the diff object it would consume is already fully shaped for exactly that purpose.

Routes: `GET /api/research-feed`, `GET /api/earnings-calendar`, `GET /api/filing-monitor`. The
earnings calendar (`lib/services/earningsCalendarService.ts`) has no live forward-looking data
source integrated — "do not invent earnings dates" — so every entry is a deterministic estimate
(last known call date + ~91 days), always labeled `isEstimate: true` with an explicit basis string,
never presented as confirmed. UI: `/dashboard` (the unified feed + portfolio/calendar/alerts
summary — "a personalized research terminal"), `/filings` (filing monitor), `/earnings-calendar`,
`/reports` (saved reports, with a "Save Report"/"Saved ✓" toggle added to Milestone 9's own report
page).

### Authorization / security

Every database query touching Watchlist/Portfolio/Alert/SavedReport data is scoped by `userId` at
the query level or behind an explicit ownership check that returns an identical "not found" outcome
for "doesn't exist" and "exists but isn't yours" — never leaking existence to a non-owner:

- `watchlistService.getOwnedWatchlist`, `portfolioService.getOwnedHolding`,
  `alertService.getOwnedAlert` — `findUnique` by ID, then compare `.userId`, throw the same
  `*NotFoundError` either way.
- `savedReportService` needs no separate check at all — every query is directly `WHERE userId = ...
  AND researchReportId = ...`, so an unsaving call for someone else's bookmark simply matches zero
  rows (an idempotent no-op, not an information-leaking error).
- `followedCompaniesService.getFollowedCompanies` filters through the `watchlist.userId`/
  `portfolio.userId` relations at the query level — there is no code path that can return another
  user's followed companies.

Frontend restrictions are never the only gate — every API route calls `requireUser()` first and maps
`UnauthorizedError` → 401 before touching any service.

### Alerts

Research monitoring only — the `AlertType` enum (`NEW_SEC_FILING`, `EARNINGS_AVAILABLE`,
`DCF_VALUATION_CHANGE`, `RESEARCH_REPORT_UPDATED`, `GUIDANCE_CHANGED`) has structurally no room for a
price-based trigger. An alert is either unscoped (evaluated against every followed company) or
scoped to one company (`ResearchAlert.companyId`). Because no background job queue exists,
`lib/services/alertService.ts`'s `evaluateAlerts()` re-evaluates every active alert **on demand**
(visiting `/alerts`, or `GET /api/alerts`) against current data — deterministically, no LLM
involved — and persists `lastCheckedAt`/`lastTriggeredAt`/`lastTriggeredSummary` as the result.
`DCF_VALUATION_CHANGE` reuses the same `compareReports.ts` diff the research feed uses, evaluated
against a user-configurable `thresholdPercent` (default 10%).

### Caching / performance

No new caching layer was added for M10, deliberately — every quick-valuation call
(`lib/valuation/quickValuation.ts`) routes through the exact same TTL-cached
`companyService`/`financialDataService`/`compsDataService` functions Milestones 2-6 already built.
Two different users' watchlists containing the same ticker read the same cached `Company`/
`FinancialPeriod` Postgres rows — they never trigger two independent FMP/SEC requests. The
distinction the spec asks for ("global data" vs. "user-specific data") falls out of the schema
itself: `Company`/`FinancialPeriod`/`ResearchReport` are shared tables with no `userId` column at
all; `Watchlist`/`Portfolio`/`ResearchAlert` are the only tables that carry one.

### Testing cross-user security

`app/api/crossUserAccess.test.ts` is a dedicated suite proving the milestone's explicit requirement
("prove User A cannot access User B's portfolio") — through the **real route handlers**, not just
the service layer (each service also has its own cross-user tests: `watchlistService.test.ts`,
`portfolioService.test.ts`, `alertService.test.ts`, `savedReportService.test.ts`,
`followedCompaniesService.test.ts`). It mocks only `getCurrentUser` (swappable per test, since a
direct route-handler import has no real Next.js request context to read cookies() from) and runs
everything downstream — `requireUser()`, the service, Prisma — against a real Postgres database. Run
it directly:

```bash
cd apps/web
npx vitest run app/api/crossUserAccess.test.ts
```

It proves: User B gets 404 reading/renaming/deleting User A's watchlist or adding a company to it;
404 editing/removing User A's holding, and `GET /api/portfolio` for User B never includes User A's
holdings; 404 toggling/deleting User A's alert, and User B's alert list never includes User A's
alerts; unsaving someone else's bookmark is a silent no-op; and an unauthenticated request is
rejected with 401. Every "blocked" assertion is paired with a same-test proof that the resource is
still fully intact for its actual owner — never a coincidental no-op.

### UI

A professional, table-dense interface — explicitly avoiding trading-game aesthetics: no giant P&L
animations, no gamification, and gain/loss color (`text-emerald-700`/`text-red-700`) is used sparingly
and only where it's the literal subject of the number, never decoratively. Sector/industry allocation
renders as a plain horizontal bar list (one neutral accent color, magnitude only, not a categorical
palette) rather than a pie/donut chart, per the spec's "avoid overly decorative charts." Navigation:
a new persistent `AppNav` (auth-aware — Dashboard/Watchlists/Portfolio/SEC Filings/Earnings/Reports/
Alerts when logged in, Log in/Sign up when not) sits above every page in the root layout, distinct
from the existing per-company `CompanyNav`.

### Known limitations (Milestone 10)

- **No live earnings-calendar or brokerage data source** — earnings dates are deterministic
  estimates from historical cadence, always labeled as such; portfolios are entered manually.
- **One default portfolio per user**, no multi-portfolio switcher UI (the schema supports it).
- **No transaction/lot history** — a holding stores a single blended shares/average-cost pair; buying
  more of an existing position means computing the new blended average cost yourself and editing the
  holding, not appending a new lot.
- **The research feed and alerts are computed on demand, not pushed** — no background job queue
  exists in this codebase (matching Milestones 7-9's own documented limitation), so there is no
  real-time notification; visiting a page is what triggers evaluation.
- **New/removed risks and catalysts in `compareReports.ts` are matched by exact text**, not semantic
  similarity — a risk reworded between report versions shows as one "removed" + one "new" item
  rather than "changed."
- **No LLM-generated qualitative explanation of research changes** — the deterministic diff
  (`compareReports.ts`) is fully implemented and tested; a narrative layer explaining *why* a change
  might matter (explicitly optional per the spec: "use the LLM only to explain") was scoped out to
  keep this already-large milestone shippable. The diff object is already shaped for exactly this
  extension.
- **"Historical Multiple" in the Valuation Monitor is always "Not available"** — Atlas has no stored
  multiple time series.
- **No email verification or password reset** — registration/login only.

## Automated Research Change Detection & Intelligence Feed architecture (Milestone 11)

A change-detection layer on top of Milestones 1-10 — not a second data pipeline. Every detector
reuses an already-built Milestone 1-10 service or engine; this milestone's own code only *compares*
two already-known states and decides whether the difference clears a configurable materiality bar.
The pipeline is **Company → New Data Detected → Data Classification → Change Detection → Materiality
Assessment → Source Verification → (optional) AI Explanation → Personalized Feed → Alert**, and it
never predicts, trades, or recommends — the explicit design goal is **DETECT → EXPLAIN → TRACE →
CONNECT**.

### Change-detection architecture

`lib/services/researchEventDetectionService.ts` runs eight independent detectors per company, each
comparing a fresh read of an existing service against the last known state:

| Detector | Reuses | Compares |
|---|---|---|
| Financial change | `financialDataService.getFinancials` | Revenue/EPS/FCF/debt/cash/shares, latest vs. prior annual period |
| Margin change | same financial periods | Gross/operating/net margin, in bps |
| Guidance change | `earningsCallService.getGuidanceObservations` (Milestone 8) | Guidance midpoint vs. `priorMidpoint`, already computed |
| DCF valuation change | `valuation/quickValuation.getQuickDcf` (Milestone 10's own reuse layer over the Milestone 5 engine) | Implied share price vs. the last *recorded* value (see below) |
| Comps valuation change | `valuation/quickValuation.getQuickComps` | Peer median EV/EBITDA vs. the last recorded value |
| New filing / corporate event | `secFilingService.listFilings` + `sec/eightKItems.categorizeEightKItem` (Milestone 7) | New filings since last check; an 8-K whose item codes fall outside {EARNINGS, OTHER} becomes a `CORPORATE_EVENT`, not just a `NEW_FILING` |
| New earnings call | `earningsCallService.listEarningsCalls` | A call becoming available is itself an event |
| New risk | `secFilingService.getExistingComparison`'s already-AI-identified `newRisks` (Milestone 7) | Read-only — never triggers a new AI filing comparison |
| Research report version | `researchReportService.listReports` + Milestone 10's `compareReports.ts` | New/updated report version |

Every percent change uses `lib/analytics/ratios.ts`'s established `growthRate()` convention
(`current/previous - 1`) — deliberately the same formula used everywhere else in the codebase rather
than Milestone 10's `compareReports.ts`'s private `diffNumeric`, so "10% change" means the same thing
on every Atlas page. `lib/researchEvents/changeDetection.ts` holds every pure comparison function and
is unit-tested against the milestone spec's own worked examples: Revenue $10.0B→$11.0B = +10%,
margin 22%→19% = -300bps, DCF $150→$132 = -12%, guidance midpoint $10.5B→$11.0B = +4.8%.

**DCF/comps detectors need a "previous" value the rest of the codebase never persists** (Milestone 9
deliberately always recomputes the DCF fresh). `getLastKnownChangeValue()` solves this by reading the
most recent matching `ResearchEventChange` row for that metric across the company's own event
history — a rolling memory — falling back to the latest saved `ResearchReport`'s own stored DCF/comps
snapshot as a first-run baseline anchor. If neither exists, no event is created: a fabricated "first
ever" baseline would be noise, not a real detected change.

### Materiality framework (centralized configuration)

Every threshold in this milestone lives in exactly one file: `lib/researchEvents/materialityConfig.ts`.
No detector inlines its own magic number — "how big a guidance change has to be to count as HIGH" is
a one-line edit in that file, never a hunt through detection code. Four tiers (LOW/MEDIUM/HIGH/
CRITICAL), each expressed as the minimum magnitude a change must reach:

| Signal | MEDIUM | HIGH | CRITICAL |
|---|---|---|---|
| Financial % change (revenue/EPS/FCF/debt/cash/shares) | 5% | 15% | 30% |
| Margin change (bps) | 100 | 300 | 600 |
| Guidance midpoint % change | 3% | 7% | 20% |
| DCF implied price % change | 5% | 12% | 25% |
| Comps multiple % change | 5% | 15% | 25% |

SEC filings/8-Ks reuse Milestone 7's own rule-based `lib/sec/importance.ts` classification (mapped
onto this milestone's 4-tier scale) rather than inventing a second one; an 8-K item category like
`BANKRUPTCY_RESTRUCTURING` or `LEGAL_EVENT` is hardcoded to CRITICAL, `ACQUISITION`/
`EXECUTIVE_CHANGE` to HIGH. When a single event is driven by more than one contributing change (e.g.
a financial-results event touching revenue, EPS, and FCF at once), its overall materiality is the
**highest** tier any one contributing change reached — a severe input is never diluted by averaging
it against milder ones.

### Event deduplication

The same underlying event can surface through more than one channel — a guidance change visible in
both a `GuidanceObservation` and, later, a different earnings call reaffirming it. `ResearchEvent`
carries a `dedupeKey` (e.g. `guidance:REVENUE:FY2026`, `filing:{accessionNumber}`) under a
`@@unique([companyId, dedupeKey])` constraint; every detector run **upserts** on this key rather than
blindly inserting. `persistCandidate()` in `researchEventDetectionService.ts` does the merge: if an
event with the same key already exists, any source that isn't already recorded (compared by
type + `secFilingId`/`earningsCallId`/`researchReportId`) is appended to it via a new
`ResearchEventSource` row — the event itself, its title, and its materiality are never duplicated.
This makes re-running detection idempotent by construction, and is proven directly in
`researchEventDetectionService.test.ts`'s "merges the same conceptual event surfaced via a second
source" test (two different `earningsCallId`s, same `dedupeKey`, ends as one event with two sources).

Dedupe keys are deliberately either **static/period-scoped** (financial/margin/guidance/filing/
earnings/report keys never include a run timestamp, so a later corroborating source always merges
onto the same row) or **day-bucketed** (`dcf:base:{YYYY-MM-DD}`, `comps:medianEvEbitda:{YYYY-MM-DD}`)
for the two continuously-recomputed valuation signals, which have no natural period boundary of their
own — this collapses multiple lazy-detection triggers within the same day into one event while still
letting a genuinely new day's price movement create a fresh one.

### AI explanation layer (cost-controlled)

AI runs **only after** deterministic detection and **only** for events at/above `HIGH` materiality
(`lib/researchEvents/materialityConfig.ts`'s `shouldRunAiAnalysis`) — a LOW/MEDIUM change is stored
with its full deterministic changes/sources but never spends a token. When it does run
(`lib/ai/explainResearchEvent.ts`, reusing the same `runStructuredAnalysis` tool-call harness as every
other Atlas AI call), the model receives only already-computed numbers and deterministic impact notes
— it explains, it never calculates, and its system prompt (`lib/ai/researchEventPrompts.ts`)
explicitly forbids inventing a fact, issuing a "Buy"/"Sell", or claiming a model/thesis was "changed"
or "broken" (only "potentially affected"/"potentially inconsistent"). Structured output:
`{summary, why_it_matters, affected_research_areas, questions_to_investigate, confidence}`, validated
against a zod schema whose `affected_research_areas` enum is the same closed list the deterministic
impact mapping already uses.

**AI failure can never remove a source-backed event.** The `ResearchEvent` row — with its sources,
deterministic changes, and deterministic impacts — is fully created in the database *before* the AI
is ever called; a caught `AiNotConfiguredError`/`AiRequestError` only sets `aiStatus: 'FAILED'` on the
already-persisted row. `researchEventDetectionService.test.ts`'s "keeps a source-backed event fully
available when the AI call fails" test proves this directly. Every AI call's model, input/output
token counts are stored on the event row (`aiModel`/`aiInputTokens`/`aiOutputTokens`) for the cost
tracking the spec asks for — there's no separate cost-tracking table because the per-event row already
carries everything needed to sum it.

### Research impact mapping — deterministic, not AI-guessed

For every event type, `lib/researchEvents/impactMapping.ts` is a rule-based table mapping it onto a
fixed set of research areas (Financials/Growth/Margins/DCF/Comps/Risks/Catalysts/Management/Capital
Allocation/Investment Thesis) with a pre-written note — e.g. a guidance cut always populates
`DCF: "Potentially affects DCF revenue assumptions."` **This never changes the DCF itself** — it is
populated unconditionally for every event, whether or not the AI ever runs, and is kept structurally
separate from the AI's own `aiAffectedResearchAreas` (validated against the same enum, so the model
can never invent a category, but stored as its own field rather than merged into the deterministic
`impacts` relation).

### Research Thesis Monitor & assumption tracking

`lib/services/thesisMonitorService.ts` structurally extracts a saved research report's own key
assumptions — Revenue CAGR (implied from the DCF Base case's final-year revenue), Operating Margin,
FCF Margin, WACC, Terminal Growth Rate (all read straight from the report's own stored DCF Base-case
scenario), and Revenue Guidance (from the report's own stored earnings-call guidance) — into
`ThesisAssumption` rows, once per report version. An assumption whose inputs aren't present in a
given report (e.g. no revenue history to imply a CAGR, no guidance in that snapshot) is simply
omitted, never fabricated — proven by `thesisMonitorService.test.ts`'s "never fabricates an
assumption for missing data" test.

Each assumption is then compared against the best currently-available live observation — current
trailing revenue growth/operating margin/FCF margin (`valuation/quickValuation.getQuickFundamentals`),
current WACC (`getQuickDcf`, extended with a `wacc` field for this milestone), or the most recent
`GUIDANCE_CHANGE` `ResearchEvent`'s own recorded change for revenue guidance — and, when it's moved
far enough (per-assumption thresholds in `materialityConfig.ts`'s `ASSUMPTION_FLAG_THRESHOLDS`),
recorded as a flagged `AssumptionComparison`. The `previousValue` on every comparison is always the
report's **original** assumption, never the prior comparison — the question is always "does this
still hold up against what we originally assumed," not "did the trend continue." The note text is
always one of two forms: **"Potentially inconsistent with a prior research assumption"** when
flagged, or a neutral "Consistent with…" otherwise — never "Thesis broken," matching the spec's
explicit language requirement. The underlying DCF/comps model is never touched by this service; it
only reads and records comparisons.

DCF/comps change monitoring's "which inputs drove it" breakdown (spec section 15) is intentionally
scoped to the top-line implied price/multiple only — see Known Limitations.

### Personalized research feed & read/unread state

`lib/services/researchEventFeedService.ts` is the read side: `getResearchFeed(userId, filters)`
scopes every query to `getFollowedCompanies(userId)` (Milestone 10's own watchlist+portfolio union,
extended in this milestone to also include companies behind a user's `SavedReport` bookmarks) —
`ResearchEvent` rows themselves are global (shared by every user who follows the company, exactly
like `Company`/`ResearchReport`), but `UserResearchEventState` (`isRead`/`readAt`) is always scoped by
`userId`, both at read time and at write time (`markResearchEventRead`/`Unread`/
`markAllResearchEventsRead`). "Automatic" processing (spec section 23) is TTL-gated lazy
detection-on-view: viewing the feed, a company's timeline, or its "Recent Changes" panel triggers
`runResearchEventDetection` for any followed/viewed company whose `Company.researchEventsSyncedAt` is
stale (24h TTL, matching Milestone 3's own `financialsSyncedAt` pattern) — the same "sync on view if
stale" design every prior milestone's own monitoring feature already uses, since no real background
job queue exists in this codebase (a documented limitation since Milestone 7).

Routes: `GET /api/research-feed` (filters: `minMateriality`, `category`, `unreadOnly`),
`GET /api/research-feed/[eventId]`, `POST /api/research-feed/[eventId]/read`,
`POST /api/research-feed/[eventId]/unread`, `POST /api/research-feed/mark-all-read`,
`GET /api/companies/[ticker]/timeline` (global, filterable, no auth required — matches every other
company sub-page), `GET /api/companies/[ticker]/changes` (the trimmed feed behind "Recent Changes"),
`GET /api/companies/[ticker]/thesis-monitor`, `GET /api/companies/[ticker]/assumption-changes` (a
flattened view of only the flagged/compared assumptions). UI: `/research-feed` (filter chips
[All/High Importance/SEC/Earnings/Valuation], an Unread section with a "Mark all read" action,
click-to-expand detail showing What Changed/Why It Matters/Potential Research Impact/Sources/
Confidence), a new "Research Timeline" tab on the company nav (`/company/[ticker]/timeline`), a
"Recent Changes" panel on the company overview page, and a "Research Thesis Monitor" section appended
to the Research Report page.

### Alert integration

Three new `AlertType` values (`HIGH_IMPORTANCE_RESEARCH_EVENT`, `CRITICAL_RESEARCH_EVENT`,
`NEW_MATERIAL_RISK`) extend Milestone 10's `alertService.ts` unchanged in every other respect —
`evaluateOne()`'s new cases call `researchEventFeedService.getCompanyTimeline()` (reusing the same
lazy-detection trigger every other M11 read path uses, never a second pipeline) and look for a
recent event clearing HIGH/CRITICAL materiality, or a `NEW_RISK`-typed event. Materiality filtering
already happened at detection time, so "do not spam users with every minor filing" holds for free —
these three alert types only ever fire on events that already cleared a real threshold.

### Security

Every M10 authorization rule is unchanged and still enforced. What's new in this milestone:
`ResearchEvent`/`ResearchEventSource`/`ResearchEventChange`/`ResearchEventImpact`/`ThesisAssumption`/
`AssumptionComparison` are **global**, shared company data with no `userId` column at all — exactly
like `Company`/`ResearchReport` — while `UserResearchEventState` is the one new private table, scoped
by `userId` at every read and write. `app/api/crossUserAccess.test.ts` proves both halves through the
real route handlers: a company only User A follows never appears in User B's `/api/research-feed`,
and User A marking a global event read never marks it read for User B.

### Testing

`researchEventDetectionService.test.ts` (11 tests, real Postgres) covers every detector, the
idempotent-rerun and cross-source-merge dedup paths, and AI-failure resilience.
`researchEventFeedService.test.ts` (8 tests) covers feed scoping, filters, read-state isolation, and
mark-all-read. `thesisMonitorService.test.ts` (9 tests) covers assumption extraction, the
flagged-vs-consistent comparison, and missing-data handling. `materialityConfig.test.ts` (16 tests)
and `changeDetection.test.ts` (11 tests) verify every worked example from the milestone spec exactly
(Revenue $10.0B→$11.0B = +10%, margin 22%→19% = -300bps, etc.). `alertService.test.ts` and
`researchEventRoutes.test.ts` cover the three new alert types and the API layer's parameter
parsing/error mapping. `app/api/crossUserAccess.test.ts` adds the two required cross-user scenarios
above. Run the milestone's own suite directly:

```bash
cd apps/web
npx vitest run lib/researchEvents lib/services/researchEventDetectionService.test.ts lib/services/researchEventFeedService.test.ts lib/services/thesisMonitorService.test.ts lib/services/alertService.test.ts app/api/researchEventRoutes.test.ts app/api/crossUserAccess.test.ts
```

### Known limitations (Milestone 11)

- **No real background job queue** — detection is TTL-gated and lazy-on-view (24h), matching every
  prior milestone's own documented limitation. A company nobody has viewed in over a day won't have
  fresh events until its next view.
- **DCF/comps change monitoring reports the top-line implied price/multiple only**, not a
  decomposed "which input (Revenue Forecast/Operating Margin/WACC/Terminal Growth/Terminal Value)
  drove it" breakdown — the underlying engines don't currently expose per-input attribution for a
  period-over-period delta, and building that decomposition was out of scope for this already-large
  milestone.
- **Exit Multiple is not tracked as a thesis assumption** — the DCF engine only ever surfaces a
  `terminalGrowthRate` in the stored report snapshot (backfilled from the exit multiple when that
  method was used), not the raw exit-multiple assumption itself; extracting it honestly (per the
  "never fabricate" rule) would require plumbing a new field through Milestone 9's report snapshot,
  which was deferred.
- **Corporate-event detection is entirely 8-K-item-code-based** (reusing Milestone 7's own
  classification) — a material event an 8-K doesn't explicitly code for (or that's disclosed only in
  a 10-K/10-Q's own text) won't be classified as a `CORPORATE_EVENT`.
- **No email/push notification delivery** — alerts and the research feed are both pull-based (visit
  the page to see current state), consistent with Milestone 10's own alerts.

## Historical Backtesting & Research Validation Engine architecture (Milestone 12)

A validation layer over Milestones 1-11 — explicitly **a research and validation system, not an
automated trading system**. It never recommends a trade, and no historical relationship it surfaces
is presented as a guarantee of future performance. The one requirement that shapes every design
decision in this milestone: **at any historical "as of" date, only information that would actually
have been available then is ever used.**

### Preventing look-ahead bias — the load-bearing mechanism

`lib/backtest/pointInTimeValuation.ts`'s `filterPeriodsAsOf(periods, asOfDate)` is the single choke
point every point-in-time consumer in this milestone routes through: it keeps only annual periods
whose `filingDate` is on or before `asOfDate`, excluding a period with an unknown (`null`) filing
date too — "might not have been available" is treated the same as "wasn't available." Because
`financialDataService.ts`'s `FinancialPeriodData.filingDate` is a full ISO timestamp
(`filingDate.toISOString()`), not a plain `YYYY-MM-DD`, both sides of the comparison are normalized
through `historicalPriceService.ts`'s `toDateOnly()` before comparing — a real bug caught during this
milestone's own live browser verification (a period filed on the same calendar day as `asOfDate` was
comparing incorrectly, and code that fed a raw `filingDate` into date arithmetic elsewhere crashed
with an "Invalid time value" error). Historical price data uses the same convention: `getPriceAsOf()`
returns the nearest trading-day close on or before a date, never a future or current price.

**Known, disclosed limitation:** excluding not-yet-filed *periods* is the load-bearing protection —
guarding against a later *restatement* of an already-filed period would require an append-only fact
history, which Atlas's Milestone 3 ingestion pipeline does not persist (it is "latest-filed-wins,
fully rebuilt on refresh"). This is surfaced in every point-in-time result's own limitations, never
silently accepted as solved. DCF WACC also still uses the company's **current** beta, since no
historical beta time series exists.

### Data layer: historical prices, market-data provider abstraction, point-in-time snapshots

`prisma.schema`'s `HistoricalPriceBar` is the one new persisted table this milestone needs —
everything else is computed on demand from data Milestones 1-11 already store.
`lib/providers/marketData/` defines a one-method `MarketDataProvider` interface
(`getHistoricalPrices(ticker, from, to)`), with `fmpMarketDataProvider` as the only implementation —
swapping or adding a second vendor never touches a calling service.
`lib/services/historicalPriceService.ts` caches through this abstraction: coverage is inferred from
the min/max date of already-stored bars rather than a separate coverage-tracking table (a documented,
harmless inefficiency — an occasional redundant re-fetch, made safe by `skipDuplicates: true`), and
`getForwardReturn(ticker, fromDate, horizonMonths)` returns `null` — never a stale reused price —
when the horizon hasn't actually elapsed yet in the available price history.

`lib/services/historicalSnapshotService.ts`'s `getSnapshotAsOf(ticker, asOfDate)` assembles "what
Atlas knew" at a historical date — price, market cap, DCF, filings, earnings calls, and research
events, each filtered to `<= asOfDate` — entirely from existing Milestone 1-11 reads, never persisted.
It conservatively **omits comparable-company data** rather than show today's peer multiples under a
misleading "as of" label; the narrower, explicitly-disclosed compromise Valuation Spread analysis
makes instead (below) is a deliberate, different tradeoff for that one specific feature.

### Valuation validation & DCF forecast validation (`lib/services/backtestService.ts`)

`runValuationValidation(ticker, from, to)` recomputes a full point-in-time DCF at each sampled date
(`lib/backtest/sampling.ts`'s monthly, first-of-month sampling, capped at 120 dates per request with
an honest `wasCapped` flag rather than silent truncation) and reports the DCF-vs-market premium/
discount alongside the actual subsequent 1/3/6/12-month price return — never asserting the gap
converges. `runDcfForecastValidation(ticker)` walks every annual filing date this company has,
re-running the point-in-time DCF as of each one, and scores each forecast year's revenue/operating
margin/unlevered FCF against what was later actually reported (`Forecast Error = Actual - Forecast`),
only once that fiscal year has actually been reported. The "actual" side reuses
`lib/valuation/historicals.ts`'s own `unleveredFcf` computation — the exact same formula the DCF
forecast itself uses — so the comparison is apples-to-apples rather than comparing an unlevered
forecast against a levered reported figure.

### Financial signal, event-study, and research-event validation

`runFinancialSignalValidation(tickers, signal)` investigates eight signal types (revenue
acceleration/deceleration — a growth-of-growth comparison, not just "did revenue grow" — margin
expansion/contraction, FCF growth, debt reduction, guidance increase/decrease) against subsequent
returns. A signal only fires once its underlying change clears the same centralized materiality
thresholds Milestone 11 uses (`lib/researchEvents/materialityConfig.ts`) — reused directly, not
re-implemented — and its date is the period's own `filingDate` (when it became knowable), never the
fiscal period-end date. Guidance signals reuse Milestone 11's already-detected `GUIDANCE_CHANGE`
`ResearchEvent` rows directly rather than re-deriving guidance direction from scratch.

`runEventStudy(tickers, source, options)` computes a simple market-adjusted abnormal return
(`Abnormal Return = Stock Return - Benchmark Return` over the same trading-day window — a documented,
legitimate choice, not a beta-adjusted market-model regression) around earnings calls or any
Milestone 11 research-event type, using windows of `[-1,+1]`, `[-3,+3]`, `[-5,+5]` trading days
(found by counting actual price rows, correctly handling weekends/holidays without calendar
arithmetic). `runResearchEventOutcomeValidation(tickers, eventType, horizons)` connects any
Milestone 11 event type directly to subsequent market outcomes — its own methodology text is
unit-tested to never imply causality, always phrasing results as "companies experiencing this event
had an average subsequent return of X% across N observations."

### Valuation spread analysis — a loudly disclosed compromise

`runValuationSpreadAnalysis(ticker, from, to)` compares a company's point-in-time EV/EBITDA multiple
(EV = point-in-time market cap + point-in-time total debt - cash; EBITDA = operating income + D&A,
all from periods known as of the sample date) against its peer group's **current** median multiple —
building a parallel point-in-time comps engine for every peer was out of scope for this milestone.
The result's own `peerDataIsCurrentNotHistorical: true` field is a persistent, impossible-to-miss flag
a UI must render, not just prose buried in a methodology array. Discount/Neutral/Premium buckets use
configurable thresholds (default ±15% of the peer median, matching the spec's own 12x-vs-18x =
-33% = Discount worked example).

### Benchmark returns, excess returns, and transaction costs — wired into every observation

Every `ValuationForwardOutcome` across all five analyses above carries four figures computed together
by one shared `buildForwardOutcome()` helper: the raw (gross) return, that return net of a disclosed
default 20bps round-trip transaction cost (`lib/backtest/returns.ts`'s `applyTransactionCosts`, 10bps
commission + 10bps slippage — never assumed frictionless per spec section 17), the benchmark's
(`SPY`, a practical S&P 500 proxy) own return over the identical window, and the excess return
(`lib/backtest/returns.ts`'s `excessReturn`, asset - benchmark). This closes a gap the pure math
modules had already built and tested in isolation (task-level, not milestone-level) but never
actually wired into a result — caught and fixed before the frontend was built, since the UI's own
Results panel depends on these fields existing.

### Robustness segmentation, out-of-sample testing, and walk-forward validation

`lib/backtest/robustness.ts` segments any dated, forward-outcome-bearing observation set by calendar
year and by point-in-time market-cap bucket — the two axes Atlas can support "where data permits"
(spec section 12). Sector and market-regime (bull/bear/volatility) segmentation are explicitly **not**
implemented: Atlas has no point-in-time sector classification or regime-label series, and segmenting
by a company's *current* sector or a *current* regime label would misrepresent historical conditions
— a disclosed scope limitation, not a silent omission.

`runValuationValidationOutOfSample`/`runValuationSpreadOutOfSample` run the exact same fixed
methodology independently over a training range and a testing range and label each result
IN-SAMPLE/OUT-OF-SAMPLE — never blended, and no threshold is ever fit on the training range (this
milestone has no tunable parameter to begin with; every threshold is fixed, disclosed configuration
per spec section 18's "no strategy optimization"). `runValuationValidationWalkForward`/
`runValuationSpreadWalkForward` build an **expanding**-window schedule (`lib/backtest/walkForward.ts`
— training always starts at the full range's own start and only the test window slides forward,
matching the spec's own worked example) and report only each step's held-out test-window result,
never a training window's own performance. Because there is no parameter here that ever gets *fit* to
data, walk-forward in this system validates the temporal **stability** of one fixed methodology across
periods, not classical protection against parameter overfitting in the usual sense — documented
explicitly in code and here rather than left implicit.

### Statistical rigor

Every analysis routes its return distributions through one shared `lib/backtest/statistics.ts`
function, `summarizeDistribution()`: count, mean, median, sample standard deviation, positive-outcome
rate, and a 95% confidence interval (normal approximation). Below
`MIN_OBSERVATIONS_FOR_STATS = 5`, the confidence interval is withheld and an `insufficientData` flag
tells the caller to show "Insufficient observations for meaningful statistical inference" instead of
a number implying more confidence than the sample supports — never a bare statistic with no sample
size attached.

### API routes & frontend

Seven routes under `/api/research-backtest/`: `snapshot`, `valuation` (supports
`?mode=standard|outOfSample|walkForward`), `valuation-spread` (same three modes),
`dcf-forecast`, `financial-signals` (`?segment=true` attaches robustness segmentation),
`events`, `research-events` (`?segment=true`). `lib/api/backtest.ts` hand-mirrors every response
shape as its own client-side interface (same discipline as `lib/api/researchEvents.ts`) rather than
importing server-only service code into the client bundle.

The `/research-backtest` UI (`components/research-backtest/`) is a single-company workspace — a
`CompanySearch`-driven ticker selector, then six analysis tabs (Valuation, Valuation Spread, DCF
Forecasts, Financial Signals, Events, Research Events), each with its own date range/horizon/
signal-type/mode controls, a statistics grid, an observations table, a per-analysis methodology panel,
and a persistent, workspace-level Limitations panel covering the cross-cutting caveats above. A
standalone `/research-backtest/methodology` page documents the full approach for a reader who wants
the "how" without digging through code.

### Testing

67 tests across `lib/backtest/` (statistics, returns, eventStudy, walkForward, valuationSpread,
sampling, robustness, pointInTimeValuation) and `lib/services/` (historicalPriceService,
historicalSnapshotService, backtestService — split across three files by the three build phases:
valuation/DCF-forecast, signals/events/research-events, spread/robustness/out-of-sample/walk-forward).
Run the milestone's own suite directly:

```bash
cd apps/web
npx vitest run lib/backtest lib/services/backtestService lib/services/historicalPriceService lib/services/historicalSnapshotService
```

Live-verified in the browser against real AAPL data end-to-end, including standard, out-of-sample, and
walk-forward modes on both the Valuation and Valuation Spread tabs — this pass caught and fixed two
real bugs (the filing-date-format look-ahead comparison issue above, and a display-layer double
percent-scaling bug that inflated DCF-forecast and valuation-spread percentages by 100x).

### Known limitations (Milestone 12)

- **Restatement-vintage gap**: a financial period's stored *value* reflects Atlas's latest-known
  filing for that period; if it was restated after the historical `asOfDate`, this system cannot
  detect or exclude the restatement (see "Preventing look-ahead bias" above).
- **DCF WACC uses the company's current beta**, not a point-in-time historical beta series.
- **Survivorship bias**: Atlas has no data source for companies that have since been delisted or gone
  private, so every historical result implicitly conditions on the company still existing today.
- **Valuation Spread's peer-median multiple is current data, not point-in-time** — loudly disclosed
  via a persistent `peerDataIsCurrentNotHistorical` flag, not buried in prose.
- **Monthly sampling is capped at 120 dates per request** to bound live (non-background-job)
  computation cost; a request whose range would need more is honestly flagged as capped.
- **Event-study abnormal return uses a simple market-adjusted model**, not a beta-adjusted
  market-model regression — a documented, standard, simpler methodology choice.
- **No sector or market-regime robustness segmentation** — only calendar-year and market-cap-bucket
  segmentation are implemented, for the reasons documented above.
- **Analyses operate on a single company at a time in the UI** — the underlying service functions
  accept a `tickers: string[]` array (so watchlist-wide pooling is architecturally supported), but the
  frontend currently only drives them with one selected ticker.

## Investment Committee Research & Decision Framework architecture (Milestone 13)

A decision-support layer over every prior milestone — explicitly **not an automated stock picker**.
No component in this milestone ever assigns a final decision status, auto-invalidates a thesis, or
lets the AI write data outside a single, always-validated path; every consequential decision requires
the user's own explicit confirmation.

### Investment Cases and the structured thesis editor

`InvestmentCase` (`prisma.schema`) is the root resource — one per (user, company) research effort,
with a `status: InvestmentCaseStatus` (Researching → Watchlist → Active Thesis → Under Review →
Thesis Challenged → Thesis Invalidated → Archived) that only ever changes via an explicit
`updateInvestmentCase` call, never inferred by anything else in the milestone. The thesis itself is
structured, not a blob: `coreThesis`, `keyDrivers[]`, per-scenario `bullSummary`/`baseSummary`/
`bearSummary`, and the "What Would Change My Mind?" indicators (`strengthenIndicators`/
`weakenIndicators`/`invalidateIndicators`) are each their own column, editable and savable
independently in the UI (`components/investment-cases/detail/ThesisEditor.tsx`).

### Bull/Base/Bear valuation — always live, never duplicated

`lib/valuation/quickValuation.ts`'s `getQuickDcfScenarios(ticker)` (new this milestone) runs the same
`runDcf()` engine the Valuation page uses three times — once unmodified, once with
`DEFAULT_BEAR_DELTAS`, once with `DEFAULT_BULL_DELTAS` (the identical deltas
`aggregateResearchContext.ts`'s own scenario analysis already uses) — so a case's Bull/Base/Bear
valuation is recomputed fresh on every load and is never persisted, except when a version snapshot
deliberately freezes it (below).

### Thesis assumptions and the Thesis Challenge Engine — "Potential Challenge," never a verdict

`InvestmentCaseAssumption` tracks a case's own assumptions per `(metric, scenario)` — a broader metric
enum than Milestone 11's report-scoped `ThesisAssumption`, since a case outlives any one report
version. `lib/investmentCase/thesisChallengeEngine.ts`'s `evaluateThesisChallenges()` compares only
**BASE**-scenario assumptions against live data (Bull/Bear are deliberately-shifted "what if" inputs,
not the thesis's real-world expectation, so comparing them would be meaningless — verified by a
dedicated test). It reuses Milestone 11's `computeChange()` for the underlying arithmetic: ratio-shaped
metrics (growth, margins, WACC, terminal growth) are compared in **percentage points** via
`changeAbsolute`; multiple/count/dollar-shaped metrics (exit multiple, debt, share count) are compared
as **relative percent change** via `changePercent` — matching the spec's own worked example exactly
("15% assumed vs. 9-11% guidance → -4 to -6 percentage points"). A gap below a documented per-metric
threshold (`CHALLENGE_THRESHOLDS`) is normal noise and never surfaced; every surfaced gap is labeled a
**Potential Challenge**, and the engine never writes to the assumption or the case's status — see the
live end-to-end proof under Testing below.

Live-value sourcing (`lib/services/investmentCaseChallengeService.ts`) is deliberately conservative and
honestly labeled: revenue growth is compared against **trailing** revenue growth from current
fundamentals (not a guidance-implied growth rate, which would require reconciling `GuidanceObservation`
against a prior-period revenue figure — out of scope, documented as such); WACC/terminal growth come
from the live DCF Base case; exit multiple/debt/share count have no live source wired up yet and are
simply skipped, never fabricated.

### Invalidation criteria — advisory, never automatic

`InvestmentCaseInvalidationCriterion` supports both machine-checkable criteria (a metric + comparator +
threshold, optionally requiring several `consecutivePeriods`) and purely qualitative ones (`metric:
null`). `lib/investmentCase/invalidationMonitor.ts`'s `evaluateInvalidationCriterion()` only ever
returns an advisory `{checkable, potentiallyMet, reason}` — it never writes
`InvestmentCaseInvalidationCriterion.status`, and resolving a "Potentially Met" flag is always a
separate, explicit `PATCH .../invalidation-criteria/[id]` the user triggers themselves.

### Evidence Matrix — one write path, always validated

`lib/investmentCase/evidenceValidation.ts`'s `validateEvidenceSource()` is the one gate every evidence
item passes through, used identically whether a human fills out the form or the AI assistant proposes
a citation — there is no separate, less-checked AI write path anywhere in the milestone. Row-backed
source types (10-K/10-Q/8-K → a real `SecFiling`; Earnings Call → a real `EarningsCall`; Research Event
→ a real `ResearchEvent`) require the referenced row to actually exist **and** belong to the case's own
company (`lib/services/investmentCaseEvidenceService.ts`'s `resolveRowBackedSource()` does the DB
lookup; the validator itself stays a pure function taking the already-resolved result). Non-row-backed
types (financial statements, DCF, comps, historical validation) require only a non-empty label. Two
dedicated tests prove the AI-invented-evidence case (no source at all) and the wrong-company case (a
real filing id belonging to a different company) are both rejected.

### AI Thesis Assistant — synthesize, never decide

`lib/ai/investmentThesisPrompts.ts`'s system prompt is written directly against spec section 9's
constraint list: the assistant SYNTHESIZES, COMPARES, EXPLAINS, IDENTIFIES CONFLICTS, and SURFACES
QUESTIONS — it never predicts returns, guarantees an outcome, invents a fact or source, declares a
thesis "broken"/"confirmed", alters any model, or gives personalized advice. Citations
(`cited_evidence_ids`/`cited_research_event_ids`) reference real database ids directly rather than
Milestone 9's small-integer source registry — simpler, and directly verifiable against
`collectValidCitationIds(context)`; any id the model claims that isn't actually in the context is
silently stripped before the response is ever shown (`sanitizeThesisAssistantPayload`, mirroring
Milestone 9's `sanitizeReportPayload`). When `ANTHROPIC_API_KEY` isn't configured, the route returns a
503 with the underlying `AiNotConfiguredError` message rather than a bare failure — verified live (see
Testing).

### Investment Memo generator — 16 sections, only 2 ever AI-written

`lib/services/investmentMemoService.ts`'s `generateInvestmentMemo()` always creates a fresh
`InvestmentCaseVersion` first — the memo and that version are permanently 1:1 linked
(`InvestmentMemo.versionId @unique`) — then assembles all 14 deterministic sections directly from the
frozen snapshot (business overview, thesis, financials, valuation, bull/base/bear, catalysts, risks,
evidence for/against, key assumptions, "what would change my mind," historical validation, sources,
methodology) before attempting the AI call for only the Executive Summary and Conclusion. This
deliberately improves on Milestone 9's own pattern: where a failed `ResearchReport` stores `report:
null` (nothing), a failed `InvestmentMemo` still persists `status: 'FAILED'` with all 14 deterministic
sections intact — only the two narrative sections are nulled — documented explicitly in code as an
intentional divergence, not an oversight. Live-verified end-to-end with `ANTHROPIC_API_KEY` unset (see
Testing): the memo generated correctly, the UI's own banner explained which two sections were
unavailable and why, and every other section — including the real Thesis Challenge Engine output and a
live 78-fiscal-year historical-validation sample size for AAPL — rendered correctly.

### Version snapshots and deterministic diffing

`buildCaseSnapshot()` (`lib/services/investmentCaseVersionService.ts`) is the one place a case's full
state — thesis, assumptions, evidence, risks, catalysts, invalidation criteria, plus a **fresh live**
valuation/fundamentals read — is assembled; both `createVersion()` and the shared AI context builder
call it rather than re-deriving the same data twice. It is the one place in the whole milestone a
valuation figure is deliberately frozen, since a version or memo must stay reproducible even after the
live DCF later moves. `lib/investmentCase/versionDiff.ts`'s `diffCaseSnapshots()` is a pure,
deterministic structural diff — thesis-field changes, assumption changes (matched by
`metric:scenario`), added/removed evidence (by id-set difference), and valuation changes — never an
AI-generated summary, so a version-to-version comparison is always exactly reproducible from the two
stored snapshots alone.

### Review workflow — read-only summary, then an explicit, separate confirmation

`lib/services/investmentCaseReviewService.ts`'s `startReview()` always creates the
`InvestmentCaseReview` row up front with `outcome: null` (durable before confirmation), assembling a
summary from research events new since the last review (reusing Milestone 11's
`getCompanyTimeline()` directly — no second detection pass), live thesis challenges, live valuation,
Milestone 12's `runDcfForecastValidation()` (reused directly — no second backtest engine), new
risks/catalysts, and the evidence-matrix balance. `confirmReview()` is the only function that ever sets
`outcome`, and even confirming `INVALIDATED` does not itself change `InvestmentCase.status` — that
remains the same separate, explicit status control every other status change goes through.

### Thesis Health — documented reasons, never a hidden score

`lib/investmentCase/thesisHealth.ts`'s `computeThesisHealth()` takes plain, explainable counts
(open challenges, potentially-met invalidation criteria, high-impact open risks, failed catalysts,
days since last review) and returns a status (`STABLE`/`WATCH`/`CHALLENGED`/`REVIEW_REQUIRED`) always
paired with a non-empty `reasons: string[]` — never a bare label or a weighted/blended formula. The
dashboard (`lib/services/investmentCaseDashboardService.ts`) computes this per case by reusing the
exact same shared context builder the AI assistant and memo generator call
(`buildInvestmentCaseContext`), so a case whose live data can't currently be resolved degrades that one
row gracefully (`contextUnavailable: true`) rather than failing the whole dashboard.

### Database, API, and authorization

Twelve new enums and nine new models under a dedicated `prisma.schema` section — see its own header
comment for the "valuation never duplicated, only frozen at version time" and "one evidence write
path, always validated" design principles. Nineteen route files under
`app/api/investment-cases/`, following the exact established convention (`requireUser()` → 401,
manual defensive body parsing, a local `VALID_X` allow-list + `as never` cast for every enum field,
domain error classes mapped to 400/404/409 as appropriate). `getOwnedInvestmentCase()`
(`lib/services/investmentCaseService.ts`) is the one ownership choke point every other Milestone 13
service imports rather than reimplementing — a missing case and someone else's case both throw the
identical `InvestmentCaseNotFoundError`, so an id can never be probed to leak ownership.

### UI

`/investment-cases` — a dashboard with Company/Status/Valuation/Thesis Health/Recent Change/Last
Reviewed/Next Review columns and deliberately no buy/sell indicator anywhere. `/investment-cases/[id]`
— a single-page workspace (`components/investment-cases/detail/`) combining the thesis editor,
live valuation panel, assumptions + Thesis Challenge Engine output, Evidence Matrix, risks/catalysts,
invalidation criteria + live evaluations, the review workflow, the AI Thesis Assistant chat, and the
memo generator/version list. `/investment-cases/[id]/memo/[memoId]` renders the full 16-section memo
document with an **Investment Committee Mode** toggle (a print-friendly presentation, not a separate
document) and a print/PDF action. A standalone `/investment-cases/methodology` page documents every
safety mechanism above for a reader who wants the "how" without reading code.

### Testing

Live-verified end-to-end in the browser against a real AAPL case with `ANTHROPIC_API_KEY` unset: added
a BASE revenue-growth assumption, confirmed the Thesis Challenge Engine correctly flagged a real
"Potential Challenge" against live trailing revenue growth with the exact percentage-point arithmetic
the spec's worked example describes; added evidence with a non-row-backed source; ran a full Ad-Hoc
review that correctly surfaced a live thesis challenge and a real 78-outcome Milestone 12
historical-validation sample size for AAPL, then confirmed it with an explicit outcome; confirmed the
AI Thesis Assistant surfaces `ANTHROPIC_API_KEY is not configured` rather than failing silently;
generated a memo and confirmed all 14 deterministic sections rendered correctly with only the two
AI-narrated sections marked unavailable, banner included; confirmed cross-user 404s on the case detail,
child-resource creation, review/version/memo/assistant routes, and list-scoping via
`app/api/crossUserAccess.test.ts`'s own "investment cases" describe block.

Automated coverage: run the milestone's own suite directly:

```bash
cd apps/web
npx vitest run lib/investmentCase lib/services/investmentCase lib/services/investmentMemoService lib/ai/investmentThesis lib/ai/generateInvestmentMemoNarrative lib/valuation/quickValuation
```

### Known limitations (Milestone 13)

- **Live challenge/invalidation comparison only covers six metrics** (revenue growth/CAGR, operating
  margin, FCF margin, WACC, terminal growth) — exit multiple, debt, and share count have no live data
  source wired up yet and are simply skipped, never fabricated.
- **Revenue-growth comparison uses trailing fundamentals, not a guidance-implied rate** — reconciling
  `GuidanceObservation`'s dollar-denominated guidance against a prior-period revenue figure was out of
  scope for this milestone.
- **Evidence source validation checks only that a row exists and belongs to the right company** — it
  does not verify the evidence's claim text actually reflects what the source document says.
- **The Evidence Matrix's row-backed source picker is id-entry, not a search/browse UI** — a user needs
  to know or copy a filing/call/event id rather than search for it inline.
- **Investment Committee Mode is a CSS/print presentation toggle**, not a separate export format (e.g.
  PDF generation happens via the browser's own print dialog).
- **Thesis Health and the dashboard recompute a full live context (including a DCF/comps read) per
  case on every page load** — acceptable at the scale of one user's own research cases, not
  optimized for a portfolio of hundreds.

## Data Quality, Model Audit & Research Integrity Engine architecture (Milestone 14)

A centralized integrity layer over every prior milestone's data, models, and research output.
Its purpose is not to make Atlas look more confident — it is to make Atlas capable of saying
"something is wrong," "something is missing," or "this analysis is stale." No component in this
milestone ever changes a financial model, rewrites a report, silently fills in missing data with an
AI estimate, or auto-invalidates a thesis; the engine only detects, verifies, explains, flags, and
audits.

### Centralized engine, not per-feature validation

`lib/integrity/` holds pure, DB-free validation/audit logic (reconciliation math, freshness
classification, DCF/comps auditing, claim validation, contradiction detection) — every module
returns the one shared `IntegrityFinding {check, severity, passed, message}` shape
(`lib/integrity/types.ts`) so a status is never a single unexplained number. `lib/services/`
orchestrates I/O around that logic (loading data, persisting checks, syncing issues), culminating in
`integritySnapshotService.ts`'s `computeIntegritySnapshot()` — the ONE place that fans out to every
check/audit module and reduces their combined output into one issue-sync pass and one explainable
status, rather than duplicating validation logic inside the DCF page, the comps page, and the report
page separately.

### Eight quality dimensions, one explainable status — never a black-box score

Completeness, Accuracy, Freshness, Consistency, Source quality, Traceability, Timeliness, and
Calculation integrity are each their own check, not folded into one score. `computeIntegrityStatus()`
(`lib/integrity/integrityStatus.ts`) takes plain counts (critical/high/medium/low findings, stale
datasets) and returns a `ResearchIntegrityStatus` (VERIFIED / MINOR_ISSUES / REVIEW_REQUIRED /
SIGNIFICANT_ISSUES / CRITICAL) always paired with a non-empty `reasons: string[]` — mirroring
Milestone 13's own `ThesisHealth` pattern exactly (a status is never shown without the reasons that
produced it).

### Freshness, source hierarchy, and completeness — display gaps, never fabricate

`lib/integrity/freshness.ts`'s `classifyFreshness()` compares a dataset's timestamp against a
per-dataset expected refresh window (`DEFAULT_REFRESH_FREQUENCY_DAYS`: 1 day for market data, 7 for
comps, 100 for financials/filings/earnings/DCF/historical-validation/reports/investment cases) and
returns CURRENT / AGING / STALE / UNKNOWN — a missing or future timestamp is UNKNOWN, never silently
treated as current. `lib/integrity/sourceHierarchy.ts`'s `SOURCE_TIER_CONFIG` ranks source types into
four configurable tiers (SEC filings/audited statements = Tier 1 down to unverified/secondary = Tier
4); an unrecognized source type defaults to Tier 4 rather than being assumed trustworthy. Missing
financial/DCF/peer inputs are surfaced as "Data unavailable" completeness findings — never
backfilled with an AI-generated estimate.

### Financial reconciliation and market data validation — tolerance, not exact equality

`lib/integrity/financialReconciliation.ts` checks Gross Profit ≈ Revenue − COGS, Operating Income ≈
Gross Profit − OpEx, FCF ≈ OCF − Capex (reusing `lib/analytics/ratios.ts`'s own
`calculateFreeCashFlow`), Assets ≈ Liabilities + Equity, and the cash roll-forward, each against a
shared `buildCheck()` helper with a 2%-or-$1M-floor tolerance — real accounting/data-provider
rounding noise is expected and never flagged as an error. `lib/integrity/marketDataValidation.ts`
checks Market Cap ≈ Price × Shares and EV ≈ Market Cap + Debt − Cash the same way. Both are proven
live against a deliberately corrupted balance sheet (see Testing).

### DCF audit — reuses the real engine, never a second implementation

`modelAuditService.ts`'s `runDcfModelAudit()` calls the exact same `deriveHistoricalYears` /
`buildMarketData` / `buildDefaultAssumptions` / `runDcf` functions Milestone 5's own Valuation page
and Milestone 9's report aggregator already call, then audits that one real result:
`lib/integrity/dcfAudit.ts`'s `auditDcf()` checks EV/EquityValue/ImpliedSharePrice against
`lib/valuation/bridge.ts`'s own bridge functions at a tight 0.5%-or-$10 internal tolerance (this is
Atlas checking its own arithmetic, not absorbing data noise, so a real disagreement here is a bug),
surfaces Milestone 5's own `ValidationIssue`s as findings, and — the one explicit CRITICAL check the
spec calls out by name — `checkTerminalGrowthBelowWacc()` fails loudly rather than silently producing
a result whenever Terminal Growth ≥ WACC for a perpetuity-growth terminal value.
`lib/integrity/dcfSensitivityAudit.ts` separately verifies the expected monotonic direction of a
sensitivity grid (higher WACC → lower value; higher terminal growth → higher value), flagging any
axis that moves the wrong way as a potential calculation issue.

### Comps audit — defense in depth on top of Milestone 6's own N/M invariant

`runCompsModelAudit()` reuses `getPeerCandidates` / `fetchTargetAndPeers` / `runComps` unchanged, then
`lib/integrity/compsAudit.ts` checks peer-data completeness, a minimum peer count, and — since
Milestone 6's `Multiple.status` already refuses to show a misleading multiple for a non-positive
denominator — a CRITICAL "defense in depth" finding that fires only if that invariant was ever
violated (a multiple marked `ok` despite EBITDA/EBIT/etc. ≤ 0), proven directly by a dedicated test.

### AI claim validation and the research claim registry — the model is never the source of truth

`lib/integrity/claimValidation.ts`'s `validateResearchClaim()` is the one gate every tracked research
claim passes through: a numeric check (stated vs. source value, 5%-or-1pp tolerance) and a citation
check against a `ReadonlySet` of real source ids — an invalid citation always rejects the claim
outright regardless of whether the number happens to be right, mirroring Milestone 9's
`sanitizeReportPayload` / Milestone 13's `collectValidCitationIds` "never trust a claim the model
makes about its own sourcing" discipline. `researchClaimService.ts`'s `createClaim()` persists the
result as a `ResearchClaim` with `ClaimSource[]` rows and a `ClaimValidationStatus` (VERIFIED /
UNVERIFIED / CONTRADICTED / STALE / REJECTED), forming the claim registry spec section 14 asks for —
"this becomes the foundation for research integrity across Atlas."

### Contradiction detection — trend direction, not raw diffing

`lib/integrity/contradictionDetection.ts`'s `computeTrendDirection()` walks a chronological value
sequence and only reports INCREASING/DECREASING when every consecutive step moves the same way beyond
a flat-noise threshold; a mixed or noisy sequence is STABLE, never a coin-flip pick.
`detectDirectionalContradiction()` only flags a genuine reversal (e.g., a report claiming "margins
expanding" against three consecutive quarters of decline) — never a continuation of the same
direction. Historical research is never deleted when a contradiction is found; it stays auditable.

### Thesis integrity — a deliberate privacy boundary

`InvestmentCase` (Milestone 13) is private per-user data, unlike the otherwise-global, company-scoped
integrity tables. `thesisIntegrityService.ts`'s `auditInvestmentCaseThesis(userId, caseId)` is scoped
through the exact same ownership check Milestone 13's own services use — its findings are never
written into the shared `ResearchIntegrityIssue` table and never surfaced on the global `/integrity`
dashboard, which only shows a coarse count ("N investment cases tracked... checked per-case by each
case's own owner"). `lib/integrity/thesisIntegrityAudit.ts`'s
`computeGuidanceImpliedGrowthRange()` closes a gap Milestone 13 explicitly left open by converting
dollar-denominated `GuidanceObservation` guidance into an implied growth-rate range (using the prior
year's actual reported revenue as baseline) so it can be compared against an assumed growth rate —
returning `null`, never a fabricated rate, when there's no baseline to divide by.

### Historical validation integrity — proving the no-look-ahead guarantee, not re-implementing it

`lib/integrity/historicalValidationAudit.ts`'s `auditHistoricalValidationDisclosure()` checks sample
size (flagging under 5 outcomes as too small for confidence), methodology disclosure, and benchmark
disclosure — and a dedicated regression test imports Milestone 12's own `filterPeriodsAsOf` directly
to prove a future-filed period is genuinely excluded from a point-in-time snapshot, satisfying the
spec's own "future filing exists → snapshot cannot access it" requirement without a second
point-in-time engine.

### Issue lifecycle — dedup, narrow auto-resolution, human-required for anything material

`ResearchIntegrityIssue.dedupeKey` (`@@unique([companyId, dedupeKey])`) means re-running checks that
still find the same problem never creates a duplicate; an existing OPEN/ACKNOWLEDGED issue is left
untouched, and a RESOLVED/IGNORED issue is deliberately never auto-reopened.
`integrityIssueService.ts`'s `AUTO_RESOLVABLE_CATEGORIES` allowlist (`DATA_FRESHNESS`,
`DATA_COMPLETENESS`, `SOURCE_UNVERIFIED`, `DCF_STALE`, `HISTORICAL_VALIDATION_LIMITATION`) is the only
set of categories `syncIssuesFromFindings()` will auto-resolve once the underlying check passes again
— financial discrepancies, DCF/comps model errors, contradictions, and thesis conflicts always
require an explicit human `acknowledge`/`resolve` (with a required resolution) or `ignore` (with a
required reason), directly tested.

### Model versioning and the audit log — reinterpreted to match this codebase's own design

DCF and comps results themselves stay exactly as live/unpersisted as Milestones 5 and 6 originally
designed them — rewriting that would contradict the spec's own "do not rewrite Milestones 1-13
unnecessarily." What IS versioned, append-only, is Atlas's own EVALUATION of a model run:
`ModelAudit` rows carry a `methodologyVersion`, the findings, and a frozen `inputsSnapshot` so a past
audit stays reproducible even after the live model later moves. `AuditLogEntry` is written only by the
integrity engine's own actions (checks run, issues created/resolved/ignored/auto-resolved, claims
created/validated, snapshots computed) — this milestone deliberately does not retrofit write-hooks
into every Milestone 1-13 mutation path. Together they answer "what did Atlas know, when did it know
it, and why did it produce this conclusion" for anything the integrity engine itself touched.

### Performance — TTL-cached snapshots, never a full-portfolio recompute

`getCompanyIntegritySnapshot(companyId, {maxAgeMs, forceRefresh})` serves a cached `IntegritySnapshot`
row (the one model in this milestone that IS upserted rather than append-only) when it's under 15
minutes old, and only recomputes on a cache miss or an explicit refresh — the same TTL-cache
discipline Milestone 3's `financialDataService` already established, since this codebase has never had
a background job queue. `getGlobalIntegrityDashboard()` reads only already-computed snapshots and
never triggers a portfolio-wide sweep; a company appears on `/integrity` only once its own page has
computed a snapshot at least once.

### Database, API, and authorization

Ten new enums and seven new models (`DataQualityCheck`, `ResearchIntegrityIssue`, `ResearchClaim`,
`ClaimSource`, `ModelAudit`, `AuditLogEntry`, `IntegritySnapshot`) under a dedicated `prisma.schema`
section. Eight route files under `app/api/integrity/`: the five GET routes (dashboard, company
snapshot, issues, claims, audit log) are deliberately public — like
`/api/companies/[ticker]/thesis-monitor` and `/timeline`, this is company-scoped research data, not
user-owned data, so it follows this codebase's existing convention of leaving company-scoped reads
open while gating every write. The three write routes
(`issues/[id]/acknowledge|resolve|ignore`) require `requireUser()` so every action records the acting
user's id for accountability. Four new, deliberately narrow `AlertType` values integrate with
Milestone 10/11's alert engine (`CRITICAL_INTEGRITY_ISSUE`, `RESEARCH_DATA_MISMATCH`,
`DCF_MODEL_ERROR`, `THESIS_ASSUMPTION_CONFLICT`) — matching the spec's own "do not alert for every
minor issue."

### UI

A **Research Integrity** panel on every `/company/[ticker]` overview page
(`components/company/integrity/IntegrityPanel.tsx`) shows the company's status, its reasons, and
seven expandable dimension tiles (Market Data, Financial Statements, SEC Filings, Earnings, DCF
Model, Comparable Companies, Investment Cases) — each expands to its detail text and any open issues,
with inline Acknowledge/Resolve/Ignore actions (resolving and ignoring require a typed explanation, no
`window.prompt`). Below the tiles, a collapsed Research Claim Registry and Audit Log load lazily on
first expand. It loads client-side, independent of the page's own server render, the same way the
Milestone 11 Thesis Monitor panel does — computing a snapshot runs the real DCF and comps engines, so
it should never block the page. `/integrity` is the global dashboard: companies grouped by status
(Critical → Verified), filterable by the same seven dimensions, reading only already-computed
snapshots.

### Testing

Live-verified end-to-end in the browser against real AAPL data: the panel correctly computed a
CRITICAL status from a real "WACC could not be calculated" DCF finding and a real market-cap
reconciliation discrepancy; acknowledging, then resolving with a typed explanation, both persisted
correctly and were reflected in the Audit Log (`ISSUE_ACKNOWLEDGED`, `ISSUE_RESOLVED`,
`SNAPSHOT_COMPUTED`, `ISSUE_CREATED` entries, each timestamped); an unauthenticated acknowledge attempt
correctly surfaced "Not authenticated." rather than silently succeeding; the global dashboard's
dimension filter correctly included AAPL under "DCF Model" and correctly excluded it under
"Investment Cases." Cross-user/auth coverage lives in `app/api/crossUserAccess.test.ts`'s "research
integrity" describe block: every GET route stays public and returns 200 unauthenticated, all three
write routes reject an unauthenticated caller with 401, acknowledge/resolve/ignore each correctly
record the acting user's id, resolve/ignore each 400 on a missing required field, and all three 404 on
a non-existent issue id — proven through the real route handlers, not just the service layer.

The spec's own explicit corrupted-data requirement (section 32) is proven in
`integritySnapshotService.test.ts`: a company seeded with a balance sheet where Assets ≠ Liabilities +
Equity produces `status !== 'VERIFIED'`, `dimensions.financialStatements.status === 'ERROR'`, and a
persisted `FINANCIAL_RECONCILIATION` issue — and, symmetrically, a fully self-consistent balance sheet
produces `status !== 'CRITICAL'` with `dimensions.financialStatements.status === 'OK'`, proving clean
data never generates a false critical warning.

Automated coverage: run the milestone's own suite directly:

```bash
cd apps/web
npx vitest run lib/integrity lib/services/dataQualityService lib/services/modelAuditService lib/services/researchClaimService lib/services/integrityIssueService lib/services/auditLogService lib/services/integritySnapshotService lib/services/thesisIntegrityService
```

### Known limitations (Milestone 14)

- **No automated report-text scanning yet.** Spec section 12's "report says 18% but data says 11% →
  REPORT DATA MISMATCH" worked example describes scanning a generated `ResearchReport`'s own prose for
  numeric claims. This milestone builds the mechanism to validate an individual claim
  (`researchClaimService.createClaim()` + `validateResearchClaim()`) and the `RESEARCH_REPORT_MISMATCH`
  category/alert type to carry the result, but nothing yet auto-extracts claims from a report's
  narrative text — claims must be created explicitly (by a future automated pipeline or an analyst).
- **Dimension tiles group "Data" into Market Data and Financial Statements rather than a single tile**,
  and there is no separate top-level "Research Report" tile — report-level issues surface through the
  Research Claim Registry and the issues list instead. A scoping decision, not a missing check.
- **The global dashboard's category filter runs client-side** over already-computed snapshots — fine
  at the scale of companies Atlas has actually checked, not designed for a portfolio of thousands.
- **Thesis-integrity findings never appear on the global dashboard**, by design (the privacy boundary
  described above) — a user auditing their own investment cases sees findings only on that case's own
  page, not company-wide.
- **`IntegritySnapshot` is a single upserted row per company** — recomputing it re-derives every
  dimension from scratch (data quality checks + a fresh DCF run + a fresh comps run) rather than
  incrementally recomputing only the dimension whose underlying data actually changed.

## Institutional Research Workspace & Collaboration Layer architecture (Milestone 15)

Turns Atlas from a single-user application into a multi-analyst research workspace — Companies,
Reports, Investment Cases, Tasks, Notes, and Reviews organized into a coherent team workflow. This is
deliberately not a social network, not a general project-management tool, not a chat application, and
not a brokerage; every design decision below optimizes for structured research collaboration, review,
and auditability instead.

### Two deliberate non-duplications, resolved in the schema's own header comment

Company and financial data stay exactly as global/shared as every prior milestone — `CompanyCoverage`,
`ResearchProjectCompany`, and `MeetingCompany` are thin join tables pointing AT the existing global
`Company`, never a second copy of it. `ResearchReport` (Milestone 9) stays globally readable — it only
gains an optional `projectId` and a `reviewStatus` workflow field, never a read restriction.
`InvestmentCase` (Milestone 13) stays private per-user data exactly as designed — an optional
`projectId` is purely organizational, and the one deliberate, narrow exception is Investment Committee
Review, where the owner explicitly submits ONE case at a time to become visible (read-only, plus
reactions) to workspace peers.

### One authorization choke point, four roles, one rank

Every other Milestone 15 service calls `requireWorkspaceMember()` / `requireWorkspaceRole()`
(`lib/services/workspaceService.ts`) rather than re-querying `WorkspaceMember` independently.
"Workspace doesn't exist" and "you're not a member of it" collapse into the identical
`WorkspaceNotFoundError` → 404 — matching the `getOwnedInvestmentCase` precedent from Milestone
13 — so a workspace id can never be used to probe existence; `WorkspaceForbiddenError` → 403 is
reserved for "you are a member, but your role doesn't permit this." `lib/workspace/permissions.ts`
powers every permission check off a single `ROLE_RANK: {VIEWER: 0, ANALYST: 1, ADMIN: 2, OWNER: 3}` and
an `atLeast()` helper, rather than a permission matrix — the spec's own "keep the permission system
extensible" satisfied by one ordered rank. `canReviewReport` (ANALYST+, can work the checklist and
leave section comments) is deliberately separate from `canApproveReport` (ADMIN+ only) — a peer analyst
can review a colleague's work in depth without being able to sign off on it, matching how a real
research desk separates review from approval. `canComment` is the one permission every member
including VIEWER has — the spec never excludes viewing/commenting, only editing and approving.

### The review workflow — a formal gate, not a status label

`ResearchReport.reviewStatus` (DRAFT → IN_REVIEW → APPROVED → ARCHIVED) is a field deliberately
separate from the report's own pre-existing `status` (SUCCESS/FAILED — did generation succeed,
untouched by this milestone). A `ResearchReview` row is one review cycle's own audit trail — a report
can accumulate several over its lifetime, and none are ever overwritten. Every new review is seeded
with the spec's literal 10-item checklist (`lib/workspace/reviewChecklist.ts`'s
`REVIEW_CHECKLIST_TEMPLATE`, item 8 — "Research integrity status reviewed" — links to the real
Milestone 14 panel, never a re-derived status). `approveReview()` requires BOTH every checklist item
checked AND zero `OPEN` section comments, enforced server-side regardless of what the client UI shows;
section comments are never deleted, only ever moved OPEN → RESOLVED, preserving a full audit trail of
what was raised and how it was addressed.

### Research notes — sourced against real Atlas records, never a fake id

`lib/workspace/noteSourceValidation.ts` mirrors Milestone 14's `ClaimSource`/`validateClaimCitation`
pattern exactly: a loose `sourceType`/`sourceId` pointer, validated purely (DB-free) given an `exists`
boolean the caller supplies. `researchNoteService.ts`'s `sourceExists()` does the actual lookup —
SecFiling/EarningsCall/ResearchEvent/ResearchReport/InvestmentCase, additionally checked against the
note's own company where the source type is company-scoped — and the whole note creation aborts with
`InvalidResearchNoteInputError` if any source fails to resolve, rather than silently dropping it.
Verified live: attaching a real 10-Q filing id succeeds and the source appears on the note; attaching a
fabricated id is rejected with `400 "The referenced source does not exist in Atlas."` and no note or
source row is created.

### Investment Committee Review — reactions only, never an automatic recommendation

`committeeReviewService.ts`'s `assertCommitteeVisible()` derives "who can see this case" transitively
through `InvestmentCase.projectId → ResearchProject.workspaceId` — no separate visibility flag needed.
A non-owner sees a case only once its owner has explicitly flipped `committeeReviewStatus` to
`SUBMITTED`; reactions (Support/Concern/Question) require `SUBMITTED` even for the owner (no reacting
to your own unsubmitted case). There is deliberately no "decision" field anywhere on a reaction or the
case itself — reactions can never be aggregated into an automatic recommendation, proven directly by a
test asserting the field doesn't exist on the wire.

### Dashboard, calendar, and digest — read already-computed data, never re-trigger detection

`workspaceDashboardService.ts`'s recent-changes panel reads `ResearchEvent` rows directly rather than
calling Milestone 11's `getCompanyTimeline` (which lazily triggers network-touching detection) — far
too expensive to run for every covered company on every dashboard load. `researchCalendarService.ts`
reuses Milestone 10's own earnings-date estimation via a small, non-breaking extraction
(`estimateEarningsCalendarEntry()`) rather than a second estimator. `researchDigestService.ts` computes
its counts deterministically, each from a different milestone's own table (major company developments
from Milestone 11 events, SEC filings reviewed from Milestone 7 analyses, thesis challenges from
Milestone 11 assumption comparisons, reports updated from Milestone 9) — investment-case counts are
scoped strictly to the calling user, matching Milestone 13's own privacy boundary. The narrative
summary reuses the AI workspace assistant rather than a second AI pipeline, and is wrapped so any AI
failure (including no API key configured) never breaks the deterministic counts.

### Citation coverage — "Not available," never a manufactured percentage

`citationCoverageService.ts` returns a fixed `{available: false, coveragePercent: null}` sentinel
whenever zero `ResearchClaim` rows are linked to a report — matching the spec's own instruction
verbatim rather than showing a misleading 0%.

### AI workspace assistant — the same citation discipline as Milestone 9 and 13

`lib/workspace/assistantContext.ts`'s `buildWorkspaceAssistantContext()` is the one place that
assembles the AI's context, giving every row a stable citable id (`task:<id>`, `issue:<id>`,
`case:<id>`, …); `sanitizeWorkspaceAssistantPayload()` strips any id the model cites that isn't in that
backend-verified set. Context includes only the caller's own investment cases plus already-submitted
committee cases from anyone — never another analyst's private, unsubmitted work, proven by a dedicated
test. Verified live: with no `ANTHROPIC_API_KEY` configured, the assistant correctly returns
`503 "ANTHROPIC_API_KEY is not configured"` rather than crashing or fabricating an answer.

### Database, API, and authorization

Ten new enums and thirteen new models under a dedicated `prisma.schema` section, plus additive fields
on `Company`, `ResearchReport`, `InvestmentCase`, `AuditLogEntry`, `ResearchClaim`, and `User`. 38 route
files under `app/api/workspace/[id]/...`, all requiring `requireUser()` — unlike Milestone 14's public
company-scoped GETs, workspace data is genuinely private, gated by membership which itself requires
authentication. 19 distinct domain error classes map through one shared helper
(`lib/workspace/errorMapping.ts`'s `mapWorkspaceServiceError()`), a deliberate deviation from this
codebase's usual per-route inline `instanceof` chain, justified by this milestone's unusual error-class
volume. Every consequential action (workspace/project/task/note created, coverage assigned, review
submitted/approved, committee case submitted) writes an `AuditLogEntry` scoped by `workspaceId`, reusing
Milestone 14's own model and log-writing convention.

### UI

`/workspace` — a picker across every workspace the user belongs to. Inside a workspace: `dashboard`
(the five headline tiles, recent research changes, digest generator, AI assistant chat), `coverage`,
`projects`, `tasks`, `notes`, `reviews` (submit → checklist → section comments → approve), `committee`,
`meetings`, `calendar`, and `members`. A shared `CommentsPanel` component serves reports, notes, and
tasks alike rather than three separate implementations. The Milestone 13 case detail page gained one
embedded `CommitteeReviewPanel` rather than a parallel case-viewing surface.

### Testing

Live-verified end-to-end against the real running dev server (session-authenticated `fetch` calls
through the browser, not just the automated suite): created a workspace (role correctly shown as
OWNER), assigned AAPL coverage, created a research project and a task, created a research note citing a
real 10-Q filing (source attached correctly) and confirmed a fabricated source id is rejected with
`400` and persists nothing; confirmed a `FAILED`-status report correctly cannot be submitted for review
(`400 "Only a successfully generated report can be submitted for review."`); confirmed the dashboard,
coverage table, and digest all reflect the real data just created, with the digest's deterministic
counts correct and its AI narrative gracefully `null` with no API key configured; confirmed every one
of those actions produced a correctly `workspaceId`-scoped `AuditLogEntry` (verified directly against
the database); created a second workspace and confirmed complete isolation — every dashboard tile zero,
coverage empty — and confirmed a real note id from workspace one, fetched through workspace two's own
URL, returns `404 "Research note not found"` rather than leaking data across workspaces.

Automated coverage: 1138 tests across 147 files pass, including dedicated real-Postgres integration
tests for every Milestone 15 service and pure-logic module, plus a "workspace (Milestone 15)"
describe block in `app/api/crossUserAccess.test.ts` covering cross-workspace resource isolation and
role-based permission enforcement (a VIEWER cannot approve a review; an ANALYST can review but not
approve) through the real route handlers.

```bash
cd apps/web
npx vitest run lib/workspace lib/services/workspaceService lib/services/researchProjectService lib/services/companyCoverageService lib/services/researchTaskService lib/services/researchNoteService lib/services/researchCommentService lib/services/researchReviewService lib/services/researchMeetingService lib/services/committeeReviewService lib/services/workspaceDashboardService lib/services/coverageDashboardService lib/services/researchCalendarService lib/services/citationCoverageService lib/services/researchDigestService lib/ai/answerWorkspaceQuestion
```

### Known limitations (Milestone 15)

- **No live-verified full second-analyst browser session.** Role enforcement (VIEWER cannot approve,
  ANALYST cannot approve but can review) is proven end-to-end through the automated real-Postgres
  integration tests and the cross-workspace security suite, not through a second interactive browser
  login in the same session — the manual verification pass above used one authenticated OWNER session
  driving the real API directly.
- **No dedicated workspace audit-log page.** Workspace actions are correctly written to the same
  `AuditLogEntry` table Milestone 14 established (verified directly against the database), but there is
  no `/workspace/[id]/audit-log` viewing page in this milestone — a scoping decision, not a missing
  write path.
- **The AI workspace assistant and research digest narrative require `ANTHROPIC_API_KEY`** to be
  configured; without it they fail gracefully (a reported 503 / a `null` narrative) rather than
  degrading to a lower-quality answer, matching every prior milestone's AI integration.
- **Meeting action items create a task only when explicitly requested** (`createTask: true`) — there is
  no automatic classification of which action items "should" become tasks.

## Testing (Milestone 3)

```bash
pnpm test
```

35 tests across 5 files:

- **`lib/xbrl/normalize.test.ts`** — the normalization engine against synthetic Apple-shaped and
  JPMorgan-shaped fixtures (`lib/xbrl/__fixtures__/`): tag-priority resolution, restatement
  dedup, annual/quarterly bucketing from dates (not `fy`/`fp`), free-cash-flow derivation, and
  correct `null` for genuinely untagged concepts (a bank's cost of revenue/inventory).
- **`lib/xbrl/validate.test.ts`** — every sanity check in isolation: balance equation, EPS/shares
  plausibility, magnitude jump, and an explicit test that negative values are never flagged.
- **`lib/providers/secEdgar.test.ts`** — CIK resolution and HTTP-level error handling (404, 429
  retry-then-succeed, repeated 429 → rate-limit error, other non-2xx) against a mocked `fetch`.
- **`app/api/v1/companies/[ticker]/financials/route.ts` test** — the route's error-to-status-code
  mapping, with `financialDataService` mocked (a pure unit test of the HTTP layer).
- **`lib/services/financialDataService.test.ts`** — a real integration test against the local
  Postgres database (only the SEC provider is mocked). This is deliberate: "duplicate prevention"
  and "database insertion" are claims about the actual `@@unique` constraint in
  `prisma/schema.prisma`, which a fully-mocked Prisma client can't verify. It confirms a second
  request within the TTL window doesn't re-fetch from SEC, a forced-stale refresh doesn't create
  a duplicate `financial_periods` row, and `raw_financial_facts` doesn't accumulate across
  refreshes — then cleans up every row it created.

Because one test file talks to a real database, **Postgres must be running** (`docker compose -f
infra/docker-compose.yml up -d`, or your native install) before `pnpm test`. Apple and JPMorgan
are used only as realistic _shapes_ for the fixtures (real tag names, real filing/date
structure) — every dollar figure in the fixtures is a made-up round number, not their actual
reported financials. Real Apple/JPMorgan data was used only for manual verification during
development (see the "verified against real Apple/JPMorgan data" claims above), never committed
to the repo or hardcoded into the application.

## Scripts (from repo root)

| Command             | Description                           |
| ------------------- | ------------------------------------- |
| `pnpm dev`          | Start the Next.js dev server          |
| `pnpm build`        | Production build                      |
| `pnpm lint`         | ESLint across all workspaces          |
| `pnpm typecheck`    | `tsc --noEmit` across all workspaces  |
| `pnpm test`         | Run the Vitest suite (needs Postgres) |
| `pnpm format`       | Format the repo with Prettier         |
| `pnpm format:check` | Check formatting without writing      |
| `pnpm db:generate`  | Generate the Prisma client            |
| `pnpm db:migrate`   | Run Prisma migrations (dev)           |
| `pnpm db:studio`    | Open Prisma Studio                    |

## Architecture

Fifteen milestones, each documented in its own section above (database schema, design decisions,
known limitations) and, for the larger subsystems, its own deep-dive under `docs/`:
`docs/research-intelligence.md`, `docs/backtesting.md`, `docs/investment-case-framework.md`,
`docs/research-integrity.md`, and `docs/research-workspace.md`.
