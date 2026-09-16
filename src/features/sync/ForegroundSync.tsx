import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { syncOutboxWithChanges } from "./localSync";
import { queryRootsForChangedTables } from "./queryRoots";
import { suppressRealtimeRefresh } from "./RealtimeRefresh";

export function ForegroundSync() {
  const queryClient = useQueryClient();
  useEffect(() => {
    let active = true;
    const run = () =>
      syncOutboxWithChanges()
        .then((result) => {
          if (!active) return;
          queryClient.invalidateQueries({ queryKey: ["sync-status"] });
          queryClient.invalidateQueries({ queryKey: ["sync-issues"] });
          if (!result.synced) return;
          const roots = queryRootsForChangedTables(result.changedTables);
          suppressRealtimeRefresh(roots, 2_000);
          for (const root of roots) {
            if (root === "*") queryClient.invalidateQueries({ refetchType: "active" });
            else queryClient.invalidateQueries({ queryKey: [root], refetchType: "active" });
          }
        })
        .catch(() => undefined);
    run();
    window.addEventListener("online", run);
    const onVisibility = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      window.removeEventListener("online", run);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [queryClient]);
  return null;
}
