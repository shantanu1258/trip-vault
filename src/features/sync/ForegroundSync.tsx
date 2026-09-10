import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { syncOutbox } from "./localSync";

export function ForegroundSync() {
  const queryClient = useQueryClient();
  useEffect(() => {
    let active = true;
    const run = () => syncOutbox().then((result) => { if (!active) return; queryClient.invalidateQueries({ queryKey: ["sync-status"] }); queryClient.invalidateQueries({ queryKey: ["sync-issues"] }); if (result.synced) queryClient.invalidateQueries(); }).catch(() => undefined);
    run();
    window.addEventListener("online", run);
    const onVisibility = () => { if (document.visibilityState === "visible") run(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { active = false; window.removeEventListener("online", run); document.removeEventListener("visibilitychange", onVisibility); };
  }, [queryClient]);
  return null;
}
