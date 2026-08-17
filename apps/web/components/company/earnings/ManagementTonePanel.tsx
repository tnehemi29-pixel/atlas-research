'use client';

import type { ManagementLanguageItem } from '@/lib/ai/earningsSchema';
import type { TranscriptSegmentResponse } from '@/lib/api/earnings';
import { EarningsCitationBadge } from './EarningsCitationBadge';
import { resolveSegmentAnchor } from './resolveSegmentAnchor';

const DIMENSION_LABELS: Record<string, string> = {
  confidence: 'Confidence',
  caution: 'Caution',
  uncertainty: 'Uncertainty',
  optimism: 'Optimism',
  defensiveness: 'Defensive Language',
};

const LEVEL_STYLE: Record<string, string> = {
  low: 'border-ink/15 bg-ink/5 text-ink/60',
  moderate: 'border-amber-300 bg-amber-50 text-amber-800',
  high: 'border-accent/30 bg-accent-soft text-accent',
};

interface ManagementTonePanelProps {
  items: ManagementLanguageItem[];
  segments: TranscriptSegmentResponse[];
}

export function ManagementTonePanel({ items, segments }: ManagementTonePanelProps) {
  return (
    <div>
      <div className="border-ink/10 bg-paper rounded-xl border p-3">
        <p className="text-ink/60 text-xs leading-relaxed">
          <strong className="text-ink">AI-based language analysis.</strong> The levels below are the model&apos;s
          interpretation of word choice and phrasing across the call — they are not a psychological measurement of
          management&apos;s true intentions, confidence, or state of mind, and no numeric score is assigned. Every
          reading is backed by a specific excerpt so you can judge it yourself.
        </p>
      </div>

      {items.length === 0 ? (
        <p className="text-ink/40 mt-3 text-xs">No notable language patterns were flagged on this call.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {items.map((item, index) => (
            <li key={index} className="border-ink/10 bg-paper rounded-xl border p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-ink text-sm font-semibold">{DIMENSION_LABELS[item.dimension] ?? item.dimension}</span>
                <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${LEVEL_STYLE[item.level] ?? ''}`}>
                  {item.level}
                </span>
              </div>
              <p className="text-ink/70 mt-1.5 text-sm">{item.observation}</p>
              <EarningsCitationBadge speaker={item.source.speaker} excerpt={item.source.excerpt} anchor={resolveSegmentAnchor(segments, item.source.excerpt)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
