import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { getResearchFeed } from '@/lib/services/researchEventFeedService';
import { ResearchFeedWorkspace } from '@/components/research-feed/ResearchFeedWorkspace';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Research Feed · Atlas Research' };

export default async function ResearchFeedPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const feed = await getResearchFeed(user.id);
  return <ResearchFeedWorkspace initial={feed} />;
}
