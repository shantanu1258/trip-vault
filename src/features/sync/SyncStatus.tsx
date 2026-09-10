import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Check, CloudUpload } from "lucide-react";
import { Link } from "react-router-dom";
import { getSyncSummary } from "./localSync";

export function SyncStatus() {
  const query = useQuery({ queryKey: ["sync-status"], queryFn: getSyncSummary, refetchInterval: 5_000 });
  const summary = query.data;
  if (!summary) return null;
  if (summary.issues) return <Link to="/profile" className="tap-target inline-flex items-center gap-1.5 rounded-full bg-warning/10 px-3 text-xs font-bold text-warning"><AlertTriangle className="size-3.5" /><span className="hidden sm:inline">{summary.conflicts ? `${summary.conflicts} conflict${summary.conflicts === 1 ? "" : "s"}` : `${summary.issues} sync issue${summary.issues === 1 ? "" : "s"}`}</span></Link>;
  if (summary.pending) return <Link to="/profile" className="tap-target inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 text-xs font-bold text-brand"><CloudUpload className="size-3.5" /><span className="hidden sm:inline">{summary.pending} saved</span></Link>;
  return <span className="hidden items-center gap-1.5 text-xs font-bold text-success xl:inline-flex"><Check className="size-3.5" /> Synced</span>;
}
