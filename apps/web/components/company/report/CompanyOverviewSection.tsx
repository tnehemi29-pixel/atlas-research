import type { ResearchCompanyOverview } from '@/lib/research/types';
import { formatCompactCurrency, formatPrice } from '@/lib/utils/format';
import { NarrativeSection } from './NarrativeSection';

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-ink/40 text-[10px] font-medium uppercase tracking-wide">{label}</dt>
      <dd className="text-ink text-sm">{value}</dd>
    </div>
  );
}

export function CompanyOverviewSection({
  overview,
  narrative,
}: {
  overview: ResearchCompanyOverview;
  narrative: { text: string; source_ids: number[] };
}) {
  return (
    <NarrativeSection
      id="company-overview"
      title="Company Overview"
      data={narrative}
      extra={
        <dl className="mb-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
          <Fact label="Ticker" value={overview.ticker} />
          <Fact label="Sector" value={overview.sector ?? 'Unavailable'} />
          <Fact label="Industry" value={overview.industry ?? 'Unavailable'} />
          <Fact label="Exchange" value={overview.exchange ?? 'Unavailable'} />
          <Fact label="Price" value={formatPrice(overview.price)} />
          <Fact label="Market Cap" value={formatCompactCurrency(overview.marketCap)} />
          <Fact label="Enterprise Value" value={formatCompactCurrency(overview.enterpriseValue)} />
          <Fact label="52-Week Range" value={`${formatPrice(overview.yearLow)} – ${formatPrice(overview.yearHigh)}`} />
        </dl>
      }
    />
  );
}
