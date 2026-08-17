'use client';

import { useMemo, useState } from 'react';
import type { QaResponse } from '@/lib/api/earnings';
import type { TranscriptSegmentResponse } from '@/lib/api/earnings';
import { EarningsCitationBadge } from './EarningsCitationBadge';
import { resolveSegmentAnchor } from './resolveSegmentAnchor';

interface AnalystQaPanelProps {
  qa: QaResponse;
  segments: TranscriptSegmentResponse[];
  aiConfigured: boolean;
}

/** Topic clusters (spec: "Allow users to click a topic and see the relevant
 * questions") plus per-question analyst/firm/summary detail. Topic counts
 * are always a deterministic rollup of the AI's per-question topic labels —
 * grouping/counting is never left to the model itself (see the API route). */
export function AnalystQaPanel({ qa, segments, aiConfigured }: AnalystQaPanelProps) {
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);

  const sortedTopics = useMemo(() => [...qa.topicCounts].sort((a, b) => b.count - a.count), [qa.topicCounts]);
  const questions = qa.analystTopics ?? [];
  const visibleQuestions = selectedTopic ? questions.filter((q) => q.topic === selectedTopic) : questions;

  if (!qa.analystTopics) {
    return (
      <p className="text-ink/40 text-xs">
        {aiConfigured
          ? 'Generate the call analysis to see analyst-question topic clustering and summaries.'
          : "AI-generated topic clustering isn't enabled in this environment."}
      </p>
    );
  }

  if (questions.length === 0) {
    return <p className="text-ink/40 text-xs">No analyst questions were identified in this call&apos;s Q&amp;A section.</p>;
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSelectedTopic(null)}
          className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
            selectedTopic === null ? 'border-accent bg-accent-soft text-accent' : 'border-ink/15 text-ink/60 hover:bg-accent-soft/40'
          }`}
        >
          All ({questions.length})
        </button>
        {sortedTopics.map(({ topic, count }) => (
          <button
            key={topic}
            type="button"
            onClick={() => setSelectedTopic(topic)}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
              selectedTopic === topic ? 'border-accent bg-accent-soft text-accent' : 'border-ink/15 text-ink/60 hover:bg-accent-soft/40'
            }`}
          >
            {topic} ({count})
          </button>
        ))}
      </div>

      <ul className="mt-3 space-y-3">
        {visibleQuestions.map((q, index) => (
          <li key={index} className="border-ink/10 bg-paper rounded-xl border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-ink text-sm font-semibold">{q.analyst}</span>
              {q.firm && <span className="text-ink/40 text-xs">{q.firm}</span>}
              <span className="border-accent/30 bg-accent-soft text-accent ml-auto rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                {q.topic}
              </span>
            </div>
            <p className="text-ink/80 mt-2 text-sm">
              <span className="text-ink/40 text-xs font-medium uppercase tracking-wide">Question: </span>
              {q.question_summary}
            </p>
            <p className="text-ink/80 mt-1 text-sm">
              <span className="text-ink/40 text-xs font-medium uppercase tracking-wide">Response: </span>
              {q.response_summary}
            </p>
            <EarningsCitationBadge speaker={q.source.speaker} excerpt={q.source.excerpt} anchor={resolveSegmentAnchor(segments, q.source.excerpt)} />
          </li>
        ))}
      </ul>
    </div>
  );
}
