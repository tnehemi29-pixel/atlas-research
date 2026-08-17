'use client';

import type { FilingSectionResponse } from '@/lib/api/filings';

/**
 * The "SOURCE DOCUMENT" section — the actual extracted, cleaned text of
 * every section Atlas identified in the filing, each addressable by the
 * anchor id CitationBadge jumps to. This is a *supplement* to the original
 * SEC filing link, never a replacement for it — "never replace the original
 * SEC filing" — so the external link is always shown alongside it.
 */

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

interface SourceSectionsViewerProps {
  sections: FilingSectionResponse[];
  highlightQuery?: string;
  defaultOpenAnchor?: string;
}

export function SourceSectionsViewer({ sections, highlightQuery = '', defaultOpenAnchor }: SourceSectionsViewerProps) {
  if (sections.length === 0) {
    return (
      <p className="text-ink/50 text-sm">
        No sections were extracted from this filing — this can happen for an unsupported filing type, or when the
        document&apos;s structure couldn&apos;t be reliably parsed. Use the original filing link above.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {sections.map((section, index) => (
        <details
          key={section.id}
          id={section.anchor}
          open={section.anchor === defaultOpenAnchor || index === 0}
          className="border-ink/10 bg-paper scroll-mt-4 rounded-xl border p-4"
        >
          <summary className="text-ink cursor-pointer text-sm font-semibold">
            {section.title}
            <span className="text-ink/40 ml-2 text-xs font-normal">({section.charCount.toLocaleString()} characters)</span>
          </summary>
          <div className="text-ink/70 mt-3 whitespace-pre-wrap text-sm leading-relaxed">
            {highlightText(section.content, highlightQuery)}
          </div>
        </details>
      ))}
    </div>
  );
}
