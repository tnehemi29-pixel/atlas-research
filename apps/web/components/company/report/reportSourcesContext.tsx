'use client';

import { createContext, useContext } from 'react';
import type { ResearchSource } from '@/lib/research/types';

/**
 * Every section needs to resolve a `source_ids` array back to the actual
 * ResearchSource it points to (for the citation chip's label/tooltip and for
 * the "View Source" anchor jump into the Sources section) — a context avoids
 * threading `sources` through every leaf component individually.
 */
const ReportSourcesContext = createContext<ResearchSource[]>([]);

export function ReportSourcesProvider({ sources, children }: { sources: ResearchSource[]; children: React.ReactNode }) {
  return <ReportSourcesContext.Provider value={sources}>{children}</ReportSourcesContext.Provider>;
}

export function useReportSources(): ResearchSource[] {
  return useContext(ReportSourcesContext);
}
