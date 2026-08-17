'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            // Fail fast rather than silently retrying: for interactive
            // queries (search-as-you-type, a company lookup) a retry just
            // adds latency before the user sees a clear error, and a fresh
            // keystroke or page visit already re-queries naturally.
            retry: false,
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
