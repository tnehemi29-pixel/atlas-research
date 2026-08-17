import type { Portfolio } from '@prisma/client';
import { db } from '@/lib/db';
import { ensureCompanyByTicker } from '@/lib/services/companyService';
import { getQuickComps, getQuickDcf, getQuickFundamentals, type QuickFundamentals } from '@/lib/valuation/quickValuation';
import { costBasisOf, marketValue, portfolioWeight, unrealizedGainLoss, unrealizedReturn, weightedAverage } from '@/lib/portfolio/calculations';
import { computeAllocation, type AllocationSlice } from '@/lib/portfolio/allocation';

/**
 * Manual portfolio tracking — explicitly NOT a brokerage integration. One
 * default portfolio per user ("Personal Portfolio," auto-created on first
 * use), matching the milestone spec's own singular example and singular API
 * paths (/api/portfolio, not /api/portfolios/[id]). The data model
 * (Portfolio has a userId + name, unique per user) would support multiple
 * named portfolios later without a migration — this milestone just doesn't
 * expose that in the API/UI yet (see README's Known Limitations).
 *
 * Every calculation (market value, cost basis, gain/loss, return, weight,
 * weighted fundamentals, allocation) is delegated to lib/portfolio/
 * calculations.ts and allocation.ts — pure functions, independently tested.
 * This file only fetches rows, checks ownership, and calls quickValuation
 * for current prices/fundamentals/DCF/comps — it computes nothing itself.
 */

const DEFAULT_PORTFOLIO_NAME = 'Personal Portfolio';

export class HoldingNotFoundError extends Error {
  constructor(message = 'Holding not found.') {
    super(message);
    this.name = 'HoldingNotFoundError';
  }
}

export class DuplicateHoldingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DuplicateHoldingError';
  }
}

export class InvalidHoldingInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidHoldingInputError';
  }
}

export async function getOrCreateDefaultPortfolio(userId: string): Promise<Portfolio> {
  const existing = await db.portfolio.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } });
  if (existing) return existing;
  return db.portfolio.create({ data: { userId, name: DEFAULT_PORTFOLIO_NAME } });
}

async function getOwnedHolding(userId: string, holdingId: string) {
  const holding = await db.portfolioHolding.findUnique({ where: { id: holdingId }, include: { portfolio: true, company: true } });
  if (!holding || holding.portfolio.userId !== userId) throw new HoldingNotFoundError();
  return holding;
}

function validateShares(shares: number): void {
  if (!Number.isFinite(shares) || shares <= 0) throw new InvalidHoldingInputError('Shares must be a positive number.');
}

function validateAverageCost(averageCost: number): void {
  if (!Number.isFinite(averageCost) || averageCost < 0) throw new InvalidHoldingInputError('Average cost cannot be negative.');
}

export interface AddHoldingInput {
  ticker: string;
  shares: number;
  averageCost: number;
  purchaseDate?: Date | null;
  notes?: string | null;
}

export async function addHolding(userId: string, input: AddHoldingInput) {
  validateShares(input.shares);
  validateAverageCost(input.averageCost);

  const portfolio = await getOrCreateDefaultPortfolio(userId);
  const ticker = input.ticker.trim().toUpperCase();
  const company = await ensureCompanyByTicker(ticker);

  const existing = await db.portfolioHolding.findUnique({ where: { portfolioId_companyId: { portfolioId: portfolio.id, companyId: company.id } } });
  if (existing) throw new DuplicateHoldingError(`${ticker} is already a holding — edit it instead of adding it again.`);

  return db.portfolioHolding.create({
    data: {
      portfolioId: portfolio.id,
      companyId: company.id,
      shares: input.shares,
      averageCost: input.averageCost,
      purchaseDate: input.purchaseDate ?? null,
      notes: input.notes ?? null,
    },
  });
}

export interface EditHoldingInput {
  shares?: number;
  averageCost?: number;
  purchaseDate?: Date | null;
  notes?: string | null;
}

