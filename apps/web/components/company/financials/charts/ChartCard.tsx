interface ChartCardProps {
  title: string;
  children: React.ReactNode;
}

export function ChartCard({ title, children }: ChartCardProps) {
  return (
    <div className="border-ink/10 bg-paper rounded-xl border p-4">
      <h4 className="text-ink/50 text-xs font-medium uppercase tracking-wide">{title}</h4>
      <div className="mt-3 h-56">{children}</div>
    </div>
  );
}

interface TooltipPayloadEntry {
  dataKey?: string | number;
  value?: number | string | Array<number | string>;
  color?: string;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string | number;
  formatters: Record<string, (value: number | null) => string>;
  labels: Record<string, string>;
}

/** Shared tooltip renderer for every chart in FinancialCharts — styled to
 * match the app rather than Recharts' default box, and routed through the
 * same formatters (formatCompactCurrency, formatRatioAsPercent, etc.) the
 * tables use, so a number reads identically whether it's in a cell or a
 * chart. */
export function ChartTooltip({ active, payload, label, formatters, labels }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="border-ink/10 bg-paper min-w-[9rem] rounded-lg border px-3 py-2 text-xs shadow-lg">
      <div className="text-ink font-medium">{label}</div>
      {payload.map((entry) => {
        const key = String(entry.dataKey ?? '');
        const raw = typeof entry.value === 'number' ? entry.value : null;
        const format = formatters[key];
        return (
          <div key={key} className="mt-1 flex items-center justify-between gap-4">
            <span className="text-ink/60 flex items-center gap-1.5">
              {entry.color && (
                <span
                  aria-hidden
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: entry.color }}
                />
              )}
              {labels[key] ?? key}
            </span>
            <span className="text-ink font-mono tabular-nums">
              {format ? format(raw) : String(entry.value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
