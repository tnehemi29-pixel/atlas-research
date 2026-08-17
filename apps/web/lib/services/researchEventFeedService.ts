import type { Company, MaterialityLevel, Prisma, ResearchEventCategory, ResearchEventType } from '@prisma/client';
import { db } from '@/lib/db';
import { getFollowedCompanies } from '@/lib/services/followedCompaniesService';
import { runResearchEventDetection } from '@/lib/services/researchEventDetectionService';
import { materialityAtLeast } from '@/lib/researchEvents/materialityConfig';

/**
 * The read side of Milestone 11: a personalized, DB-backed research feed
 * (scoped to the companies a user follows via lib/services/
 * followedCompaniesService.ts) plus per-user read/unread state and a
 * per-company timeline. Events themselves are global (shared across every
 * user who follows the company) — only UserResearchEventState is private,
 * enforced here by always scoping state writes/reads to the calling
 * `userId`.
 *
 * "Automatic" processing (spec section 23) is implemented as TTL-gated lazy
 * detection on view: whenever a user's feed or a company's timeline is
 * read, this file first triggers lib/services/researchEventDetectionService.ts
 * for any company whose `researchEventsSyncedAt` has gone stale, exactly the
 * same "sync on view if stale" pattern financialDataService/secFilingService
 * already use — no real job queue exists anywhere in this codebase.
 */

const REFRESH_TTL_MS = 24 * 60 * 60 * 1000;

async function ensureFreshResearchEvents(companies: Pick<Company, 'id' | 'ticker' | 'researchEventsSyncedAt'>[]): Promise<void> {
  const now = Date.now();
  const stale = companies.filter((c) => !c.researchEventsSyncedAt || now - c.researchEventsSyncedAt.getTime() >= REFRESH_TTL_MS);

  await Promise.all(
    stale.map(async (company) => {
      try {
        await runResearchEventDetection(company.ticker);
      } catch {
        // Detection degrading for one company must never take down the
        // whole feed — the user still sees whatever was already stored.
      } finally {
        await db.company.update({ where: { id: company.id }, data: { researchEventsSyncedAt: new Date() } }).catch(() => undefined);
      }
    }),
  );
}

export interface ResearchFeedFilters {
  /** Minimum materiality tier to include, e.g. 'HIGH' includes HIGH and CRITICAL. */
  minMateriality?: MaterialityLevel;
  category?: ResearchEventCategory;
  unreadOnly?: boolean;
}

export interface ResearchFeedEventSummary {
  id: string;
  ticker: string;
  companyName: string;
  category: ResearchEventCategory;
  type: ResearchEventType;
  title: string;
  description: string;
  materiality: MaterialityLevel;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  eventDate: string;
  detectedAt: string;
  isRead: boolean;
  aiSummary: string | null;
}

export interface ResearchFeedResult {
  items: ResearchFeedEventSummary[];
  unreadCount: number;
}

/** Returns an empty feed (never throws) for a user with no followed
 * companies — mirrors researchFeedService.ts's own graceful-empty pattern. */
