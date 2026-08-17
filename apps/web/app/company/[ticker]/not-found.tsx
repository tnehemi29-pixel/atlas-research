import Link from 'next/link';

export default function CompanyNotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-6 text-center">
      <h1 className="text-ink font-serif text-2xl">Company not found</h1>
      <p className="text-ink/60 mt-2">
        We couldn&apos;t find a publicly traded U.S. company with that ticker.
      </p>
      <Link
        href="/"
        className="bg-accent text-paper hover:bg-accent/90 mt-6 rounded-lg px-4 py-2 text-sm font-medium"
      >
        Back to search
      </Link>
    </main>
  );
}
