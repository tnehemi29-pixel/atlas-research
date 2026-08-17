import { ApiError } from './companies';

export interface PortfolioHoldingRow {
  id: string;
  ticker: string;
  name: string;
  sector: string | null;
  industry: string | null;
  shares: number;
  averageCost: number;
  purchaseDate: string | null;
  notes: string | null;
  currentPrice: number | null;
  marketValue: number | null;
  costBasis: number;
  unrealizedGainLoss: number | null;
  unrealizedReturn: number | null;
  weight: number | null;
}

export interface PortfolioSummary {
  totalMarketValue: number | null;
  totalCostBasis: number;
  totalUnrealizedGainLoss: number | null;
  totalUnrealizedReturn: number | null;
  hasMissingPrices: boolean;
}

export interface PortfolioDetailResponse {
  portfolio: { id: string; userId: string; name: string; createdAt: string; updatedAt: string };
  summary: PortfolioSummary;
  holdings: PortfolioHoldingRow[];
}

export interface AllocationSliceResponse {
  label: string;
  marketValue: number;
  weight: number;
  isConcentrated: boolean;
}

export interface WeightedFundamentalsResponse {
  revenueGrowth: number | null;
  operatingMargin: number | null;
  fcfMargin: number | null;
  evToEbitda: number | null;
  peRatio: number | null;
}

export interface ValuationMonitorRowResponse {
  ticker: string;
  currentPrice: number | null;
  dcfImpliedPrice: number | null;
  dcfUpsideDownside: number | null;
  compsImpliedPrice: number | null;
  compsUpsideDownside: number | null;
  evToEbitda: number | null;
  historicalMultiple: null;
}

export interface PortfolioAnalyticsResponse {
  sectorAllocation: AllocationSliceResponse[];
  industryAllocation: AllocationSliceResponse[];
  weightedFundamentals: WeightedFundamentalsResponse;
  valuationMonitor: ValuationMonitorRowResponse[];
}

export interface AddHoldingInput {
  ticker: string;
  shares: number;
  averageCost: number;
  purchaseDate?: string | null;
  notes?: string | null;
}

export interface EditHoldingInput {
  shares?: number;
  averageCost?: number;
  purchaseDate?: string | null;
  notes?: string | null;
}

async function parseOrThrow<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(body?.error ?? fallbackMessage, response.status);
  }
  return (await response.json()) as T;
}

function json(method: string, body?: unknown): RequestInit {
  return { method, headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined, body: body !== undefined ? JSON.stringify(body) : undefined };
}

export async function fetchPortfolio(signal?: AbortSignal): Promise<PortfolioDetailResponse> {
  const response = await fetch('/api/portfolio', { signal });
  return parseOrThrow<PortfolioDetailResponse>(response, 'Failed to load portfolio.');
}

export async function fetchPortfolioAnalytics(signal?: AbortSignal): Promise<PortfolioAnalyticsResponse> {
  const response = await fetch('/api/portfolio/analytics', { signal });
  return parseOrThrow<PortfolioAnalyticsResponse>(response, 'Failed to load portfolio analytics.');
}

export async function addHolding(input: AddHoldingInput): Promise<void> {
  const response = await fetch('/api/portfolio/holdings', json('POST', input));
  await parseOrThrow<unknown>(response, 'Failed to add holding.');
}

export async function editHolding(id: string, input: EditHoldingInput): Promise<void> {
  const response = await fetch(`/api/portfolio/holdings/${encodeURIComponent(id)}`, json('PATCH', input));
  await parseOrThrow<unknown>(response, 'Failed to update holding.');
}

export async function removeHolding(id: string): Promise<void> {
  const response = await fetch(`/api/portfolio/holdings/${encodeURIComponent(id)}`, json('DELETE'));
  await parseOrThrow<{ ok: true }>(response, 'Failed to remove holding.');
}
