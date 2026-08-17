/**
 * The expand/collapse + print-friendly wrapper every report section uses —
 * a native <details> element so it needs no client-side state, prints fully
 * expanded regardless of on-screen collapsed state (see globals.css's
 * `@media print` rule forcing `[open]`), and stays keyboard/screen-reader
 * accessible for free.
 */
export function ReportSection({
  id,
  title,
  defaultOpen = true,
  children,
}: {
  id?: string;
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details id={id} open={defaultOpen} className="border-ink/10 bg-paper break-inside-avoid rounded-xl border p-5 print:border-0 print:p-0">
      <summary className="text-ink font-serif text-lg font-medium cursor-pointer select-none [&::-webkit-details-marker]:hidden print:cursor-default">
        {title}
      </summary>
      <div className="mt-3 space-y-3">{children}</div>
    </details>
  );
}
