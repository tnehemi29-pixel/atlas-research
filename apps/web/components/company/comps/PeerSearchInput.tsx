'use client';

import { useEffect, useRef, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { CompanySearchResult } from '@erp/types';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { ApiError, fetchCompanySearch } from '@/lib/api/companies';

const DEBOUNCE_MS = 250;

interface PeerSearchInputProps {
  /** Tickers already in the selected set — shown as disabled/skip in results. */
  excludeTickers: Set<string>;
  onAdd: (ticker: string) => void;
  isAdding: boolean;
}

/** A search-and-add control for manually building the comp set — reuses the
 * same company-search API as the landing page's CompanySearch, but adds the
 * selected company to the comps workspace instead of navigating to it. */
export function PeerSearchInput({ excludeTickers, onAdd, isAdding }: PeerSearchInputProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const debouncedQuery = useDebouncedValue(inputValue.trim(), DEBOUNCE_MS);
  const isQueryable = debouncedQuery.length > 0;

  const {
    data: results = [],
    isFetching,
    isError,
    error,
  } = useQuery({
    queryKey: ['company-search', debouncedQuery],
    queryFn: ({ signal }) => fetchCompanySearch(debouncedQuery, signal),
    enabled: isQueryable,
    placeholderData: keepPreviousData,
  });

  const errorMessage = isError
    ? error instanceof ApiError
      ? error.message
      : 'Search is temporarily unavailable.'
    : null;

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  function handleSelect(result: CompanySearchResult) {
    onAdd(result.ticker);
    setInputValue('');
    setIsOpen(false);
  }

  const showDropdown = isOpen && isQueryable;

  return (
    <div ref={containerRef} className="relative w-full max-w-sm">
      <input
        type="text"
        autoComplete="off"
        spellCheck={false}
        value={inputValue}
        placeholder="Search for a company to add as a peer…"
        disabled={isAdding}
        onChange={(event) => {
          setInputValue(event.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        className="border-ink/15 bg-paper text-ink placeholder:text-ink/40 focus:border-accent w-full rounded-lg border px-3 py-2 text-sm outline-none disabled:opacity-50"
      />

      {showDropdown && (
        <ul className="border-ink/10 bg-paper absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border py-1 shadow-lg">
          {isFetching && results.length === 0 && (
            <li className="text-ink/50 px-3 py-2 text-xs">Searching…</li>
          )}
          {errorMessage && (
            <li className="px-3 py-2 text-xs text-red-700" role="alert">
              {errorMessage}
            </li>
          )}
          {!isFetching && !errorMessage && isQueryable && results.length === 0 && (
            <li className="text-ink/50 px-3 py-2 text-xs">No companies found for &ldquo;{debouncedQuery}&rdquo;.</li>
          )}
          {!errorMessage && results.map((result) => {
            const alreadySelected = excludeTickers.has(result.ticker);
            return (
              <li key={result.ticker}>
                <button
                  type="button"
                  disabled={alreadySelected}
                  onClick={() => handleSelect(result)}
                  className="hover:bg-accent-soft flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span className="min-w-0 truncate">
                    <span className="text-ink font-medium">{result.name}</span>{' '}
                    <span className="text-ink/40 font-mono text-xs">{result.ticker}</span>
                  </span>
                  {alreadySelected && <span className="text-ink/40 shrink-0 text-xs">Added</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
