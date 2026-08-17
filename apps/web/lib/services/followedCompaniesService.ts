import { db } from '@/lib/db';

/**
 * The single place that answers "which companies does this user actually
 * follow?" — the union of every company across every one of the user's
 * watchlists, their portfolio, and their saved research reports. Every
 * downstream monitoring feature (earnings calendar, filing monitor,
 * research feed, alert evaluation, Milestone 11's personalized research
 * feed) reuses this rather than re-deriving it, so "followed" always means
 * the same thing everywhere. Scoped by `userId` at the query level (via the
 * `watchlist.userId`/`portfolio.userId`/`savedReport.userId` relation
 * filters) — never returns another user's companies.
 */

export interface FollowedCompanySource {
  type: 'watchlist' | 'portfolio' | 'saved-research';
  label: string;
}

export interface FollowedCompany {
  id: string;
  ticker: string;
  name: string;
  sources: FollowedCompanySource[];
}

export async function getFollowedCompanies(userId: string): Promise<FollowedCompany[]> {
  const [watchlistEntries, holdings, savedReports] = await Promise.all([
    db.watchlistCompany.findMany({ where: { watchlist: { userId } }, include: { company: true, watchlist: true } }),
    db.portfolioHolding.findMany({ where: { portfolio: { userId } }, include: { company: true, portfolio: true } }),
    db.savedReport.findMany({ where: { userId }, include: { researchReport: { include: { company: true } } } }),
  ]);

  const byId = new Map<string, FollowedCompany>();

  for (const entry of watchlistEntries) {
    const existing = byId.get(entry.companyId) ?? { id: entry.companyId, ticker: entry.company.ticker, name: entry.company.name, sources: [] };
    existing.sources.push({ type: 'watchlist', label: entry.watchlist.name });
    byId.set(entry.companyId, existing);
  }

  for (const holding of holdings) {
    const existing = byId.get(holding.companyId) ?? { id: holding.companyId, ticker: holding.company.ticker, name: holding.company.name, sources: [] };
    existing.sources.push({ type: 'portfolio', label: holding.portfolio.name });
    byId.set(holding.companyId, existing);
  }

  for (const saved of savedReports) {
    const company = saved.researchReport.company;
    const existing = byId.get(company.id) ?? { id: company.id, ticker: company.ticker, name: company.name, sources: [] };
    existing.sources.push({ type: 'saved-research', label: `Saved Research Report v${saved.researchReport.version}` });
    byId.set(company.id, existing);
  }

  return [...byId.values()];
}
