import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Cloud, Loader2, RotateCcw, Trash2 } from "lucide-react";
import {
  groupSyncIssues,
  listSyncIssues,
  resolveSyncIssue,
  resolveSyncIssueGroup,
  type SyncIssue,
  type SyncIssueGroup
} from "./localSync";
import { useConfirmDialog } from "../../components/ConfirmDialogProvider";

function JsonValue({ value }: { value: unknown }) {
  return (
    <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-elevated p-3 text-[0.7rem] leading-5 text-muted">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function issueTitle(entityType: string) {
  const kind = entityType.split(":", 1)[0];
  const known: Record<string, string> = {
    "account-document-uploads": "Document upload",
    documents: "Documents",
    "event-documents": "Documents attached to an event"
  };
  return (
    known[kind] ??
    kind.replaceAll("-", " ").replace(/\b\w/g, (character) => character.toUpperCase())
  );
}

function issueHelp(errorCode?: string) {
  if (errorCode === "permission")
    return "This phone saved changes that the cloud did not permit. If the documents are already correct on another device, discard this local batch; otherwise confirm you can still edit the trip and retry.";
  if (errorCode === "authentication")
    return "Sign in again on this device, then retry these saved changes.";
  if (errorCode === "schema")
    return "The cloud database needs the latest app migration before this saved change can sync.";
  if (errorCode === "quota")
    return "Free some device or cloud storage, then retry these saved changes.";
  return "This change is still saved on this device. Retry it when the connection is stable, or discard the local copy if it is no longer needed.";
}

export function SyncIssuesPanel() {
  const confirm = useConfirmDialog();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["sync-issues"],
    queryFn: listSyncIssues,
    refetchInterval: 5_000
  });
  const mutation = useMutation({
    mutationFn: (
      request:
        | {
            kind: "single";
            issue: SyncIssue;
            resolution: Parameters<typeof resolveSyncIssue>[1];
          }
        | {
            kind: "group";
            group: SyncIssueGroup;
            resolution: "retry" | "discard";
          }
    ) =>
      request.kind === "single"
        ? resolveSyncIssue(request.issue.operationId, request.resolution)
        : resolveSyncIssueGroup(
            request.group.issues.map((issue) => issue.operationId),
            request.resolution
          ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["sync-issues"] }),
        queryClient.invalidateQueries({ queryKey: ["alerts"] })
      ]);
      queryClient.invalidateQueries();
    }
  });
  if (!query.data?.length)
    return (
      <section className="surface-card p-5 sm:p-6">
        <p className="eyebrow">Synchronization</p>
        <h2 className="mt-1 font-display text-xl font-black">All changes are clear</h2>
        <p className="mt-3 flex items-center gap-2 text-sm text-success">
          <Cloud className="size-4" /> No saved edit needs your attention.
        </p>
      </section>
    );
  const groups = groupSyncIssues(query.data);
  return (
    <section className="surface-card p-5 sm:p-6">
      <p className="eyebrow">Synchronization</p>
      <h2 className="mt-1 flex items-center gap-2 font-display text-xl font-black">
        <AlertTriangle className="size-5 text-warning" /> Saved edits need attention
      </h2>
      <p className="mt-2 text-sm text-muted">
        These changes are stored only on this device until they sync.
      </p>
      <div className="mt-4 space-y-4">
        {groups.map((group) => {
          const issue = group.issues[0];
          const multiple = group.issues.length > 1;
          return (
            <article key={group.key} className="min-w-0 rounded-2xl border border-warning/40 p-4">
              <p className="break-words text-sm font-black">{issueTitle(group.entityType)}</p>
              <p className="mt-1 text-xs text-muted">
                {multiple ? `${group.issues.length} saved changes · ` : ""}
                {group.lastErrorCode?.replaceAll("_", " ")} · attempt {group.attemptCount}
              </p>
              {group.lastErrorCode === "conflict" && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-bold">Your saved version</p>
                    <JsonValue value={issue.localValue} />
                  </div>
                  <div>
                    <p className="text-xs font-bold">Cloud version</p>
                    <JsonValue value={issue.serverValue} />
                  </div>
                </div>
              )}
              {group.lastErrorCode !== "conflict" && (
                <p className="mt-3 text-sm leading-6 text-muted">
                  {issueHelp(group.lastErrorCode)}
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                {group.lastErrorCode === "conflict" ? (
                  <>
                    <button
                      disabled={mutation.isPending || !navigator.onLine}
                      className="secondary-button"
                      onClick={() =>
                        mutation.mutate({ kind: "single", issue, resolution: "keep_local" })
                      }
                    >
                      <RotateCcw className="size-4" /> Keep mine and retry
                    </button>
                    <button
                      disabled={mutation.isPending}
                      className="secondary-button"
                      onClick={() =>
                        mutation.mutate({ kind: "single", issue, resolution: "use_server" })
                      }
                    >
                      <Cloud className="size-4" /> Use cloud version
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      disabled={mutation.isPending || !navigator.onLine}
                      className="secondary-button"
                      onClick={() => mutation.mutate({ kind: "group", group, resolution: "retry" })}
                    >
                      {mutation.isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <RotateCcw className="size-4" />
                      )}{" "}
                      {multiple ? "Retry all" : "Retry"}
                    </button>
                    <button
                      disabled={mutation.isPending}
                      className="secondary-button text-danger"
                      onClick={async () => {
                        if (
                          await confirm({
                            title: "Discard saved change?",
                            message: multiple
                              ? `Discard these ${group.issues.length} local changes and anything that depends on them? Cloud data already synced will not be deleted.`
                              : "Discard this local change and anything that depends on it? Cloud data already synced will not be deleted.",
                            confirmLabel: multiple ? "Discard all" : "Discard",
                            tone: "danger"
                          })
                        )
                          mutation.mutate({ kind: "group", group, resolution: "discard" });
                      }}
                    >
                      <Trash2 className="size-4" /> {multiple ? "Discard all" : "Discard"}
                    </button>
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {mutation.error && (
        <p role="alert" className="mt-3 text-sm font-bold text-danger">
          {mutation.error instanceof Error
            ? mutation.error.message
            : "The sync issue could not be changed."}
        </p>
      )}
    </section>
  );
}
