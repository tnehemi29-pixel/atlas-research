import type { Metadata } from 'next';
import Link from 'next/link';

export const dynamic = 'force-static';

interface MethodologyPageProps {
  params: { ticker: string };
}

export async function generateMetadata({ params }: MethodologyPageProps): Promise<Metadata> {
  return { title: `DCF Methodology · ${params.ticker.toUpperCase()} · Atlas Research` };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="text-ink font-serif text-base font-semibold">{title}</h2>
      <div className="text-ink/70 mt-2 space-y-2 text-sm leading-relaxed">{children}</div>
    </section>
  );
}

export default function MethodologyPage({ params }: MethodologyPageProps) {
  const ticker = params.ticker.toUpperCase();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link href={`/company/${ticker}/valuation`} className="text-accent text-sm hover:underline">
        ← Back to {ticker} valuation
      </Link>
      <h1 className="text-ink mt-3 font-serif text-2xl font-semibold">DCF Methodology</h1>
      <p className="text-ink/60 mt-2 text-sm">
        A concise reference for exactly how Atlas Research&apos;s DCF engine (
        <code className="text-ink/80 bg-accent-soft rounded px-1 py-0.5 text-xs">lib/valuation/</code>) turns a
        company&apos;s actual historical financials into an implied share price. Every number on the
        valuation page traces back to something on this page.
      </p>

      <Section title="Free cash flow — the exact formula, no deviation">
        <p>Unlevered free cash flow is built from EBIT, never from net income, and never mixes levered and unlevered items:</p>
        <pre className="border-ink/10 bg-paper overflow-x-auto rounded-lg border p-3 text-xs">
{`NOPAT = EBIT × (1 − Tax Rate)
Unlevered FCF = NOPAT + D&A − CapEx − ΔNWC`}
        </pre>
        <p>
          EBIT is operating income as reported. The tax rate is either the historical effective rate
          (income tax ÷ pretax income, bounded to a plausible [-50%, 100%] range) or a user assumption
          — never invented. D&A and CapEx come from the cash flow statement; CapEx is stored as a
          positive outflow amount and subtracted.
        </p>
      </Section>

      <Section title="Net working capital">
        <p>
          NWC = (Current Assets − Cash) − (Current Liabilities − Short-Term Debt). Cash and
          short-term debt are excluded because they&apos;re financing items, not operating working
          capital. If a company doesn&apos;t break those out, the exclusion is simply skipped for that
          piece (equivalent to gross working capital) rather than nulling the whole figure.
        </p>
        <p>ΔNWC(t) = NWC(t) − NWC(t−1), where the first forecast year diffs against the last historical NWC level.</p>
      </Section>

      <Section title="Forecast methods">
        <p>
          <strong>Revenue</strong> — Historical Growth (repeats the historical average), User
          Assumption (a distinct growth rate typed in for every forecast year), or Fade (linear
          interpolation from a starting rate to a long-term normalized rate).
        </p>
        <p>
          <strong>EBIT margin</strong> — Historical Average, User-Defined (flat), or Gradual
          (linear interpolation from a starting to an ending margin). The default is Historical
          Average — the model never assumes margin expansion unless you choose it.
        </p>
        <p>
          <strong>D&A, CapEx, and NWC</strong> — each uses the same three-method driver model:
          Historical Average % of revenue (calculated), User % of Revenue, or a flat dollar amount
          that doesn&apos;t scale with revenue.
        </p>
        <p>A forecast year is only ever computed when every input it depends on is known — a missing input produces a blank forecast table, never a silently substituted zero.</p>
      </Section>

      <Section title="WACC">
        <pre className="border-ink/10 bg-paper overflow-x-auto rounded-lg border p-3 text-xs">
{`Cost of Equity = Risk-Free Rate + Beta × Equity Risk Premium
WACC = (Equity Weight × Cost of Equity) + (Debt Weight × After-Tax Cost of Debt)`}
        </pre>
        <p>
          Equity/debt weights come from market capitalization and total debt (both from actual
          company data). Pre-tax cost of debt is either calculated (latest interest expense ÷ total
          debt) or a user assumption. Beta is retrieved from Financial Modeling Prep when available
          and otherwise must be entered — it is never fabricated. Risk-free rate and equity risk
          premium are always user inputs, since Atlas Research doesn&apos;t have a live market-data
          feed for them; verify these against current market data before relying on the output.
        </p>
      </Section>

      <Section title="Terminal value">
        <p>
          <strong>Perpetuity Growth:</strong> TV = FCF<sub>n+1</sub> / (WACC − g), where FCF<sub>n+1</sub> = FCF<sub>n</sub> × (1 + g).
          Blocked whenever g ≥ WACC — that combination has no finite, economically valid answer.
        </p>
        <p>
          <strong>Exit Multiple:</strong> TV = (Final-year EBIT + D&amp;A) × Exit EV/EBITDA Multiple.
        </p>
        <p>Each method also reports the other method&apos;s implied value as a cross-check (e.g. what perpetuity growth rate the chosen exit multiple is implicitly assuming).</p>
      </Section>

      <Section title="Enterprise value → equity value → implied share price">
        <pre className="border-ink/10 bg-paper overflow-x-auto rounded-lg border p-3 text-xs">
{`Enterprise Value = PV(Forecast FCF) + PV(Terminal Value)
Equity Value = Enterprise Value + Cash − Total Debt
Implied Share Price = Equity Value ÷ Diluted Shares Outstanding`}
        </pre>
        <p>Cash, total debt, and diluted shares outstanding all come from the company&apos;s latest actual balance sheet / income statement — never estimated.</p>
      </Section>

      <Section title="Scenarios (Bear / Base / Bull)">
        <p>
          Bear and Bull apply an editable delta on top of the Base case&apos;s already-resolved,
          per-year revenue growth and EBIT margin, and shift the equity risk premium (which flows
          into WACC through the same cost-of-equity formula as the base case — never an unexplained
          WACC override). This means a scenario applies identically no matter which forecast method
          the base case uses, and any change to a Base assumption automatically carries through to
          both scenarios.
        </p>
      </Section>

      <Section title="Sensitivity analysis">
        <p>
          A grid of implied share price across WACC (columns) and either terminal growth or the exit
          multiple (rows, depending on which terminal value method is selected), dynamically centered
          on the current base-case values — never a hardcoded absolute range. WACC is varied directly
          for this grid, holding every other assumption fixed, rather than back-solved through the
          equity risk premium.
        </p>
      </Section>

      <Section title="Known limitations">
        <ul className="list-inside list-disc space-y-1">
          <li>Risk-free rate and equity risk premium are always user-entered — there is no live market-data feed for them yet.</li>
          <li>Equity value nets out cash and total debt only; minority interest, preferred stock, and other equity claims aren&apos;t stored yet, so they aren&apos;t netted.</li>
          <li>Beta and market capitalization depend on the Financial Modeling Prep integration; when that data isn&apos;t configured or available, those fields must be entered manually.</li>
          <li>Net working capital falls back to a gross (not operating) definition when a company doesn&apos;t break out cash or short-term debt on its balance sheet.</li>
          <li>The tax rate is modeled as a single flat forecast rate, not faded or scheduled year by year.</li>
        </ul>
      </Section>
    </main>
  );
}
