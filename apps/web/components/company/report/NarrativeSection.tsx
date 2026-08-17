import { ReportSection } from './ReportSection';
import { SourceCitation } from './SourceCitation';

interface NarrativeSectionData {
  text: string;
  source_ids: number[];
}

/** The shared {text, source_ids} shape reused by 8 of the AI's 14 top-level
 * fields (see lib/ai/reportSchema.ts's narrativeSectionSchema) — one
 * component instead of eight near-identical ones. */
export function NarrativeSection({ id, title, data, extra }: { id?: string; title: string; data: NarrativeSectionData; extra?: React.ReactNode }) {
  return (
    <ReportSection id={id} title={title}>
      {extra}
      <p className="text-ink/80 text-sm leading-relaxed">
        {data.text}
        <SourceCitation sourceIds={data.source_ids} />
      </p>
    </ReportSection>
  );
}
