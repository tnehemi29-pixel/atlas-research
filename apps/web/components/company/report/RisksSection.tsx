import type { ReportRiskItem } from '@/lib/ai/reportSchema';
import { ReportSection } from './ReportSection';
import { SourceCitation } from './SourceCitation';

function humanizeCategory(category: string): string {
  return category
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** The Risks section has its own richer shape (risk / why it matters /
 * evidence, not just a description) — the spec calls out each field
 * explicitly, so it gets its own renderer rather than reusing CategorizedList. */
export function RisksSection({ risks }: { risks: ReportRiskItem[] }) {
  return (
    <ReportSection id="risks" title="Risks">
      {risks.length === 0 ? (
        <p className="text-ink/50 text-sm italic">
          Insufficient data to determine specific risks from the available research context.
        </p>
      ) : (
        <ul className="space-y-3">
          {risks.map((risk, i) => (
            <li key={i} className="border-ink/10 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-ink text-sm font-medium">{risk.risk}</p>
                <span className="text-ink/40 shrink-0 rounded bg-black/5 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                  {humanizeCategory(risk.category)}
                </span>
              </div>
              <dl className="mt-2 space-y-1 text-xs">
                <div>
                  <dt className="text-ink/40 inline font-medium">Why it matters: </dt>
                  <dd className="text-ink/70 inline">{risk.why_it_matters}</dd>
                </div>
                <div>
                  <dt className="text-ink/40 inline font-medium">Evidence: </dt>
                  <dd className="text-ink/70 inline">
                    {risk.evidence}
                    <SourceCitation sourceIds={risk.source_ids} />
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </ReportSection>
  );
}
