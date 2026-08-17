import type { CompanyOverview } from '@erp/types';

const STAT_FIELDS: Array<{ label: string; key: 'sector' | 'industry' | 'country' }> = [
  { label: 'Sector', key: 'sector' },
  { label: 'Industry', key: 'industry' },
  { label: 'Country', key: 'country' },
];

export function KeyStats({ overview }: { overview: CompanyOverview }) {
  return (
    <section className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
      {STAT_FIELDS.map(({ label, key }) => (
        <div key={key} className="border-ink/10 bg-paper rounded-xl border p-4">
          <div className="text-ink/40 text-xs uppercase tracking-wide">{label}</div>
          <div className="text-ink mt-1 text-sm font-medium">{overview[key] ?? '—'}</div>
        </div>
      ))}
    </section>
  );
}