export async function getResearchFeed(userId: string, filters: ResearchFeedFilters = {}): Promise<ResearchFeedResult> {
  const followed = await getFollowedCompanies(userId);
  if (followed.length === 0) return { items: [], unreadCount: 0 };

  const companies = await db.company.findMany({ where: { id: { in: followed.map((f) => f.id) } } });
  await ensureFreshResearchEvents(companies);

  const where: Prisma.ResearchEventWhereInput = { companyId: { in: followed.map((f) => f.id) } };
  if (filters.category) where.category = filters.category;

  const [events, states] = await Promise.all([
    db.researchEvent.findMany({ where, orderBy: { eventDate: 'desc' }, include: { company: true } }),
    db.userResearchEventState.findMany({ where: { userId, event: { companyId: { in: followed.map((f) => f.id) } } } }),
  ]);

  const readByEventId = new Map(states.map((s) => [s.eventId, s.isRead]));

  let items: ResearchFeedEventSummary[] = events.map((e) => ({
    id: e.id,
    ticker: e.company.ticker,
    companyName: e.company.name,
    category: e.category,
    type: e.type,
    title: e.title,
    description: e.description,
    materiality: e.materiality,
    confidence: e.confidence,
    eventDate: e.eventDate.toISOString(),
    detectedAt: e.detectedAt.toISOString(),
    isRead: readByEventId.get(e.id) ?? false,
    aiSummary: e.aiSummary,
  }));

  if (filters.minMateriality) items = items.filter((i) => materialityAtLeast(i.materiality, filters.minMateriality!));
  if (filters.unreadOnly) items = items.filter((i) => !i.isRead);

  const unreadCount = events.filter((e) => !(readByEventId.get(e.id) ?? false)).length;

  return { items, unreadCount };
}

export interface ResearchEventSourceView {
  type: string;
  label: string;
  detail: string | null;
  href: string;
}

export interface ResearchEventDetail extends ResearchFeedEventSummary {
  aiStatus: 'SUCCESS' | 'FAILED' | null;
  aiWhyItMatters: string | null;
  aiAffectedResearchAreas: string[] | null;
  aiQuestionsToInvestigate: string[] | null;
  aiConfidence: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  aiError: string | null;
  changes: { metric: string; unit: string; previousValue: number | null; currentValue: number | null; changeAbsolute: number | null; changePercent: number | null }[];
  impacts: { area: string; note: string }[];
  sources: ResearchEventSourceView[];
}

function buildSourceHref(ticker: string, eventType: ResearchEventType, source: { type: string; secFilingId: string | null; earningsCallId: string | null }): string {
  switch (source.type) {
    case 'SEC_FILING':
      return source.secFilingId ? `/company/${ticker}/filings/${source.secFilingId}` : `/company/${ticker}/filings`;
    case 'EARNINGS_CALL':
      return source.earningsCallId ? `/company/${ticker}/earnings/${source.earningsCallId}` : `/company/${ticker}/earnings`;
    case 'RESEARCH_REPORT':
      return `/company/${ticker}/report`;
    case 'VALUATION':
      return eventType === 'COMPS_VALUATION_CHANGE' ? `/company/${ticker}/comps` : `/company/${ticker}/valuation`;
    default:
      return `/company/${ticker}`;
  }
}

/** Event detail is global (any authenticated user can view it, matching
 * every other Milestone 1-10 detail page) — only `isRead` is scoped to the
 * calling `userId`. Returns null if the event doesn't exist. */
export async function getResearchEventDetail(userId: string, eventId: string): Promise<ResearchEventDetail | null> {
  const event = await db.researchEvent.findUnique({
    where: { id: eventId },
    include: { company: true, sources: true, changes: true, impacts: true },
  });
  if (!event) return null;

  const state = await db.userResearchEventState.findUnique({ where: { userId_eventId: { userId, eventId } } });

  return {
    id: event.id,
    ticker: event.company.ticker,
    companyName: event.company.name,
    category: event.category,
    type: event.type,
    title: event.title,
    description: event.description,
    materiality: event.materiality,
    confidence: event.confidence,
    eventDate: event.eventDate.toISOString(),
    detectedAt: event.detectedAt.toISOString(),
    isRead: state?.isRead ?? false,
    aiSummary: event.aiSummary,
    aiStatus: event.aiStatus,
    aiWhyItMatters: event.aiWhyItMatters,
    aiAffectedResearchAreas: (event.aiAffectedResearchAreas as string[] | null) ?? null,
    aiQuestionsToInvestigate: (event.aiQuestionsToInvestigate as string[] | null) ?? null,
    aiConfidence: event.aiConfidence,
    aiError: event.aiError,
    changes: event.changes.map((c) => ({ metric: c.metric, unit: c.unit, previousValue: c.previousValue, currentValue: c.currentValue, changeAbsolute: c.changeAbsolute, changePercent: c.changePercent })),
    impacts: event.impacts.map((i) => ({ area: i.area, note: i.note })),
    sources: event.sources.map((s) => ({ type: s.type, label: s.label, detail: s.detail, href: buildSourceHref(event.company.ticker, event.type, s) })),
  };
}

