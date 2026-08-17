import type { Metadata } from 'next';
import { getCompanyTimeline } from '@/lib/services/researchEventFeedService';
import { CompanyTimelineWorkspace } from '@/components/company/timeline/CompanyTimelineWorkspace';

export const dynamic = 'force-dynamic';

interface TimelinePageProps {
  params: { ticker: string };
}

export async function generateMetadata({ params }: TimelinePageProps): Promise<Metadata> {
  return { title: `${params.ticker.toUpperCase()} Research Timeline · Atlas Research` };
}

export default async function CompanyTimelinePage({ params }: TimelinePageProps) {
  const ticker = params.ticker.toUpperCase();
  const timeline = await getCompanyTimeline(ticker);
  return <CompanyTimelineWorkspace ticker={ticker} initial={timeline} />;
}
