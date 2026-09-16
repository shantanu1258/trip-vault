import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "../../lib/supabase/client";
import { queryRootsForRealtimeTable } from "./queryRoots";

export { queryRootsForRealtimeTable } from "./queryRoots";

const locallyFreshUntil = new Map<string, number>();

export function suppressRealtimeRefresh(queryRoots: string[], durationMs = 1_200) {
  const until = Date.now() + durationMs;
  for (const root of queryRoots) locallyFreshUntil.set(root, until);
}

function isLocallyFresh(root: string) {
  const until = locallyFreshUntil.get(root) ?? 0;
  if (until > Date.now()) return true;
  locallyFreshUntil.delete(root);
  return false;
}

export function createCoalescedRefresh(refresh: (queryRoots: string[]) => void | Promise<unknown>, delayMs = 400) {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const pendingRoots = new Set<string>();

  const cancel = () => {
    if (timeout === null) return;
    clearTimeout(timeout);
    timeout = null;
  };

  const schedule = (queryRoots: string[] = ["*"]) => {
    queryRoots.forEach((root) => pendingRoots.add(root));
    cancel();
    timeout = setTimeout(() => {
      timeout = null;
      const queryRoots = [...pendingRoots];
      pendingRoots.clear();
      const rootsToRefresh = queryRoots.includes("*") ? ["*"] : queryRoots.filter((root) => !isLocallyFresh(root));
      if (!rootsToRefresh.length) return;
      void Promise.resolve().then(() => refresh(rootsToRefresh)).catch(() => undefined);
    }, delayMs);
  };

  return { cancel, schedule };
}

export function RealtimeRefresh() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const client = supabase;
    if (!client) return;
    // One destructive operation can emit a database event for every cascaded
    // row. Coalesce that burst so an event-rich trip deletion refreshes the UI
    // once instead of refetching every active query for every deleted row.
    const refresh = createCoalescedRefresh((queryRoots) => Promise.all(queryRoots.map((root) => root === "*"
      ? queryClient.invalidateQueries({ refetchType: "active" })
      : queryClient.invalidateQueries({ queryKey: [root], refetchType: "active" }))));
    const channel = client.channel("trip-vault-authorized-changes")
      .on("postgres_changes", { event: "*", schema: "public" }, (payload) => refresh.schedule(queryRootsForRealtimeTable(payload.table)))
      .subscribe();
    return () => {
      refresh.cancel();
      void client.removeChannel(channel);
    };
  }, [queryClient]);
  return null;
}
