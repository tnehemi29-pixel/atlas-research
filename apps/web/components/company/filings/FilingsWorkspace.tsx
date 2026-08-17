'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { FilingListItem } from '@/lib/api/filings';
import { CompanyNav } from '@/components/company/CompanyNav';
import { FilingFilters, type PeriodFilter } from './FilingFilters';
import { FilingCard } from './FilingCard';
import { ResearchTimeline } from './ResearchTimeline';

const ANNUAL_TYPES = new Set(['TEN_K', 'TWENTY_F']);
const QUARTERLY_TYPES = new Set(['TEN_Q']);

interface FilingsWorkspaceProps {
  ticker: string;
  initialFilings: FilingListItem[];
}

export function FilingsWorkspace({ ticker, initialFilings }: FilingsWorkspaceProps) {
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [materialOnly, setMaterialOnly] = useState(false);

  function toggleType(type: string) {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }

  const filtered = useMemo(() => {
    return initialFilings.filter((filing) => {
      if (selectedTypes.size > 0 && !selectedTypes.has(filing.filingType)) return false;
      if (periodFilter === 'annual' && !ANNUAL_TYPES.has(filing.filingType)) return false;
      if (periodFilter === 'quarterly' && !QUARTERLY_TYPES.has(filing.filingType)) return false;
      if (from && filing.filingDate < from) return false;
      if (to && filing.filingDate > to) return false;
      if (materialOnly && filing.importance === 'Low') return false;
      return true;
    });
  }, [initialFilings, selectedTypes, periodFilter, from, to, materialOnly]);

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <div className="mb-2 flex items-center justify-between">
        <CompanyNav ticker={ticker} active="filings" />
        <Link href={`/company/${ticker}/filings/methodology`} className="text-accent text-sm hover:underline">
          Methodology →
        </Link>
      </div>

      <header className="border-ink/10 border-b pb-6">
        <h1 className="text-ink font-serif text-2xl font-semibold">SEC Filing Intelligence</h1>
        <p className="text-ink/50 mt-2 max-w-2xl text-sm">
          A chronological feed of {ticker}&apos;s SEC filings, retrieved directly from SEC EDGAR. Select a filing to
          extract its key sections and generate a structured, source-cited analysis.
        </p>
      </header>

      <section className="mt-6">
        <FilingFilters
          selectedTypes={selectedTypes}
          onToggleType={toggleType}
          periodFilter={periodFilter}
          onPeriodFilterChange={setPeriodFilter}
          from={from}
          to={to}
          onFromChange={setFrom}
          onToChange={setTo}
          materialOnly={materialOnly}
          onMaterialOnlyChange={setMaterialOnly}
        />

        <div className="mt-4 flex flex-col gap-3">
          {filtered.length === 0 ? (
            <div className="border-ink/10 bg-paper text-ink/50 rounded-xl border p-6 text-center text-sm">
              No filings match the current filters.
            </div>
          ) : (
            filtered.map((filing) => <FilingCard key={filing.id} ticker={ticker} filing={filing} />)
          )}
        </div>
      </section>

      <ResearchTimeline ticker={ticker} filings={filtered} />
    </main>
  );
}
