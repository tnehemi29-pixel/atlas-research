'use client';

/**
 * Every AI-generated insight renders through this component — "every
 * AI-generated insight should link back to the transcript." `anchor` is
 * resolved by the caller (matching the citation's excerpt against the
 * call's actual transcript segments — see resolveSegmentAnchor.ts); when no
 * matching segment can be found, the excerpt still displays, just without a
 * jump link — the citation itself is never hidden.
 */
interface EarningsCitationBadgeProps {
  label?: string;
  speaker: string;
  excerpt: string;
  anchor: string | null;
}

export function EarningsCitationBadge({ label = 'Source', speaker, excerpt, anchor }: EarningsCitationBadgeProps) {
  function jumpToSource() {
    if (!anchor) return;
    const el = document.getElementById(anchor);
    if (!el) return;
    if (el instanceof HTMLDetailsElement) el.open = true;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.classList.add('ring-2', 'ring-accent');
    setTimeout(() => el.classList.remove('ring-2', 'ring-accent'), 2000);
  }

  return (
    <div className="border-ink/10 bg-bg mt-1.5 rounded-lg border-l-2 border-l-accent/50 px-2.5 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-ink/40 text-[10px] font-medium uppercase tracking-wide">
          {label}: {speaker}
        </span>
        {anchor && (
          <button type="button" onClick={jumpToSource} className="text-accent shrink-0 text-[10px] font-medium hover:underline">
            View Source →
          </button>
        )}
      </div>
      <p className="text-ink/60 mt-0.5 text-xs italic">&ldquo;{excerpt}&rdquo;</p>
    </div>
  );
}
