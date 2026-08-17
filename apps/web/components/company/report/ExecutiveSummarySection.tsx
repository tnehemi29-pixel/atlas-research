import { NarrativeSection } from './NarrativeSection';

export function ExecutiveSummarySection({ data }: { data: { text: string; source_ids: number[] } }) {
  return <NarrativeSection id="executive-summary" title="Executive Summary" data={data} />;
}
