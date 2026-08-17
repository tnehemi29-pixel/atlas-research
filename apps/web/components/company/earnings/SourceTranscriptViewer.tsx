'use client';

import type { TranscriptSegmentResponse } from '@/lib/api/earnings';

/**
 * The "Source Transcript" section — the actual parsed transcript, every
 * speaker turn addressable by the anchor id EarningsCitationBadge jumps to.
 * A supplement to the original call, never a replacement — the transcript
 * itself is the primary source here (Atlas doesn't fetch a separate
 * "official" copy to link out to the way SEC filings do).
 */

const SECTION_LABELS: Record<string, string> = {
  OPENING_REMARKS: 'Opening Remarks',
  PREPARED_REMARKS: 'Prepared Remarks',
  QA: 'Q&A',
  OTHER: 'Other',
};

function highlightText(text: string, query: string): React.ReactNode {
  const trimmed = query.trim();
  if (trimmed.length === 0) return text;

  const lower = text.toLowerCase();
  const lowerQuery = trimmed.toLowerCase();
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let matchIndex = lower.indexOf(lowerQuery, cursor);

  while (matchIndex !== -1) {
    parts.push(text.slice(cursor, matchIndex));
    parts.push(
      <mark key={matchIndex} className="bg-amber-200">
        {text.slice(matchIndex, matchIndex + trimmed.length)}
      </mark>,
    );
    cursor = matchIndex + trimmed.length;
    matchIndex = lower.indexOf(lowerQuery, cursor);
  }
  parts.push(text.slice(cursor));
  return parts;
}

interface SourceTranscriptViewerProps {
  segments: TranscriptSegmentResponse[];
  highlightQuery?: string;
}

export function SourceTranscriptViewer({ segments, highlightQuery = '' }: SourceTranscriptViewerProps) {
  if (segments.length === 0) {
    return (
      <p className="text-ink/50 text-sm">
        Transcript unavailable. No transcript could be retrieved for this call from the data provider — this can
        happen when the provider hasn&apos;t indexed this quarter, or when transcript access requires a
        higher-tier subscription. Nothing here is fabricated.
      </p>
    );
  }

  let currentSection: string | null = null;

  return (
    <div className="space-y-2">
      {segments.map((segment) => {
        const showSectionHeader = segment.section !== currentSection;
        currentSection = segment.section;

        return (
          <div key={segment.id}>
            {showSectionHeader && (
              <h4 className="text-ink/40 mt-4 text-xs font-semibold uppercase tracking-wide first:mt-0">
                {SECTION_LABELS[segment.section] ?? segment.section}
              </h4>
            )}
            <div
              id={segment.anchor}
              className="border-ink/10 bg-paper scroll-mt-4 rounded-xl border p-3"
            >
              <div className="flex items-center gap-2">
                <span className="text-ink text-xs font-semibold">{segment.speakerName ?? 'Unknown speaker'}</span>
                {segment.speakerRole && <span className="text-ink/40 text-xs">{segment.speakerRole}</span>}
                <span className="text-ink/30 text-[10px] uppercase tracking-wide">{segment.speakerType}</span>
              </div>
              <p className="text-ink/70 mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">
                {highlightText(segment.text, highlightQuery)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