export async function markResearchEventRead(userId: string, eventId: string): Promise<void> {
  await db.userResearchEventState.upsert({
    where: { userId_eventId: { userId, eventId } },
    create: { userId, eventId, isRead: true, readAt: new Date() },
    update: { isRead: true, readAt: new Date() },
  });
}

export async function markResearchEventUnread(userId: string, eventId: string): Promise<void> {
  await db.userResearchEventState.upsert({
    where: { userId_eventId: { userId, eventId } },
    create: { userId, eventId, isRead: false, readAt: null },
    update: { isRead: false, readAt: null },
  });
}

/** Marks every event across the user's followed companies as read — scoped
 * to `userId` at every step, so it can never touch another user's state. */
export async function markAllResearchEventsRead(userId: string): Promise<number> {
  const followed = await getFollowedCompanies(userId);
  if (followed.length === 0) return 0;

  const events = await db.researchEvent.findMany({ where: { companyId: { in: followed.map((f) => f.id) } }, select: { id: true } });
  const eventIds = events.map((e) => e.id);
  if (eventIds.length === 0) return 0;

  const existing = await db.userResearchEventState.findMany({ where: { userId, eventId: { in: eventIds } }, select: { eventId: true } });
  const existingIds = new Set(existing.map((s) => s.eventId));
  const missingIds = eventIds.filter((id) => !existingIds.has(id));
  const now = new Date();

  await db.$transaction([
    db.userResearchEventState.updateMany({ where: { userId, eventId: { in: eventIds } }, data: { isRead: true, readAt: now } }),
    ...(missingIds.length > 0 ? [db.userResearchEventState.createMany({ data: missingIds.map((eventId) => ({ userId, eventId, isRead: true, readAt: now })) })] : []),
  ]);

  return eventIds.length;
}

export interface CompanyTimelineFilters {
  category?: ResearchEventCategory;
}

export interface CompanyTimelineEvent {
  id: string;
  category: ResearchEventCategory;
  type: ResearchEventType;
  title: string;
  description: string;
  materiality: MaterialityLevel;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  eventDate: string;
}

/** Company-level history — global data, not scoped to any one user's
 * follows (matches every other Milestone 1-10 company sub-page). Also
 * lazily refreshes this one company's events, so viewing a company page
 * directly (without following it) still surfaces up-to-date changes. */
export async function getCompanyTimeline(ticker: string, filters: CompanyTimelineFilters = {}): Promise<CompanyTimelineEvent[]> {
  const company = await db.company.findUnique({ where: { ticker: ticker.trim().toUpperCase() } });
  if (!company) return [];

  await ensureFreshResearchEvents([company]);

  const where: Prisma.ResearchEventWhereInput = { companyId: company.id };
  if (filters.category) where.category = filters.category;

  const events = await db.researchEvent.findMany({ where, orderBy: { eventDate: 'desc' } });
  return events.map((e) => ({ id: e.id, category: e.category, type: e.type, title: e.title, description: e.description, materiality: e.materiality, confidence: e.confidence, eventDate: e.eventDate.toISOString() }));
}

const RECENT_CHANGES_LIMIT = 5;

/** The trimmed feed behind the company page's "Recent Changes" panel —
 * relies on getCompanyTimeline's own staleness refresh rather than
 * triggering a second detection run. */
export async function getCompanyRecentChanges(ticker: string): Promise<CompanyTimelineEvent[]> {
  const timeline = await getCompanyTimeline(ticker);
  return timeline.slice(0, RECENT_CHANGES_LIMIT);
}
