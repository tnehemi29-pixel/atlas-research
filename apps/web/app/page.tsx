import { getHealthStatus } from '@/lib/services/healthService';
import { CompanySearch } from '@/components/company-search/CompanySearch';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const health = await getHealthStatus();
  const isOk = health.status === 'ok';

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-24">
      <span className="bg-accent-soft text-accent mb-4 inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wide">
        Milestone 2 &middot; Company Search
      </span>

      <h1 className="text-ink font-serif text-4xl font-semibold leading-tight">
        Equity Research Platform
      </h1>

      <p className="text-ink/70 mt-4 max-w-lg text-base leading-relaxed">
        Search any U.S. publicly traded company by name or ticker to pull up its overview — price,
        market cap, sector, and 52-week range.
      </p>

      <div className="mt-8">
        <CompanySearch autoFocus placeholder="Try “Apple” or “AAPL”…" />
      </div>

      <div className="border-ink/10 bg-paper mt-10 flex items-center gap-3 rounded-lg border px-4 py-3">
        <span
          className={`h-2.5 w-2.5 rounded-full ${isOk ? 'bg-accent' : 'bg-red-500'}`}
          aria-hidden
        />
        <span className="text-ink/80 text-sm">
          System status:{' '}
          <strong className="font-medium">{isOk ? 'Operational' : 'Degraded'}</strong>
          {' — '}
          database {health.database}
        </span>
      </div>

      <div className="mt-8 flex flex-wrap gap-2">
        {['Next.js 14', 'TypeScript', 'PostgreSQL', 'Prisma', 'Tailwind CSS'].map((tech) => (
          <span
            key={tech}
            className="border-ink/10 text-ink/60 rounded-full border px-3 py-1 text-xs"
          >
            {tech}
          </span>
        ))}
      </div>
    </main>
  );
}
