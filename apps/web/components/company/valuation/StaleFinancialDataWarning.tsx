import { formatUpdatedAt } from '@/lib/utils/format';

interface StaleFinancialDataWarningProps {
  stale: boolean;
  dataAsOf: string | null;
}

/**
 * Pulled out as a plain function for the same reason WaccPanel.tsx's
 * resolveCostOfDebtStatusView is — this codebase has no React Testing
 * Library, so the actual decision/content logic is kept testable as a pure
 * function of its inputs, with the component itself reduced to thin JSX
 * glue around it.
 */
export function buildStaleWarningMessage(dataAsOf: string | null): string {
  return (
    'The latest financial-data refresh did not finish successfully — this valuation is built from the last ' +
    `successfully saved data (as of ${formatUpdatedAt(dataAsOf)}). For a company synced for the first time, that ` +
    'can mean some historical periods are still missing. Review the historical data below before relying on this ' +
    'valuation.'
  );
}

/**
 * Surfaces CompanyFinancialsResponse.stale — set when the latest refresh
 * attempt failed and what's returned is the last successfully-persisted
 * data (see financials.ts's own doc comment). For an established company
 * this is usually benign (a transient SEC EDGAR hiccup on otherwise-complete
 * history); for a company synced for the first time, financialDataService's
 * batched persistence means it can also mean the ingestion only partially
 * completed before failing — some historical periods may simply not exist
 * yet. Either way, the DCF's own math and validation are untouched; this is
 * purely presentational, matching ValidationIssues' WARNING-severity
 * styling — an analyst should look at the data before relying on it, not be
 * told the model itself is broken.
 */
export function StaleFinancialDataWarning({ stale, dataAsOf }: StaleFinancialDataWarningProps) {
  if (!stale) return null;

  return (
    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" role="alert">
      <div className="font-semibold">Worth checking:</div>
      <p className="mt-1">{buildStaleWarningMessage(dataAsOf)}</p>
    </div>
  );
}
