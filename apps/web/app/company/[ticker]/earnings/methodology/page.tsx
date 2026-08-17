import type { Metadata } from 'next';
import Link from 'next/link';

export const dynamic = 'force-static';

interface MethodologyPageProps {
  params: { ticker: string };
}

export async function generateMetadata({ params }: MethodologyPageProps): Promise<Metadata> {
  return { title: `Earnings Call Intelligence Methodology · ${params.ticker.toUpperCase()} · Atlas Research` };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="text-ink font-serif text-base font-semibold">{title}</h2>
      <div className="text-ink/70 mt-2 space-y-2 text-sm leading-relaxed">{children}</div>
    </section>
  );
}

export default function EarningsMethodologyPage({ params }: MethodologyPageProps) {
  const ticker = params.ticker.toUpperCase();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link href={`/company/${ticker}/earnings`} className="text-accent text-sm hover:underline">
        ← Back to {ticker} earnings calls
      </Link>
      <h1 className="text-ink mt-3 font-serif text-2xl font-semibold">Earnings Call Intelligence Methodology</h1>
      <p className="text-ink/60 mt-2 text-sm">
        A concise reference for how Atlas Research retrieves, processes, and analyzes earnings-call transcripts.
        Every figure and claim on the call-analysis page traces back to something explained here.
      </p>

      <Section title="What is Earnings Call Intelligence?">
        <p>
          It retrieves a company&apos;s quarterly earnings-call transcript where one is available, parses it into
          speaker-tagged sections (opening remarks, prepared remarks, Q&amp;A), and — only when you ask for it —
          generates a structured, source-cited analysis: business trends, management commentary, guidance, risks,
          capital allocation, analyst-question topics, and an AI-based read on management&apos;s language. It is an
          analytical research aid, not an investment-advice tool: it never recommends buying or selling a security,
          and every AI-generated claim links back to the exact transcript text it came from.
        </p>
      </Section>

      <Section title="Transcript data source">
        <p>
          Transcripts come from Financial Modeling Prep (FMP), the same provider Atlas already uses for company
          quotes and peer data — isolated in its own module so a second provider could be added later without
          touching the processing pipeline or the UI. Not every company or quarter has a transcript available: FMP
          gates full transcript access behind a paid subscription tier, and some quarters simply aren&apos;t
          indexed. When a transcript can&apos;t be retrieved, the call is marked{' '}
          <code className="text-ink/80 bg-accent-soft rounded px-1 py-0.5 text-xs">UNAVAILABLE</code> and the page
          says so plainly — nothing is ever fabricated to fill the gap. The call list itself is derived from{' '}
          {ticker}&apos;s own already-ingested quarterly SEC filings (Milestones 3/4): a quarter appears here once
          Atlas has that quarter&apos;s financial data, independent of whether a transcript exists for it.
        </p>
      </Section>

      <Section title="The transcript-processing pipeline">
        <p>Each step is a separate, independently-tested module:</p>
        <pre className="border-ink/10 bg-paper overflow-x-auto rounded-lg border p-3 text-xs">
{`FMP earnings-call-transcript endpoint
  -> EarningsCall metadata (deduplicated by company + fiscal year + quarter)
  -> raw transcript text retrieval, on demand
  -> deterministic speaker/section parsing (lib/earnings/transcriptParsing.ts) —
     splits the raw text into Opening Remarks / Prepared Remarks / Q&A,
     tagging each turn's speaker name, role, and type (executive / analyst /
     operator) using heuristics, not an LLM
  -> stored TranscriptSegment rows, ready for citation, search, and AI analysis`}
        </pre>
        <p>
          A call&apos;s <code className="text-ink/80 bg-accent-soft rounded px-1 py-0.5 text-xs">processingStatus</code>{' '}
          tracks exactly where it is in this pipeline. Speaker identification is heuristic: an executive is
          recognized either by having spoken during prepared remarks already, or by a title keyword (CEO, CFO,
          etc.); anyone new who only speaks during Q&amp;A is treated as an analyst. This can occasionally
          misclassify an executive whose only appearance is answering a question — see Known Limitations.
        </p>
      </Section>

      <Section title="Financial results — never AI-generated">
        <p>
          Every figure in the Financial Results panel (revenue, EPS, margins, net income, free cash flow) is
          computed deterministically from Atlas&apos;s own normalized SEC financial-statement data — the same
          figures the Financials and Valuation pages use — compared against the prior quarter (QoQ) and the same
          quarter one year earlier (YoY). Nothing here is read from the transcript or generated by the AI model,
          so a reported number can never be mistranscribed. Atlas has no analyst-estimates data source configured,
          so ESTIMATE comparisons are simply omitted rather than invented.
        </p>
      </Section>

      <Section title="Guidance — AI-extracted figures, deterministic math">
        <p>
          The AI model extracts guidance <em>candidates</em> — the metric, the period, and the low/high figures
          management actually stated — from prepared remarks and Q&amp;A. The midpoint (Low + High) / 2 and the
          increased / decreased / maintained / new label are always computed afterward in plain code, matched
          against the previous call&apos;s guidance for the same metric and period — the model is never trusted to
          do that arithmetic or that comparison itself.
        </p>
      </Section>

      <Section title="AI analysis — structured, validated, never automatic">
        <p>
          AI analysis only runs when you click &ldquo;Generate Analysis&rdquo; — never automatically when a call is
          merely viewed. The model is forced to respond with a specific JSON structure (an Anthropic tool call with
          a strict schema), and that response is independently validated against the same schema server-side before
          it&apos;s ever stored; a response that fails validation gets one corrective retry, then is reported as a
          failure rather than stored as if it were valid. Only the prepared-remarks and Q&amp;A sections are sent to
          the model (the operator&apos;s procedural opening is excluded), capped at a per-segment and total
          character budget.
        </p>
      </Section>

      <Section title="Analyst Q&A analysis">
        <p>
          Questions and answers are separated <em>deterministically</em>: each analyst turn in the Q&amp;A section
          starts a new exchange, and the management turns that follow are paired to it as the answer — no AI
          involved in that pairing. The AI then summarizes each question/answer pair and assigns it a short topic
          label. Topic <em>counts</em> are always a deterministic rollup grouped from those labels in code, never
          counted by the model itself. Because topic labels are the model&apos;s own short phrases, near-duplicate
          labels for the same underlying topic may not always merge perfectly — see Known Limitations.
        </p>
      </Section>

      <Section title="Management language — an interpretation, not a measurement">
        <p>
          The &ldquo;Management Language&rdquo; section is explicitly labeled{' '}
          <strong className="text-ink">AI-based language analysis</strong>. It reads word choice and phrasing across
          five dimensions — confidence, caution, uncertainty, optimism, and defensive language — and assigns each a
          categorical level (low / moderate / high), never a numeric score, always backed by a specific excerpt.
          This is never presented as a measurement of what management actually believes or intends; it is the
          model&apos;s reading of language patterns, and you are meant to judge the underlying quote yourself. Where
          a previous call exists, the &ldquo;Compare with Previous Quarter&rdquo; section extends this into a
          tone comparison between the two calls.
        </p>
      </Section>

      <Section title="Citations / source traceability">
        <p>
          Every AI-generated item — a business trend, a risk, a piece of guidance, a language-analysis observation —
          carries a <code className="text-ink/80 bg-accent-soft rounded px-1 py-0.5 text-xs">source</code>: who said
          it and a short verbatim excerpt. Clicking &ldquo;View Source&rdquo; scrolls directly to the transcript
          turn it was drawn from, in the Source Transcript view below the analysis, resolved by matching the excerpt
          against the actual transcript text at render time. If a matching segment can&apos;t be found, the citation
          — speaker and excerpt — is still shown; it&apos;s simply not clickable, never hidden.
        </p>
      </Section>

      <Section title="Filing comparison">
        <p>
          &ldquo;Compare with Previous Quarter&rdquo; splits into a deterministic financial-changes table (reusing
          the same QoQ figures as the Financial Results panel) and AI-generated qualitative language/tone changes,
          each labeled exactly &ldquo;New topic,&rdquo; &ldquo;Changed emphasis,&rdquo; or &ldquo;Similar
          commentary&rdquo; — a wording change is flagged for you to evaluate, never asserted to be a business
          change on its own.
        </p>
        <p>
          &ldquo;Compare with SEC Filing&rdquo; is a cross-source check against the 10-Q/10-K whose period best
          matches this call, entirely AI-generated (both sources are narrative). Every difference uses neutral
          language — &ldquo;Potential difference in emphasis&rdquo; — and the prompt explicitly forbids ever
          claiming management is contradicting the filing.
        </p>
      </Section>

      <Section title="Cost control">
        <ul className="list-inside list-disc space-y-1">
          <li>An analysis or comparison is generated once and stored — viewing a call again never re-calls the model.</li>
          <li>Regeneration only happens when you explicitly click &ldquo;Regenerate.&rdquo;</li>
          <li>Only prepared-remarks and Q&amp;A transcript segments are sent to the model, with a per-segment and total character budget.</li>
          <li>Every stored analysis records the model used and its input/output token counts.</li>
        </ul>
      </Section>

      <Section title="Known limitations">
        <ul className="list-inside list-disc space-y-1">
          <li>Transcript availability depends on FMP&apos;s coverage and subscription tier; a call marked &ldquo;Transcript unavailable&rdquo; genuinely has no transcript Atlas can retrieve, not a bug.</li>
          <li>Speaker classification (executive vs. analyst) is heuristic; an executive whose only appearance is answering a Q&amp;A question, without a recognizable title, can occasionally be misclassified as an analyst.</li>
          <li>Analyst-question topic labels are the AI&apos;s own short phrases; semantically identical topics worded slightly differently across questions may not always group together.</li>
          <li>The earnings-call list is derived from Atlas&apos;s own ingested quarterly financial data, so a company with no quarterly filings ingested yet won&apos;t show any calls until that data is synced (visiting the Overview or Valuation tab first triggers that sync).</li>
          <li>Analyst-estimate comparisons are not available — Atlas has no configured estimates data source, and none is fabricated.</li>
        </ul>
      </Section>
    </main>
  );
}
