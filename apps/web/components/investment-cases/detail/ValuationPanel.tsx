import { formatPrice, formatRatioAsPercent, formatMultiple } from '@/lib/utils/format';

export interface DcfScenarioDisplay {
  label: 'Bear' | 'Base' | 'Bull';
  currentSharePrice: number | null;
  impliedSharePrice: number | null;
  upsideDownside: number | null;
  isValid: boolean;
  wacc: number | null;
  terminalGrowthRate: number | null;
}

export interface ValuationDisplayData {
  currentSharePrice: number | null;
  dcfBear: DcfScenarioDisplay | null;
  dcfBase: DcfScenarioDisplay | null;
  dcfBull: DcfScenarioDisplay | null;
  compsImplied: number | null;
  evToEbitda: number | null;
  peRatio: number | null;
}

function ScenarioCard({ scenario }: { scenario: DcfScenarioDisplay | null }) {
  if (!scenario || !scenario.isValid) {
    return (
      <div className="border-ink/10 rounded-lg border p-4">
        <div className="text-ink/40 text-xs font-medium uppercase tracking-wide">{scenario?.label ?? '—'}</div>
        <p className="text-ink/30 mt-2 text-sm">Not available.</p>
      </div>
    );
  }
  return (
    <div className="border-ink/10 rounded-lg border p-4">
      <div className="text-ink/40 text-xs font-medium uppercase tracking-wide">{scenario.label}</div>
      <div className="text-ink mt-1 font-serif text-xl">{formatPrice(scenario.impliedSharePrice)}</div>
      <div className={`mt-0.5 text-xs ${scenario.upsideDownside !== null && scenario.upsideDownside >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
        {scenario.upsideDownside !== null ? `${scenario.upsideDownside >= 0 ? '+' : ''}${(scenario.upsideDownside * 100).toFixed(1)}% vs. current` : '—'}
      </div>
      <div className="text-ink/40 mt-2 text-xs">
        WACC {formatRatioAsPercent(scenario.wacc)} · Terminal g {formatRatioAsPercent(scenario.terminalGrowthRate)}
      </div>
    </div>
  );
}

/** Spec section 6 — Bull/Base/Bear valuation is always a LIVE recomputation
 * (lib/valuation/quickValuation.ts's getQuickDcfScenarios, reusing the same
 * DCF engine as the Valuation page) — never persisted or hand-entered on
 * the case itself. Comps and current price are similarly live reads. */
export function ValuationPanel({ valuation }: { valuation: ValuationDisplayData }) {
  return (
    <section>
      <h2 className="text-ink font-serif text-lg">Valuation Summary</h2>
      <p className="text-ink/50 mt-1 text-sm">Always a live recomputation from Atlas&apos;s DCF and comps engines — never hand-entered or stored on the case.</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <ScenarioCard scenario={valuation.dcfBear} />
        <ScenarioCard scenario={valuation.dcfBase} />
        <ScenarioCard scenario={valuation.dcfBull} />
      </div>

      <div className="text-ink/60 mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <span>
          Current Price: <span className="text-ink font-medium">{formatPrice(valuation.currentSharePrice)}</span>
        </span>
        <span>
          Comps Implied: <span className="text-ink font-medium">{formatPrice(valuation.compsImplied)}</span>
        </span>
        <span>
          EV/EBITDA: <span className="text-ink font-medium">{formatMultiple(valuation.evToEbitda)}</span>
        </span>
        <span>
          P/E: <span className="text-ink font-medium">{formatMultiple(valuation.peRatio)}</span>
        </span>
      </div>
    </section>
  );
}
