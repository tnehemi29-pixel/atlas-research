'use client';

import type { ChangeEvent } from 'react';

/** Shared form primitives for every assumption panel (Revenue, Margin, Tax,
 * D&A/CapEx/NWC drivers, WACC, Terminal Value) — every DCF assumption in the
 * app is edited through one of these three, so a number always looks and
 * behaves the same way regardless of which panel it's in. */

interface FieldShellProps {
  label: string;
  disabled?: boolean;
  children: React.ReactNode;
}

function FieldShell({ label, disabled, children }: FieldShellProps) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-ink/50 uppercase tracking-wide">{label}</span>
      <div
        className={`border-ink/15 focus-within:border-accent flex items-center rounded-lg border bg-white px-2 py-1.5 ${disabled ? 'opacity-50' : ''}`}
      >
        {children}
      </div>
    </label>
  );
}

interface PercentFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  disabled?: boolean;
}

/** Stores/passes the value as a ratio (0.05) but displays/edits it as a
 * percent (5.00) — the same convention as formatRatioAsPercent everywhere
 * else in the app. */
export function PercentField({ label, value, onChange, step = 0.1, disabled }: PercentFieldProps) {
  return (
    <FieldShell label={label} disabled={disabled}>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        disabled={disabled}
        value={Number.isFinite(value) ? Number((value * 100).toFixed(4)) : ''}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          const parsed = parseFloat(event.target.value);
          onChange(Number.isNaN(parsed) ? 0 : parsed / 100);
        }}
        className="text-ink w-full min-w-0 bg-transparent text-right font-mono text-sm tabular-nums outline-none disabled:cursor-not-allowed"
      />
      <span className="text-ink/40 ml-1 text-xs">%</span>
    </FieldShell>
  );
}

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  prefix?: string;
  suffix?: string;
  disabled?: boolean;
}

export function NumberField({ label, value, onChange, step = 0.01, prefix, suffix, disabled }: NumberFieldProps) {
  return (
    <FieldShell label={label} disabled={disabled}>
      {prefix && <span className="text-ink/40 mr-1 text-xs">{prefix}</span>}
      <input
        type="number"
        inputMode="decimal"
        step={step}
        disabled={disabled}
        value={Number.isFinite(value) ? value : ''}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          const parsed = parseFloat(event.target.value);
          onChange(Number.isNaN(parsed) ? 0 : parsed);
        }}
        className="text-ink w-full min-w-0 bg-transparent text-right font-mono text-sm tabular-nums outline-none disabled:cursor-not-allowed"
      />
      {suffix && <span className="text-ink/40 ml-1 text-xs">{suffix}</span>}
    </FieldShell>
  );
}

interface SelectFieldProps<T extends string> {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
}

export function SelectField<T extends string>({ label, value, options, onChange }: SelectFieldProps<T>) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-ink/50 uppercase tracking-wide">{label}</span>
      <select
        value={value}
        onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange(event.target.value as T)}
        className="border-ink/15 text-ink focus:border-accent rounded-lg border bg-white px-2 py-[7px] text-sm outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
