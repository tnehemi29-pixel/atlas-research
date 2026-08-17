'use client';

const TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'TEN_K', label: '10-K' },
  { value: 'TEN_Q', label: '10-Q' },
  { value: 'EIGHT_K', label: '8-K' },
  { value: 'DEF_14A', label: 'DEF 14A' },
  { value: 'TWENTY_F', label: '20-F' },
];

export type PeriodFilter = 'all' | 'annual' | 'quarterly';

interface FilingFiltersProps {
  selectedTypes: Set<string>;
  onToggleType: (type: string) => void;
  periodFilter: PeriodFilter;
  onPeriodFilterChange: (value: PeriodFilter) => void;
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  materialOnly: boolean;
  onMaterialOnlyChange: (value: boolean) => void;
}

export function FilingFilters({
  selectedTypes,
  onToggleType,
  periodFilter,
  onPeriodFilterChange,
  from,
  to,
  onFromChange,
  onToChange,
  materialOnly,
  onMaterialOnlyChange,
}: FilingFiltersProps) {
  return (
    <div className="border-ink/10 bg-paper flex flex-wrap items-center gap-4 rounded-xl border p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-ink/40 mr-1 text-xs font-medium uppercase tracking-wide">Type</span>
        {TYPE_OPTIONS.map((option) => {
          const isActive = selectedTypes.size === 0 || selectedTypes.has(option.value);
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onToggleType(option.value)}
              className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                isActive
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-ink/15 text-ink/50 hover:bg-accent-soft/50'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-ink/40 mr-1 text-xs font-medium uppercase tracking-wide">Period</span>
        {(['all', 'annual', 'quarterly'] as PeriodFilter[]).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onPeriodFilterChange(option)}
            className={`rounded-lg border px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
              periodFilter === option ? 'border-accent bg-accent-soft text-accent' : 'border-ink/15 text-ink/50 hover:bg-accent-soft/50'
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-ink/40 text-xs font-medium uppercase tracking-wide">From</span>
        <input
          type="date"
          value={from}
          onChange={(event) => onFromChange(event.target.value)}
          className="border-ink/15 rounded-lg border px-2 py-1 text-xs"
        />
        <span className="text-ink/40 text-xs font-medium uppercase tracking-wide">To</span>
        <input
          type="date"
          value={to}
          onChange={(event) => onToChange(event.target.value)}
          className="border-ink/15 rounded-lg border px-2 py-1 text-xs"
        />
      </div>

      <label className="text-ink/70 ml-auto flex items-center gap-1.5 text-xs">
        <input type="checkbox" checked={materialOnly} onChange={(event) => onMaterialOnlyChange(event.target.checked)} />
        Material events only
      </label>
    </div>
  );
}
