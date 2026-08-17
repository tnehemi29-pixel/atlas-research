export interface CompanySearchResult {
  ticker: string;
  name: string;
  exchange: string | null;
  industry: string | null;
}

export interface CompanyOverview {
  ticker: string;
  name: string;
  exchange: string | null;
  sector: string | null;
  industry: string | null;
  country: string | null;
  logoUrl: string | null;
  price: number | null;
  changePercent: number | null;
  marketCap: number | null;
  yearHigh: number | null;
  yearLow: number | null;
  /** Levered beta vs. the broader market — used as a WACC input (Milestone 5). */
  beta: number | null;
  quoteUpdatedAt: string | null;
  /** true when live data couldn't be refreshed and this is a cached snapshot */
  stale: boolean;
}
