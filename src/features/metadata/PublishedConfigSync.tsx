import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { refreshPublishedConfiguration } from "./publishedConfig";

export function PublishedConfigSync() {
  const queryClient = useQueryClient();
  useEffect(() => { const refresh = () => refreshPublishedConfiguration().then((changed) => { if (changed) { queryClient.invalidateQueries({ queryKey: ["available-airlines"] }); queryClient.invalidateQueries({ queryKey: ["available-airports"] }); } }).catch(() => undefined); refresh(); window.addEventListener("online", refresh); return () => window.removeEventListener("online", refresh); }, [queryClient]);
  return null;
}
