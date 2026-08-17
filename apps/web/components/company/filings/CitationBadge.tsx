'use client';

/**
 * Every AI-generated insight renders through this component — "every
 * AI-generated insight should contain a reference to the underlying filing
 * section" and "the user should be able to click 'View Source' and
 * navigate to the relevant filing." `anchor` is resolved by the caller
 * (matching the citation's section label against the filing's actual
 * extracted sections — see filingSectionAnchor in FilingDetailWorkspace);
 * when no matching section can be found (e.g. the model cited a section
 * type Atlas didn't extract), the excerpt still displays, just without a
 * jump link — the citation itself is never hidden.
 */
interface CitationBadgeProps {
  label?: string;
  section: string;
  excerpt: string;
  anchor: string | null;
}

const SECTION_LABELS: Record<string, string> = {
  BUSINESS: 'Business',
  RISK_FACTORS: 'Risk Factors',
  MDA: "Management's Discussion and Analysis",
  LIQUIDITY: 'Liquidity and Capital Resources',
  MARKET_RISK: 'Quantitative and Qualitative Disclosures About Market Risk',
  FINANCIAL_STATEMENTS: 'Financial Statements',
  LEGAL_PROCEEDINGS: 'Legal Proceedings',
  CONTROLS_AND_PROCEDURES: 'Controls and Procedures',
  EIGHT_K_ITEM: 'Filing Item',
  OTHER: 'Filing',
};

export function CitationBadge({ label = 'Source', section, excerpt, anchor }: CitationBadgeProps) {
  function jumpToSource() {
    if (!anchor) return;
    const el = document.getElementById(anchor);
    if (!el) return;
    if (el instanceof HTMLDetailsElement) el.open = true; // expand a collapsed section before scrolling to it
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.classList.add('ring-2', 'ring-accent');
    setTimeout(() => el.classList.remove('ring-2', 'ring-accent'), 2000);
  }

  return (
    <div className="border-ink/10 bg-bg mt-1.5 rounded-lg border-l-2 border-l-accent/50 px-2.5 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-ink/40 text-[10px] font-medium uppercase tracking-wide">
          {label}: {SECTION_LABELS[section] ?? section}
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
