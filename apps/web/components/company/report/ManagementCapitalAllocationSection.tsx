import { NarrativeSection } from './NarrativeSection';

export function ManagementCapitalAllocationSection({ data }: { data: { text: string; source_ids: number[] } }) {
  return <NarrativeSection id="management-capital-allocation" title="Management & Capital Allocation" data={data} />;
}