export async function editHolding(userId: string, holdingId: string, input: EditHoldingInput) {
  await getOwnedHolding(userId, holdingId);

  if (input.shares !== undefined) validateShares(input.shares);
  if (input.averageCost !== undefined) validateAverageCost(input.averageCost);

  return db.portfolioHolding.update({
    where: { id: holdingId },
    data: {
      ...(input.shares !== undefined ? { shares: input.shares } : {}),
      ...(input.averageCost !== undefined ? { averageCost: input.averageCost } : {}),
      ...(input.purchaseDate !== undefined ? { purchaseDate: input.purchaseDate } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    },
  });
}

export async function removeHolding(userId: string, holdingId: string): Promise<void> {
  await getOwnedHolding(userId, holdingId);
  await db.portfolioHolding.delete({ where: { id: holdingId } });
}

// ---------------------------------------------------------------------------
// Enrichment — shared by getPortfolioDetail and getPortfolioAnalytics
// ---------------------------------------------------------------------------

interface EnrichedHolding {
  id: string;
  ticker: string;
  name: string;
  sector: string | null;
  industry: string | null;
  shares: number;
  averageCost: number;
  purchaseDate: Date | null;
  notes: string | null;
  fundamentals: QuickFundamentals | null;
  currentPrice: number | null;
  marketValue: number | null;
  costBasis: number;
  gainLoss: number | null;
  returnPct: number | null;
}

async function getEnrichedHoldings(userId: string): Promise<{ portfolio: Portfolio; holdings: EnrichedHolding[] }> {
  const portfolio = await getOrCreateDefaultPortfolio(userId);
  const rows = await db.portfolioHolding.findMany({
    where: { portfolioId: portfolio.id },
    include: { company: true },
    orderBy: { createdAt: 'asc' },
  });

  const holdings = await Promise.all(
    rows.map(async (row): Promise<EnrichedHolding> => {
      const fundamentals = await getQuickFundamentals(row.company.ticker).catch(() => null);
      const currentPrice = fundamentals?.price ?? row.company.price;
      const mv = marketValue(row.shares, currentPrice);
      const cb = costBasisOf(row.shares, row.averageCost);
      const gl = unrealizedGainLoss(mv, cb);
      const ret = unrealizedReturn(gl, cb);

      return {
        id: row.id,
        ticker: row.company.ticker,
        name: row.company.name,
        sector: fundamentals?.sector ?? row.company.sector,
        industry: fundamentals?.industry ?? row.company.industry,
        shares: row.shares,
        averageCost: row.averageCost,
        purchaseDate: row.purchaseDate,
        notes: row.notes,
        fundamentals,
        currentPrice,
        marketValue: mv,
        costBasis: cb,
        gainLoss: gl,
        returnPct: ret,
      };
    }),
  );

  return { portfolio, holdings };
}

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

export interface PortfolioDetail {
  portfolio: Portfolio;
  summary: PortfolioSummary;
  holdings: PortfolioHoldingRow[];
}

export async function getPortfolioDetail(userId: string): Promise<PortfolioDetail> {
  const { portfolio, holdings } = await getEnrichedHoldings(userId);

  const anyKnownValue = holdings.some((h) => h.marketValue !== null);
  const totalMarketValue = anyKnownValue ? holdings.reduce((sum, h) => sum + (h.marketValue ?? 0), 0) : null;
  const totalCostBasis = holdings.reduce((sum, h) => sum + h.costBasis, 0);
  const totalGainLoss = unrealizedGainLoss(totalMarketValue, totalCostBasis);
  const totalReturn = unrealizedReturn(totalGainLoss, totalCostBasis);
  const hasMissingPrices = holdings.some((h) => h.marketValue === null);

  const rows: PortfolioHoldingRow[] = holdings.map((h) => ({
    id: h.id,
    ticker: h.ticker,
    name: h.name,
    sector: h.sector,
    industry: h.industry,
    shares: h.shares,
    averageCost: h.averageCost,
    purchaseDate: h.purchaseDate ? h.purchaseDate.toISOString() : null,
    notes: h.notes,
    currentPrice: h.currentPrice,
    marketValue: h.marketValue,
    costBasis: h.costBasis,
    unrealizedGainLoss: h.gainLoss,
    unrealizedReturn: h.returnPct,
    weight: portfolioWeight(h.marketValue, totalMarketValue),
  }));

  return {
    portfolio,
    summary: { totalMarketValue, totalCostBasis, totalUnrealizedGainLoss: totalGainLoss, totalUnrealizedReturn: totalReturn, hasMissingPrices },
    holdings: rows,
  };
}

// ---------------------------------------------------------------------------
// Analytics — allocation, weighted fundamentals, valuation monitor
// ---------------------------------------------------------------------------

export interface WeightedFundamentals {
  revenueGrowth: number | null;
  operatingMargin: number | null;
  fcfMargin: number | null;
  evToEbitda: number | null;
  peRatio: number | null;
}

export interface ValuationMonitorRow {
  ticker: string;
  currentPrice: number | null;
  dcfImpliedPrice: number | null;
  dcfUpsideDownside: number | null;
  compsImpliedPrice: number | null;
  compsUpsideDownside: number | null;
  evToEbitda: number | null;
  /** Always null in this milestone — Atlas has no stored historical-multiple
   * time series to compare against; see README Known Limitations. Kept as
   * an explicit field (never silently omitted) so the UI can label it
   * "Not available" rather than the row simply lacking the column. */
  historicalMultiple: null;
}

export interface PortfolioAnalytics {
  sectorAllocation: AllocationSlice[];
  industryAllocation: AllocationSlice[];
  weightedFundamentals: WeightedFundamentals;
  valuationMonitor: ValuationMonitorRow[];
}

export async function getPortfolioAnalytics(userId: string): Promise<PortfolioAnalytics> {
  const { holdings } = await getEnrichedHoldings(userId);

  const sectorAllocation = computeAllocation(holdings.map((h) => ({ label: h.sector, marketValue: h.marketValue })));
  const industryAllocation = computeAllocation(holdings.map((h) => ({ label: h.industry, marketValue: h.marketValue })));

  const weights = holdings.map((h) => ({ marketValue: h.marketValue, fundamentals: h.fundamentals }));
  const weightedFundamentals: WeightedFundamentals = {
    revenueGrowth: weightedAverage(weights.map((w) => ({ value: w.fundamentals?.revenueGrowth ?? null, weight: w.marketValue }))),
    operatingMargin: weightedAverage(weights.map((w) => ({ value: w.fundamentals?.operatingMargin ?? null, weight: w.marketValue }))),
    fcfMargin: weightedAverage(
      weights.map((w) => {
        const fcf = w.fundamentals?.freeCashFlow ?? null;
        const revenue = w.fundamentals?.revenue ?? null;
        const margin = fcf !== null && revenue !== null && revenue !== 0 ? fcf / revenue : null;
        return { value: margin, weight: w.marketValue };
      }),
    ),
    evToEbitda: weightedAverage(weights.map((w) => ({ value: w.fundamentals?.evToEbitda ?? null, weight: w.marketValue }))),
    peRatio: weightedAverage(weights.map((w) => ({ value: w.fundamentals?.peRatio ?? null, weight: w.marketValue }))),
  };

  const valuationMonitor = await Promise.all(
    holdings.map(async (h): Promise<ValuationMonitorRow> => {
      const [dcf, comps] = await Promise.all([getQuickDcf(h.ticker).catch(() => null), getQuickComps(h.ticker).catch(() => null)]);
      return {
        ticker: h.ticker,
        currentPrice: h.currentPrice,
        dcfImpliedPrice: dcf?.impliedSharePrice ?? null,
        dcfUpsideDownside: dcf?.upsideDownside ?? null,
        compsImpliedPrice: comps?.impliedSharePrice ?? null,
        compsUpsideDownside: comps?.upsideDownside ?? null,
        evToEbitda: h.fundamentals?.evToEbitda ?? null,
        historicalMultiple: null,
      };
    }),
  );

  return { sectorAllocation, industryAllocation, weightedFundamentals, valuationMonitor };
}
