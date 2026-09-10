import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { ThemeProvider } from "../lib/theme/ThemeProvider";
import { ForegroundSync } from "../features/sync/ForegroundSync";
import { RealtimeRefresh } from "../features/sync/RealtimeRefresh";
import { PwaUpdatePrompt } from "../components/PwaUpdatePrompt";
import { PublishedConfigSync } from "../features/metadata/PublishedConfigSync";
import { InstallAppManager } from "../components/InstallAppButton";

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
          mutations: { retry: 0 }
        }
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider><InstallAppManager /><ForegroundSync /><RealtimeRefresh /><PublishedConfigSync />{children}<PwaUpdatePrompt /></ThemeProvider>
    </QueryClientProvider>
  );
}
