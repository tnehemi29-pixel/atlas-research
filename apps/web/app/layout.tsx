import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import { AppNav } from '@/components/AppNav';

export const metadata: Metadata = {
  title: 'Equity Research Platform',
  description: 'AI-powered institutional equity research.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-bg text-ink antialiased">
        <Providers>
          <div className="print:hidden">
            <AppNav />
          </div>
          {children}
        </Providers>
      </body>
    </html>
  );
}
