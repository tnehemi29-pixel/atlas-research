import Image from 'next/image';
import type { CompanyOverview } from '@erp/types';

function initialsFor(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('');
}

export function CompanyHeader({ overview }: { overview: CompanyOverview }) {
  return (
    <header className="border-ink/10 flex flex-wrap items-center gap-4 border-b pb-6">
      <div className="border-ink/10 bg-paper flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border">
        {overview.logoUrl ? (
          <Image
            src={overview.logoUrl}
            alt={`${overview.name} logo`}
            width={56}
            height={56}
            className="h-full w-full object-contain p-1.5"
          />
        ) : (
          <span className="text-ink/40 font-serif text-lg">
            {initialsFor(overview.name) || '—'}
          </span>
        )}
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-ink font-serif text-2xl font-semibold">{overview.name}</h1>
          <span className="text-ink/50 font-mono text-sm">{overview.ticker}</span>
        </div>
        <div className="text-ink/50 mt-1 flex flex-wrap gap-2 text-xs">
          {overview.exchange && (
            <span className="border-ink/10 rounded border px-1.5 py-0.5 uppercase tracking-wide">
              {overview.exchange}
            </span>
          )}
          {overview.stale && (
            <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-amber-700">
              Cached data
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
