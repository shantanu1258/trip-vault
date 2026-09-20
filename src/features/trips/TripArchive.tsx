import { Archive, ChevronRight, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { ModalSheet } from "../../components/ModalSheet";
import type { ArchivedTripItem } from "./types";

export function TripArchive({
  items,
  editable,
  online,
  loading,
  error,
  onRestore,
  onDelete
}: {
  items: ArchivedTripItem[];
  editable: boolean;
  online: boolean;
  loading?: boolean;
  error?: boolean;
  onRestore: (item: ArchivedTripItem) => Promise<unknown>;
  onDelete: (item: ArchivedTripItem) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<ArchivedTripItem | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState("");
  const close = () => {
    if (pending) return;
    if (deleting) {
      setDeleting(null);
      return;
    }
    setOpen(false);
  };
  const act = async (item: ArchivedTripItem, remove: boolean) => {
    setPending(true);
    setFailure("");
    setMessage("");
    try {
      await (remove ? onDelete(item) : onRestore(item));
      setDeleting(null);
      setMessage(`${item.title} ${remove ? "permanently deleted" : "restored"}.`);
    } catch (cause) {
      setFailure(
        cause && typeof cause === "object" && "message" in cause
          ? String(cause.message)
          : "Could not update this item. Please try again."
      );
    } finally {
      setPending(false);
    }
  };
  return (
    <>
      <button
        type="button"
        className="flex min-h-11 w-full items-center gap-3 rounded-xl bg-elevated p-3 text-left text-sm font-bold"
        onClick={() => {
          setOpen(true);
          setMessage("");
          setFailure("");
        }}
      >
        <Archive className="size-4 text-muted" aria-hidden="true" />
        <span className="flex-1">Open archive</span>
        <ChevronRight className="size-4 text-muted" aria-hidden="true" />
      </button>
      {open && (
        <ModalSheet
          title={deleting ? "Permanently delete item?" : "Archived trip items"}
          eyebrow="Trip archive"
          onClose={close}
        >
          {deleting ? (
            <div className="mt-5 space-y-4">
              <p className="text-sm text-muted">
                Permanently delete <strong className="text-ink">{deleting.title}</strong>? This
                cannot be undone.
              </p>
              {(deleting.kind === "booking" || deleting.kind === "event") && (
                <p className="text-sm text-muted">
                  {deleting.kind === "booking"
                    ? "The booking, its archived events, and journey details will be deleted. "
                    : "This archived event will be deleted. "}
                  Linked documents and costs will be kept; their links to the deleted item will be
                  removed.
                </p>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  className="primary-button justify-center bg-danger"
                  disabled={pending || !online}
                  onClick={() => void act(deleting, true)}
                >
                  Permanently delete
                </button>
                <button
                  type="button"
                  className="secondary-button justify-center"
                  disabled={pending}
                  onClick={() => {
                    setDeleting(null);
                    setFailure("");
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-5">
              {!online ? (
                <p className="text-sm text-muted">Connect to view and manage archived items.</p>
              ) : loading ? (
                <p role="status">Loading archive…</p>
              ) : error ? (
                <p role="alert" className="text-sm text-danger">
                  Could not load the archive. Please reconnect and try again.
                </p>
              ) : items.length === 0 ? (
                <p className="text-sm text-muted">Nothing is archived.</p>
              ) : (
                <>
                  <p className="mb-3 text-sm text-muted">
                    Restore an item or permanently delete it. Deleted documents are managed
                    separately in Vault.
                  </p>
                  <ul className="divide-y divide-line">
                    {items.map((item) => (
                      <li
                        key={`${item.kind}:${item.id}`}
                        className="flex items-center gap-2 py-2.5 sm:gap-3"
                      >
                        <div className="min-w-0 flex-1">
                          <strong className="block break-words text-sm">{item.title}</strong>
                          <span className="text-xs capitalize text-muted">{item.kind}</span>
                        </div>
                        {editable && (
                          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
                            <button
                              type="button"
                              className="secondary-button min-h-11 min-w-11 justify-center gap-1.5 px-2 py-2 text-xs sm:px-3"
                              disabled={pending}
                              aria-label={`Recover ${item.title}`}
                              title="Recover item"
                              onClick={() => void act(item, false)}
                            >
                              <RotateCcw className="size-4 shrink-0" aria-hidden="true" />
                              <span className="hidden sm:inline">Recover</span>
                            </button>
                            <button
                              type="button"
                              className="secondary-button min-h-11 min-w-11 justify-center gap-1.5 px-2 py-2 text-xs text-danger sm:px-3"
                              disabled={pending}
                              aria-label={`Delete ${item.title} permanently`}
                              title="Delete permanently"
                              onClick={() => {
                                setDeleting(item);
                                setFailure("");
                                setMessage("");
                              }}
                            >
                              <Trash2 className="size-4 shrink-0" aria-hidden="true" />
                              <span className="hidden sm:inline">Delete</span>
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
          {message && (
            <p role="status" className="mt-4 text-sm text-brand">
              {message}
            </p>
          )}
          {failure && (
            <p role="alert" className="mt-4 text-sm text-danger">
              {failure}
            </p>
          )}
        </ModalSheet>
      )}
    </>
  );
}
