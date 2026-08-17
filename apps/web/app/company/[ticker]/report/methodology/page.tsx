import type { Metadata } from 'next';
import Link from 'next/link';

export const dynamic = 'force-static';

interface MethodologyPageProps {
  params: { ticker: string };
}

export async function generateMetadata({ params }: MethodologyPageProps): Promise<Metadata> {
  return { title: `Research Report Methodology · ${params.ticker.toUpperCase()} · Atlas Research` };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="text-ink font-serif text-base font-semibold">{title}</h2>
      <div className="text-ink/70 mt-2 space-y-2 text-sm leading-relaxed">{children}</div>
    </section>
  );
}

export default function ReportMethodologyPage({ params }: MethodologyPageProps) {
  const ticker = params.ticker.toUpperCase();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link href={`/company/${ticker}/report`} className="text-accent text-sm hover:underline">
        ← Back to {ticker} research report
      </Link>
      <h1 className="text-ink mt-3 font-serif text-2xl font-semibold">How Atlas Research Generates Reports</h1>
      <p className="text-ink/60 mt-2 text-sm">
        A concise reference for how the Research Report Generator assembles, cites, and validates every research
        report — the single most important idea being that the AI never calculates a number, and never invents a
        source.
      </p>

      <Section title="Not a chatbot">
        <p>
          A research report is not a free-form conversation with an AI model — it&apos;s a fixed workflow. The
          backend first assembles everything the model is allowed to know (the &ldquo;research context&rdquo;), the
          model organizes and explains that context into a structured document, and the backend then validates and
          merges the result before storing it. The model never has access to any API, database, or tool of its own —
          it only ever sees the exact text Atlas hands it.
        </p>
      </Section>

      <Section title="The research-data aggregation pipeline">
        <p>Every report is built from data Atlas already has — nothing here is fetched or computed specially for the report:</p>
        <pre className="border-ink/10 bg-paper overflow-x-auto rounded-lg border p-3 text-xs">
{`Company profile & market data      (Milestone 2)
Historical financial statements    (Milestones 3/4)
DCF valuation (Bear/Base/Bull)      (Milestone 5 engine, re-run fresh)
Comparable-company valuation        (Milestone 6 engine, re-run fresh)
Latest SEC filing analysis          (Milestone 7, read-only)
Latest earnings-call analysis       (Milestone 8, read-only)
        ↓
lib/research/aggregateResearchContext.ts
        ↓
A normalized "research context": every number pre-computed and
pre-formatted, every fact paired with a source ID, nothing raw
or unformatted ever passed further downstream.`}
        </pre>
        <p>
          The DCF and comps figures are never recalculated by hand for the report — the aggregator calls the exact
          same <code className="text-ink/80 bg-accent-soft rounded px-1 py-0.5 text-xs">runDcf</code> /{' '}
          <code className="text-ink/80 bg-accent-soft rounded px-1 py-0.5 text-xs">runComps</code> engine functions
          the Valuation and Comparable Companies pages already use, with their own default assumptions. SEC and
          earnings-call insights are read from whatever analysis already exists (Milestones 7/8) — generating a
          research report never triggers a new AI call in those milestones as a side effect.
        </p>
      </Section>

      <Section title="How the model receives context">
        <p>
          The entire research context is rendered into one plain-text prompt — every figure already formatted
          exactly as the report will display it (the same currency/percent formatters the rest of the app uses), and
          a numbered list of every source the model is permitted to cite. The model is never shown raw database
          rows, and it is never given a tool, function, or API of its own to call.
        </p>
      </Section>

      <Section title="Structured output, not free-form text">
        <p>
          The model must respond via a single tool call matching a strict JSON schema (validated with Zod
          server-side, independent of the provider&apos;s own schema enforcement). Critically, that schema has{' '}
          <strong className="text-ink">no field anywhere for a number</strong> — no price, no percentage, no
          multiple. Every field is either narrative text or a categorized description, always paired with{' '}
          <code className="text-ink/80 bg-accent-soft rounded px-1 py-0.5 text-xs">source_ids</code>. This makes it
          structurally impossible for the model to report a financial figure — there is simply no place to put one.
          A response that fails validation gets one corrective retry, then is stored as a failed generation rather
          than accepted as-is.
        </p>
      </Section>

      <Section title="Citation architecture">
        <p>
          Every source a report can cite — the financial statements, the DCF model, the comps model, the latest SEC
          filing, the latest earnings call — is assigned a numeric ID by the backend, in a fixed order, before the
          model ever runs. This is a closed list: the model may cite an ID from it, but cannot extend it. After
          generation, every{' '}
          <code className="text-ink/80 bg-accent-soft rounded px-1 py-0.5 text-xs">source_ids</code> array in the
          model&apos;s response is checked against that list server-side, and any ID that doesn&apos;t correspond to
          a real source is silently dropped — never trusted at face value. In the report itself, each citation
          renders as a small numbered chip (e.g. &ldquo;[3]&rdquo;) that jumps to the matching card in the Research
          Sources section.
        </p>
      </Section>

      <Section title="Hallucination safeguards">
        <ul className="list-inside list-disc space-y-1">
          <li>No numeric field exists anywhere in the AI&apos;s output schema — every number in the report comes from Atlas&apos;s own engines.</li>
          <li>Every citation is checked against a closed, backend-built source registry; invented IDs are stripped before storage.</li>
          <li>The system prompt explicitly instructs the model to write &ldquo;Insufficient data to determine&rdquo; rather than guess when the context doesn&apos;t support a conclusion.</li>
          <li>Growth drivers, catalysts, and risks are only ever generated from what SEC filings, earnings calls, or financial data actually support — an empty list is a valid, expected outcome, not an error.</li>
          <li>The model is explicitly instructed never to output a &ldquo;Buy&rdquo;/&ldquo;Sell&rdquo; recommendation, and the schema&apos;s conclusion fields are framed as neutral research language, not a directive.</li>
        </ul>
      </Section>

      <Section title="Report versioning">
        <p>
          Generating a report never overwrites a previous one — each generation creates a new, numbered version tied
          to the company, so you can compare how the report (and the underlying research context) changed over time.
          A failed generation (for example, if AI generation isn&apos;t configured in this environment) is itself
          stored as its own version with a clear failure status, rather than silently retried on every page view.
        </p>
      </Section>

      <Section title="Freshness">
        <p>
          Every report records the exact moment its research context was assembled (&ldquo;Research data through:
          [date]&rdquo;). If any underlying data source came back stale or unavailable when the report was
          generated, that&apos;s recorded as a data note and surfaced as a warning in the report header — the report
          never implies it reflects real-time information it doesn&apos;t actually have.
        </p>
      </Section>

      <Section title="Print / export">
        <p>
          The &ldquo;Print / Export&rdquo; button uses the browser&apos;s native print dialog (which includes
          &ldquo;Save as PDF&rdquo; on every major browser) against print-specific styling: navigation and
          interactive controls are hidden, every section is forced open regardless of its on-screen collapsed state,
          and citation chips are hidden in favor of the numbered Research Sources list at the end — a clean,
          text-first document rather than a screenshot of the on-screen layout.
        </p>
      </Section>

      <Section title="Cost control">
        <ul className="list-inside list-disc space-y-1">
          <li>A report is only generated when you explicitly click &ldquo;Generate&rdquo; or &ldquo;Regenerate&rdquo; — never automatically.</li>
          <li>Every underlying data source (financials, DCF, comps, SEC filing analysis, earnings-call analysis) is reused from what Atlas already has stored — nothing is re-fetched or re-analyzed by Milestones 7/8 as a side effect of building a report.</li>
          <li>SEC filing and earnings-call insights are capped in item count and length before being sent to the model, since those inputs are already synthesized analysis rather than raw documents.</li>
          <li>Every stored report records the model used and its input/output token counts.</li>
        </ul>
      </Section>

      <Section title="Known limitations">
        <ul className="list-inside list-disc space-y-1">
          <li>SEC filing and earnings-call insights are drawn only from the single most recent filing/call — a report doesn&apos;t synthesize a longer history of either.</li>
          <li>If no SEC filing or earnings-call analysis has been generated yet (Milestones 7/8), those sections of the report note that plainly rather than fabricating content.</li>
          <li>The Comparable Company Analysis depends on Atlas being able to auto-select a peer set for the ticker; some tickers have no identifiable peers, in which case that section (and its contribution to the Valuation section) is omitted.</li>
          <li>Citation granularity is per-source, not per-sentence — a citation points to &ldquo;the latest 10-K&rdquo; or &ldquo;the DCF model,&rdquo; not a specific paragraph within it.</li>
        </ul>
      </Section>
    </main>
  );
}
