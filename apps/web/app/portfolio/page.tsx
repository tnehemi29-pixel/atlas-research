import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { getPortfolioAnalytics, getPortfolioDetail } from '@/lib/services/portfolioService';
import { PortfolioWorkspace } from '@/components/portfolio/PortfolioWorkspace';
import type { PortfolioAnalyticsResponse, PortfolioDetailResponse } from '@/lib/api/portfolio';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Portfolio · Atlas Research' };

export default async function PortfolioPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const [detail, analytics] = await Promise.all([getPortfolioDetail(user.id), getPortfolioAnalytics(user.id)]);

  const detailResponse: PortfolioDetailResponse = {
    portfolio: {
      id: detail.portfolio.id,
      userId: detail.portfolio.userId,
      name: detail.portfolio.name,
      createdAt: detail.portfolio.createdAt.toISOString(),
      updatedAt: detail.portfolio.updatedAt.toISOString(),
    },
    summary: detail.summary,
    holdings: detail.holdings,
  };

  return <PortfolioWorkspace initialDetail={detailResponse} initialAnalytics={analytics as PortfolioAnalyticsResponse} />;
}
