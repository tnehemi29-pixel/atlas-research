'use client';

import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { searchEarningsCall } from '@/lib/api/earnings';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';

const DEBOUNCE_MS = 300;

interface EarningsSearchBoxProps {
  earningsCallId: string;
  onQueryChange: (query: string) => void;
}

export function EarningsSearchBox({ earningsCallId, onQueryChange }: EarningsSearchBoxProps) {
  const [input, setInput] = useState('');
  const debounced = useDebouncedValue(input.trim(), DEBOUNCE_MS);
  const isQueryable = debounced.length >= 2;

  const { data: results = [], isFetching } = useQuery({
    queryKey: ['earnings-search', earningsCallId, debounced],
    queryFn: ({ signal }) => searchEarningsCall(earningsCallId, debounced, signal),
    enabled: isQueryable,
    placeholderData: keepPreviousData,
  });

  function handleChange(value: string) {
    setInput(value);
    onQueryChange(value.trim());
  }

  function jumpTo(anchor: string) {
    const el = document.getElementById(anchor);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <section className="mt-8">
      <h2 className="text-ink font-serif text-lg font-semibold">Search This Transcript</h2>
      <input
        type="text"
        value={input}
        onChange={(event) => handleChange(event.target.value)}
        placeholder="Search for a term within this transcript…"
        className="border-ink/15 bg-paper text-ink placeholder:text-ink/40 focus:border-accent mt-2 w-full max-w-md rounded-lg border px-3 py-2 text-sm outline-none"
      />

      {isQueryable && (
        <div className="mt-3">
          {isFetching && results.length === 0 && <p className="text-ink/40 text-xs">Searching…</p>}
          {!isFetching && results.length === 0 && <p className="text-ink/40 text-xs">No matches found.</p>}
          <ul className="mt-2 space-y-2">
            {results.map((result, index) => (
              <li key={index}>
                <button
                  type="button"
                  onClick={() => jumpTo(result.anchor)}
                  className="border-ink/10 bg-paper hover:bg-accent-soft/40 w-full rounded-lg border p-2.5 text-left"
                >
                  <div className="text-ink/40 text-[10px] font-medium uppercase tracking-wide">
                    {result.speakerName ?? 'Unknown speaker'} · {result.section}
                  </div>
                  <p className="text-ink mt-1 text-xs">
                    {result.before}
                    <mark className="bg-amber-200">{result.match}</mark>
                    {result.after}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
