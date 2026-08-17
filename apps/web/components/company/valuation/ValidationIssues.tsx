import type { ValidationIssue } from '@/lib/valuation/types';

export function ValidationIssues({ issues }: { issues: ValidationIssue[] }) {
  if (issues.length === 0) return null;

  const errors = issues.filter((issue) => issue.severity === 'ERROR');
  const warnings = issues.filter((issue) => issue.severity === 'WARNING');

  return (
    <div className="mt-4 space-y-2">
      {errors.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
          <div className="font-semibold">The model cannot resolve — fix these before trusting any output:</div>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            {errors.map((issue) => (
              <li key={`${issue.field}-${issue.message}`}>{issue.message}</li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <div className="font-semibold">Worth checking:</div>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            {warnings.map((issue) => (
              <li key={`${issue.field}-${issue.message}`}>{issue.message}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
