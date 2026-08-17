import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth/session';
import { LogoutButton } from './LogoutButton';

const LOGGED_IN_LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/watchlists', label: 'Watchlists' },
  { href: '/portfolio', label: 'Portfolio' },
  { href: '/research-feed', label: 'Research Feed' },
  { href: '/research-backtest', label: 'Backtest' },
  { href: '/investment-cases', label: 'Investment Cases' },
  { href: '/filings', label: 'SEC Filings' },
  { href: '/earnings-calendar', label: 'Earnings' },
  { href: '/reports', label: 'Reports' },
  { href: '/integrity', label: 'Research Integrity' },
  { href: '/workspace', label: 'Workspace' },
  { href: '/alerts', label: 'Alerts' },
];

/** The persistent top-level shell nav — distinct from CompanyNav.tsx, which
 * only appears within a single company's research pages. Reads the session
 * via a Server Component (getCurrentUser touches next/headers' cookies(),
 * read-only here) so every page gets the correct logged-in/out chrome with
 * no client-side flash. */
export async function AppNav() {
  const user = await getCurrentUser();

  return (
    <header className="border-ink/10 bg-paper border-b">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
        <Link href="/" className="text-ink font-serif text-lg font-semibold shrink-0">
          Atlas Research
        </Link>

        {user ? (
          <nav aria-label="Primary" className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {LOGGED_IN_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="text-ink/60 hover:bg-accent-soft hover:text-accent shrink-0 rounded-lg px-2.5 py-1.5 text-sm font-medium">
                {link.label}
              </Link>
            ))}
          </nav>
        ) : (
          <div className="flex-1" />
        )}

        <div className="flex shrink-0 items-center gap-3">
          {user ? (
            <>
              <span className="text-ink/50 hidden text-sm sm:inline">{user.name ?? user.email}</span>
              <LogoutButton />
            </>
          ) : (
            <>
              <Link href="/login" className="text-ink/60 hover:text-ink text-sm font-medium">
                Log in
              </Link>
              <Link href="/register" className="bg-accent rounded-lg px-3 py-1.5 text-sm font-medium text-white">
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
