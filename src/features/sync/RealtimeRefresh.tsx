import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "../../lib/supabase/client";

export function RealtimeRefresh() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const client = supabase;
    if (!client) return;
    const channel = client.channel("trip-vault-authorized-changes").on("postgres_changes", { event: "*", schema: "public" }, () => queryClient.invalidateQueries()).subscribe();
    return () => { client.removeChannel(channel); };
  }, [queryClient]);
  return null;
}
