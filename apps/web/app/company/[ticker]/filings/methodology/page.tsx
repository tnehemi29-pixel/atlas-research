import type { Metadata } from 'next';
import Link from 'next/link';

export const dynamic = 'force-static';

interface MethodologyPageProps {
  params: { ticker: string };
}

export async function generateMetadata({ params }: MethodologyPageProps): Promise<Metadata> {
  return { title: `SEC Filing Intelligence Methodology · ${params.ticker.toUpperCase()} · Atlas Research` };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="text-ink font-serif text-base font-semibold">{title}</h2>
      <div className="text-ink/70 mt-2 space-y-2 text-sm leading-relaxed">{children}</div>
    </section>
  );
}

export default function FilingsMethodologyPage({ params }: MethodologyPageProps) {
  const ticker = params.ticker.toUpperCase();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link href={`/company/${ticker}/filings`} className="text-accent text-sm hover:underline">
        ← Back to {ticker} SEC filings
      </Link>
      <h1 className="text-ink mt-3 font-serif text-2xl font-semibold">SEC Filing Intelligence Methodology</h1>
      <p className="text-ink/60 mt-2 text-sm">
        A concise reference for how Atlas Research retrieves, processes, and analyzes SEC filings. Every number and
        claim on the filing analysis page traces back to something explained here.
      </p>

      <Section title="What is SEC Filing Intelligence?">
        <p>
          It automatically retrieves a company&apos;s SEC filings (10-K, 10-Q, 8-K, and where available DEF 14A and
          20-F), extracts the sections that matter for research (Business, Risk Factors, MD&amp;A, Liquidity, Legal
          Proceedings, and 8-K items), and — only when you ask for it — generates a structured, source-cited summary
          using an AI model. It is an analytical research aid, not an investment-advice tool: it never recommends
          buying or selling a security, and every AI-generated claim links back to the exact filing text it came
          from.
        </p>
      </Section>

      <Section title="The filing-processing pipeline">
        <p>Each step is a separate, independently-tested module — never one function doing everything:</p>
        <pre className="border-ink/10 bg-paper overflow-x-auto rounded-lg border p-3 text-xs">
{`SEC EDGAR submissions API
  -> filing metadata (type, date, accession number — deduplicated by SEC's own accession number)
  -> filing document retrieval (the primary document's raw HTML, on demand)
  -> document extraction (a DOM walk into an ordered sequence of text/table blocks —
     not regex over raw HTML, since filers use wildly inconsistent markup for the same content)
  -> section identification (regex-matched headings, e.g. "Item 1A. Risk Factors" —
     the LAST match of each heading wins, which reliably picks the real section over
     a Table of Contents reference matching the same pattern)
  -> text cleaning (removes page numbers / boilerplate lines, normalizes whitespace —
     never touches a number, date, or word inside a surviving line)
  -> stored sections, ready for citation and AI analysis`}
        </pre>
        <p>
          A filing&apos;s <code className="text-ink/80 bg-accent-soft rounded px-1 py-0.5 text-xs">processingStatus</code>{' '}
          tracks exactly where it is in this pipeline; a processing failure never removes access to the original SEC
          filing link.
        </p>
      </Section>

      <Section title="AI analysis — structured, validated, never automatic">
        <p>
          AI analysis only runs when you click &ldquo;Generate Analysis&rdquo; — never automatically when a filing
          is merely viewed. The model is forced to respond with a specific JSON structure (an Anthropic tool call
          with a strict schema), and that response is independently validated against the same schema server-side
          before it&apos;s ever stored; a response that fails validation gets one corrective retry, then is reported
          as a failure rather than stored as if it were valid.
        </p>
        <p>
          Only the narrative sections (Business, Risk Factors, MD&amp;A, Liquidity, Market Risk, Legal Proceedings,
          8-K items) are sent to the model, capped at roughly 8,000 characters per section and 40,000 total — a raw
          Financial Statements table is never sent; instead, already-computed figures from Atlas&apos;s own
          normalized financial data (the same figures the Financials and Valuation pages use) are included as
          verified context, so the model reads real numbers rather than transcribing them from a table itself.
        </p>
      </Section>

      <Section title="Citations / source traceability">
        <p>
          Every AI-generated item — a key change, a risk, a piece of management commentary — carries a{' '}
          <code className="text-ink/80 bg-accent-soft rounded px-1 py-0.5 text-xs">source</code>: the section it was
          drawn from and a short verbatim excerpt. Clicking &ldquo;View Source&rdquo; scrolls directly to that
          section in the Source Document view below the analysis. Citations reference the section (and, where the
          filing is short, effectively the paragraph via the excerpt) rather than a precise line/page number — SEC
          HTML filings don&apos;t have stable per-line anchors the way a PDF page does, so section + excerpt is the
          most precise traceability that&apos;s honestly available. The original SEC filing is always linked
          separately and is never replaced by Atlas&apos;s extracted view.
        </p>
      </Section>

      <Section title="Filing comparison">
        <p>
          &ldquo;Compare with Previous Filing&rdquo; splits into two genuinely different kinds of comparison:
        </p>
        <ul className="list-inside list-disc space-y-1">
          <li>
            <strong>Financial changes</strong> (revenue growth, margin change, cash, debt) are computed
            deterministically from Atlas&apos;s own stored financial statements for both filings — never AI-generated,
            so the numbers can never be mistranscribed.
          </li>
          <li>
            <strong>Qualitative changes</strong> (new/removed risks, notable wording changes, guidance and management
            commentary changes) are AI-generated, comparing only the Risk Factors, MD&amp;A, and Liquidity sections
            of both filings. A wording change is always labeled &ldquo;Potentially notable language change&rdquo; —
            a flag for you to evaluate, never a claim that the change is itself economically significant.
          </li>
        </ul>
      </Section>

      <Section title="8-K event categorization and the research timeline">
        <p>
          8-K events are categorized using SEC&apos;s own published Item taxonomy (Item 2.02 = Results of Operations,
          Item 5.02 = Officer/Director changes, etc.) — a fixed lookup table, not an AI guess. The research
          timeline&apos;s Importance column (High/Medium/Low) is the same kind of rule-based classification: 10-K and
          10-Q filings are always High; 8-Ks disclosing earnings, acquisitions, or bankruptcy/restructuring are High;
          executive changes, financing, and material contracts are Medium; everything else is Low. This is stated
          explicitly so it&apos;s never mistaken for a subjective or AI-generated judgment.
        </p>
      </Section>

      <Section title="Cost control">
        <ul className="list-inside list-disc space-y-1">
          <li>An AI analysis or comparison is generated once and stored — viewing a filing again never re-calls the model.</li>
          <li>Regeneration only happens when you explicitly click &ldquo;Regenerate.&rdquo;</li>
          <li>Only narrative sections are sent to the model, with a per-section and total character budget.</li>
          <li>Every stored analysis records the model used and its input/output token counts.</li>
        </ul>
      </Section>

      <Section title="Known limitations">
        <ul className="list-inside list-disc space-y-1">
          <li>Section extraction is heading-pattern based; a filing with highly unusual formatting may have some sections misidentified or left uncategorized as &ldquo;Other.&rdquo;</li>
          <li>DEF 14A and 20-F filings are listed and linked to the original SEC document, but section extraction and AI analysis currently focus on 10-K/10-Q/8-K as prioritized for this milestone.</li>
          <li>Citations reference a section and excerpt, not a precise page/line number — SEC HTML filings don&apos;t have stable line-level anchors to cite.</li>
          <li>AI analysis requires an Anthropic API key to be configured; without one, filing retrieval, processing, and search all still work, and the analysis panel clearly states that AI analysis is unavailable rather than fabricating one.</li>
          <li>The filing list reads SEC&apos;s &ldquo;recent filings&rdquo; window (roughly the last ~1,000 filings per company), which comfortably covers active research use but may not include a company&apos;s very oldest historical filings.</li>
        </ul>
      </Section>
    </main>
  );
}
