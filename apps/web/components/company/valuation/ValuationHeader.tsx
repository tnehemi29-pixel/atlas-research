import type { CompanyOverview } from '@erp/types';
import type { DcfResult } from '@/lib/valuation/types';
import { formatPercent, formatPrice } from '@/lib/utils/format';

interface ValuationHeaderProps {
  overview: CompanyOverview;
  result: DcfResult;
}

export function ValuationHeader({ overview, result }: ValuationHeaderProps) {
  const upsideValue = result.upsideDownside;
  const upsidePercent = upsideValue === null ? null : upsideValue * 100;
  const isPositive = upsidePercent !== null && upsidePercent >= 0;

  return (
    <header className="border-ink/10 border-b pb-6">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-ink font-serif text-2xl font-semibold">{overview.name} — DCF Valuation</h1>
        <span className="text-ink/50 font-mono text-sm">{overview.ticker}</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="border-ink/10 bg-paper rounded-xl border p-4">
          <div className="text-ink/40 text-xs uppercase tracking-wide">Current Price</div>
          <div className="text-ink mt-1 font-mono text-xl font-semibold tabular-nums">
            {formatPrice(overview.price)}
          </div>
        </div>

        <div className="border-ink/10 bg-paper rounded-xl border p-4">
          <div className="text-ink/40 text-xs uppercase tracking-wide">DCF Implied Price</div>
          <div className="text-ink mt-1 font-mono text-xl font-semibold tabular-nums">
            {formatPrice(result.impliedSharePrice)}
          </div>
        </div>

        <div
          className={`rounded-xl border p-4 ${
            upsidePercent === null
              ? 'border-ink/10 bg-paper'
              : isPositive
                ? 'border-emerald-200 bg-emerald-50'
                : 'border-red-200 bg-red-50'
          }`}
        >
          <div className="text-ink/40 text-xs uppercase tracking-wide">Model Upside / Downside</div>
          <div
            className={`mt-1 font-mono text-xl font-semibold tabular-nums ${
              upsidePercent === null ? 'text-ink' : isPositive ? 'text-emerald-700' : 'text-red-700'
            }`}
          >
            {formatPercent(upsidePercent)}
          </div>
        </div>

        <div className="border-ink/10 bg-paper rounded-xl border p-4">
          <div className="text-ink/40 text-xs uppercase tracking-wide">Model Status</div>
          <div className={`mt-1 text-sm font-medium ${result.isValid ? 'text-emerald-700' : 'text-red-700'}`}>
            {result.isValid ? 'Valid' : `${result.issues.filter((i) => i.severity === 'ERROR').length} blocking issue(s)`}
          </div>
        </div>
      </div>

      <p className="text-ink/40 mt-3 text-xs">
        A DCF implied price is a model output built from the assumptions below — it is not a
        guaranteed return, a price target, or investment advice.
      </p>
    </header>
  );
}
