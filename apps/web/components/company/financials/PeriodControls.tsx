'use client';

import type { PeriodType } from '@erp/types';
import type { RangeSelection } from '@/lib/analytics/periodMetrics';

const RANGE_OPTIONS: Array<{ value: RangeSelection; label: string }> = [
  { value: 3, label: '3Y' },
  { value: 5, label: '5Y' },
  { value: 10, label: '10Y' },
  { value: 'max', label: 'Max' },
];

interface PeriodControlsProps {
  periodType: PeriodType;
  onPeriodTypeChange: (value: PeriodType) => void;
  range: RangeSelection;
  onRangeChange: (value: RangeSelection) => void;
}

function SegmentedButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
        active ? 'bg-accent text-paper' : 'text-ink/60 hover:bg-ink/5'
      }`}
    >
      {children}
    </button>
  );
}

export function PeriodControls({
  periodType,
  onPeriodTypeChange,
  range,
  onRangeChange,
}: PeriodControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="border-ink/10 bg-paper flex items-center gap-0.5 rounded-lg border p-0.5">
        <SegmentedButton
          active={periodType === 'annual'}
          onClick={() => onPeriodTypeChange('annual')}
        >
          Annual
        </SegmentedButton>
        <SegmentedButton
          active={periodType === 'quarterly'}
          onClick={() => onPeriodTypeChange('quarterly')}
        >
          Quarterly
        </SegmentedButton>
      </div>

      <div className="border-ink/10 bg-paper flex items-center gap-0.5 rounded-lg border p-0.5">
        {RANGE_OPTIONS.map((option) => (
          <SegmentedButton
            key={option.value}
            active={range === option.value}
            onClick={() => onRangeChange(option.value)}
          >
            {option.label}
          </SegmentedButton>
        ))}
      </div>
    </div>
  );
}
