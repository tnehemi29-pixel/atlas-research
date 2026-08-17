import Link from 'next/link';

interface CompanyNavProps {
  ticker: string;
  active: 'overview' | 'valuation' | 'comps' | 'filings' | 'earnings' | 'timeline' | 'report';
}

export function CompanyNav({ ticker, active }: CompanyNavProps) {
  const tabs: Array<{ key: 'overview' | 'valuation' | 'comps' | 'filings' | 'earnings' | 'timeline' | 'report'; label: string; href: string }> = [
    { key: 'overview', label: 'Overview', href: `/company/${ticker}` },
    { key: 'valuation', label: 'Valuation', href: `/company/${ticker}/valuation` },
    { key: 'comps', label: 'Comparable Companies', href: `/company/${ticker}/comps` },
    { key: 'filings', label: 'SEC Filings', href: `/company/${ticker}/filings` },
    { key: 'earnings', label: 'Earnings Calls', href: `/company/${ticker}/earnings` },
    { key: 'timeline', label: 'Research Timeline', href: `/company/${ticker}/timeline` },
    { key: 'report', label: 'Research Report', href: `/company/${ticker}/report` },
  ];

  return (
    <nav aria-label="Company sections" className="mb-6 flex gap-1 overflow-x-auto">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={active === tab.key ? 'page' : undefined}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            active === tab.key
              ? 'bg-accent-soft text-accent'
              : 'text-ink/50 hover:bg-accent-soft/50 hover:text-ink/70'
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
