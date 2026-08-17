'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { CompanySearchResult } from '@erp/types';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { ApiError, fetchCompanySearch } from '@/lib/api/companies';
import { SearchResultItem } from './SearchResultItem';

const DEBOUNCE_MS = 250;

interface CompanySearchProps {
  placeholder?: string;
  autoFocus?: boolean;
  /** When provided, selecting a result calls this instead of navigating to
   * the company page — reused by watchlist/portfolio "add company" flows. */
  onSelect?: (result: CompanySearchResult) => void;
}

export function CompanySearch({
  placeholder = 'Search by company name or ticker…',
  autoFocus = false,
  onSelect,
}: CompanySearchProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);

  const [inputValue, setInputValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

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

  const isInitialLoad = isFetching && results.length === 0;
  const showNoResults = isQueryable && !isFetching && !isError && results.length === 0;
  const errorMessage = useMemo(() => {
    if (!isError) return null;
    return error instanceof ApiError ? error.message : 'Something went wrong. Please try again.';
  }, [isError, error]);

  // Reset keyboard highlight whenever the result set changes underneath it.
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [results]);

  // Close on outside click.
  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  function selectCompany(result: CompanySearchResult) {
    setIsOpen(false);
    setHighlightedIndex(-1);
    setInputValue(result.name);
    if (onSelect) {
      onSelect(result);
      setInputValue('');
      return;
    }
    router.push(`/company/${result.ticker}`);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      setIsOpen(true);
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setHighlightedIndex((index) => Math.min(index + 1, results.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setHighlightedIndex((index) => Math.max(index - 1, 0));
        break;
      case 'Enter':
        if (highlightedIndex >= 0 && results[highlightedIndex]) {
          event.preventDefault();
          selectCompany(results[highlightedIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setHighlightedIndex(-1);
        break;
    }
  }

  const showDropdown = isOpen && isQueryable;
  const activeDescendant =
    highlightedIndex >= 0 && results[highlightedIndex]
      ? `company-option-${results[highlightedIndex].ticker}`
      : undefined;

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <input
          type="text"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls="company-search-listbox"
          aria-autocomplete="list"
          aria-activedescendant={activeDescendant}
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck={false}
          value={inputValue}
          placeholder={placeholder}
          onChange={(event) => {
            setInputValue(event.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          className="border-ink/15 bg-paper text-ink placeholder:text-ink/40 focus:border-accent focus:ring-accent/20 w-full rounded-lg border px-4 py-3 text-base shadow-sm outline-none focus:ring-2"
        />
        {isFetching && (
          <span
            aria-hidden
            className="border-ink/20 border-t-accent absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2"
          />
        )}
      </div>

      {showDropdown && (
        <ul
          id="company-search-listbox"
          role="listbox"
          className="border-ink/10 bg-paper absolute z-20 mt-2 max-h-80 w-full overflow-y-auto rounded-lg border py-1 shadow-lg"
        >
          {isInitialLoad && (
            <li className="text-ink/50 px-4 py-3 text-sm" aria-hidden>
              Searching…
            </li>
          )}

          {errorMessage && (
            <li className="px-4 py-3 text-sm text-red-600" role="alert">
              {errorMessage}
            </li>
          )}

          {showNoResults && (
            <li className="text-ink/50 px-4 py-3 text-sm">
              No companies found for &ldquo;{debouncedQuery}&rdquo;.
            </li>
          )}

          {!isInitialLoad &&
            !errorMessage &&
            results.map((result, index) => (
              <SearchResultItem
                key={result.ticker}
                result={result}
                isHighlighted={index === highlightedIndex}
                onSelect={selectCompany}
                onHover={() => setHighlightedIndex(index)}
              />
            ))}
        </ul>
      )}
    </div>
  );
}
