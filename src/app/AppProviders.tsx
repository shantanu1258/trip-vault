import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { ThemeProvider } from "../lib/theme/ThemeProvider";
import { ForegroundSync } from "../features/sync/ForegroundSync";
import { RealtimeRefresh } from "../features/sync/RealtimeRefresh";
import { PwaUpdatePrompt } from "../components/PwaUpdatePrompt";
import { PublishedConfigSync } from "../features/metadata/PublishedConfigSync";
import { InstallAppManager } from "../components/InstallAppButton";
import { ModalHistoryProvider } from "../components/ModalHistoryProvider";
import { ConfirmDialogProvider } from "../components/ConfirmDialogProvider";
import { RouteScrollManager } from "./RouteScrollManager";

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 2 * 60_000,
            gcTime: 30 * 60_000,
            retry: 1,
            refetchOnWindowFocus: false
          },
          mutations: { retry: 0 }
        }
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ModalHistoryProvider>
          <ConfirmDialogProvider>
            <RouteScrollManager />
            <InstallAppManager />
            <ForegroundSync />
            <RealtimeRefresh />
            <PublishedConfigSync />
            {children}
            <PwaUpdatePrompt />
          </ConfirmDialogProvider>
        </ModalHistoryProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
