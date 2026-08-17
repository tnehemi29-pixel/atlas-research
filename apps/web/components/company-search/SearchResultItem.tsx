import type { CompanySearchResult } from '@erp/types';

interface SearchResultItemProps {
  result: CompanySearchResult;
  isHighlighted: boolean;
  onSelect: (result: CompanySearchResult) => void;
  onHover: () => void;
}

export function SearchResultItem({
  result,
  isHighlighted,
  onSelect,
  onHover,
}: SearchResultItemProps) {
  return (
    <li
      id={`company-option-${result.ticker}`}
      role="option"
      aria-selected={isHighlighted}
      onMouseDown={(event) => {
        // mousedown (not click) so this fires before the input's blur handler
        event.preventDefault();
        onSelect(result);
      }}
      onMouseEnter={onHover}
      className={`flex min-h-[44px] cursor-pointer items-center justify-between gap-3 px-4 py-2.5 ${
        isHighlighted ? 'bg-accent-soft' : 'bg-transparent'
      }`}
    >
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-ink truncate font-medium">{result.name}</span>
          <span className="text-ink/50 shrink-0 font-mono text-xs">{result.ticker}</span>
        </div>
        {result.industry && <div className="text-ink/50 truncate text-xs">{result.industry}</div>}
      </div>
      {result.exchange && (
        <span className="border-ink/10 text-ink/50 shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
          {result.exchange}
        </span>
      )}
    </li>
  );
}
