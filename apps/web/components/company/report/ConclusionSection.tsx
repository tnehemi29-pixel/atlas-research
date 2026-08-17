import type { ResearchReportAiPayload } from '@/lib/ai/reportSchema';
import { ReportSection } from './ReportSection';
import { SourceCitation } from './SourceCitation';

/** Deliberately structured, deliberately neutral — "Do NOT output
 * 'Buy'/'Sell'/'Strong Buy'/'Strong Sell'." The schema itself has no field
 * for a recommendation; this just labels the five required, non-directive
 * framings the spec asks for. */
export function ConclusionSection({ conclusion }: { conclusion: ResearchReportAiPayload['conclusion'] }) {
  const rows: Array<{ label: string; value: string }> = [
    { label: 'What Is Working', value: conclusion.what_is_working },
    { label: 'What Is Deteriorating', value: conclusion.what_is_deteriorating },
    { label: 'What Valuation Implies', value: conclusion.valuation_implication },
    { label: 'Key Assumptions', value: conclusion.key_assumptions },
    { label: 'What Could Change the Thesis', value: conclusion.what_could_change_thesis },
  ];

  return (
    <ReportSection id="conclusion" title="Research Conclusion">
      <p className="text-ink/40 -mt-1 mb-2 text-[10px] italic">
        A neutral research summary — not a recommendation to buy, sell, or hold.
      </p>
      <dl className="space-y-2.5">
        {rows.map((row) => (
          <div key={row.label}>
            <dt className="text-ink/40 text-[10px] font-medium uppercase tracking-wide">{row.label}</dt>
            <dd className="text-ink/80 text-sm leading-relaxed">{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2">
        <SourceCitation sourceIds={conclusion.source_ids} />
      </p>
    </ReportSection>
  );
}
