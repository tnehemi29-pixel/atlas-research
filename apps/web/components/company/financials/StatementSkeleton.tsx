export function StatementSkeleton() {
  return (
    <div
      className="border-ink/10 overflow-hidden rounded-xl border"
      aria-busy
      aria-label="Loading financial data"
    >
      <div className="border-ink/10 bg-ink/[0.03] flex gap-4 border-b px-4 py-3">
        <div className="bg-ink/10 h-3 w-32 animate-pulse rounded" />
        <div className="ml-auto flex gap-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-ink/10 h-3 w-12 animate-pulse rounded" />
          ))}
        </div>
      </div>
      {Array.from({ length: 8 }).map((_, row) => (
        <div key={row} className="border-ink/5 flex gap-4 border-b px-4 py-3 last:border-0">
          <div
            className="bg-ink/10 h-3 w-36 animate-pulse rounded"
            style={{ animationDelay: `${row * 40}ms` }}
          />
          <div className="ml-auto flex gap-6">
            {Array.from({ length: 5 }).map((_, col) => (
              <div
                key={col}
                className="bg-ink/10 h-3 w-14 animate-pulse rounded"
                style={{ animationDelay: `${(row + col) * 40}ms` }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
