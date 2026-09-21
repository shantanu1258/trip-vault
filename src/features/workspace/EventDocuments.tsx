import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  FilePlus2,
  FileText,
  Loader2,
  Paperclip,
  Trash2
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { DocumentVisibilityBadge } from "../../components/DocumentVisibilityBadge";
import { TripChildLink } from "../../components/TripChildLink";
import { useConfirmDialog } from "../../components/ConfirmDialogProvider";
import { ModalSheet } from "../../components/ModalSheet";
import type { ItineraryItem } from "../trips/types";
import {
  attachDocumentsToEvent,
  listEventDocumentLinks,
  listVaultDocuments,
  reorderEventDocuments,
  unlinkDocumentFromEvent
} from "./api";
import { documentMatchesTraveler, documentPurposeLabel } from "./documentModel";
import type { Traveler, VaultDocument } from "./types";

function assignedTravelerIds(document: VaultDocument) {
  return document.traveler_ids?.length
    ? document.traveler_ids
    : document.traveler_id
      ? [document.traveler_id]
      : [];
}

export function travelerGroup(document: VaultDocument, travelers: Traveler[]) {
  const ids = [...assignedTravelerIds(document)].sort();
  if (!ids.length)
    return document.assignment_mode === "unassigned"
      ? { key: "unassigned", label: "Unassigned", order: Number.MAX_SAFE_INTEGER }
      : { key: "shared", label: "Everyone", order: -1 };
  const names = ids.map(
    (id) => travelers.find((traveler) => traveler.id === id)?.display_name ?? "Traveler"
  );
  const travelerOrder = Math.min(
    ...ids.map((id) => {
      const index = travelers.findIndex((traveler) => traveler.id === id);
      return index === -1 ? Number.MAX_SAFE_INTEGER - 1 : index;
    })
  );
  return {
    key: `travelers:${ids.join(",")}`,
    label: names.join(" + "),
    order: travelerOrder
  };
}

export function EventDocumentShortcut({
  item,
  travelerId,
  navigationState
}: {
  item: ItineraryItem;
  travelerId?: string | null;
  navigationState?: unknown;
}) {
  const linksQuery = useQuery({
    queryKey: ["event-documents", item.id],
    queryFn: () => listEventDocumentLinks(item.id)
  });
  const documentsQuery = useQuery({
    queryKey: ["documents", item.trip_id],
    queryFn: () => listVaultDocuments(item.trip_id),
    enabled: Boolean(item.booking_id)
  });
  const matchesFocus = (document: NonNullable<typeof documentsQuery.data>[number]) =>
    !travelerId || documentMatchesTraveler(document, travelerId);
  const explicitDocument = (linksQuery.data ?? []).find((link) =>
    matchesFocus(link.document)
  )?.document;
  const bookingDocument = item.booking_id
    ? (documentsQuery.data ?? []).find(
        (document) => document.booking_id === item.booking_id && matchesFocus(document)
      )
    : undefined;
  const primary = explicitDocument ?? bookingDocument;
  if (!primary) return null;
  const purpose = documentPurposeLabel(primary.purpose);
  return (
    <TripChildLink
      tripId={item.trip_id}
      scrollAnchorId={`timeline-${item.id}`}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-brand-soft px-3 text-xs font-extrabold text-brand"
      to={`/trips/${item.trip_id}/documents/${primary.id}`}
      state={navigationState}
      aria-label={`Open ${purpose}: ${primary.title}`}
    >
      <FileText className="size-4" /> Open {purpose}
      {primary.short_label ? ` · ${primary.short_label}` : ""}
      <DocumentVisibilityBadge className="bg-surface/80" visibility={primary.visibility} />
    </TripChildLink>
  );
}

export function EventDocuments({
  item,
  canEdit,
  onUpload,
  travelerId,
  travelers = [],
  navigationState,
  compact = false
}: {
  item: ItineraryItem;
  canEdit: boolean;
  onUpload?: () => void;
  travelerId?: string | null;
  travelers?: Traveler[];
  navigationState?: unknown;
  compact?: boolean;
}) {
  const confirm = useConfirmDialog();
  const queryClient = useQueryClient();
  const [picking, setPicking] = useState(false);
  const groupStorageKey = `trip-vault:document-groups:${item.id}:${travelerId ?? "all"}`;
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() => {
    try {
      const saved: unknown = JSON.parse(sessionStorage.getItem(groupStorageKey) ?? "{}");
      return saved && typeof saved === "object" && !Array.isArray(saved)
        ? Object.fromEntries(
            Object.entries(saved).filter(([, value]) => typeof value === "boolean")
          )
        : {};
    } catch {
      return {};
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(groupStorageKey, JSON.stringify(collapsedGroups));
    } catch {
      /* Optional UI memory. */
    }
  }, [collapsedGroups, groupStorageKey]);
  const linksQuery = useQuery({
    queryKey: ["event-documents", item.id],
    queryFn: () => listEventDocumentLinks(item.id)
  });
  const documentsQuery = useQuery({
    queryKey: ["documents", item.trip_id],
    queryFn: () => listVaultDocuments(item.trip_id),
    enabled: picking || Boolean(item.booking_id)
  });
  const refreshDocumentLinks = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["event-documents", item.id] }),
      queryClient.invalidateQueries({ queryKey: ["trip-event-documents", item.trip_id] })
    ]);
  const attachMutation = useMutation({
    mutationFn: (ids: string[]) => attachDocumentsToEvent(item, ids),
    onSuccess: async () => {
      await refreshDocumentLinks();
      setPicking(false);
    }
  });
  const unlinkMutation = useMutation({
    mutationFn: (documentId: string) => unlinkDocumentFromEvent(item.id, documentId),
    onSuccess: refreshDocumentLinks
  });
  const reorderMutation = useMutation({
    mutationFn: async ({ documentId, adjacentId }: { documentId: string; adjacentId: string }) => {
      // Keep documents outside this traveler section in their existing slots.
      const allLinks = linksQuery.data ?? [];
      const inheritedIds = (documentsQuery.data ?? [])
        .filter(
          (doc) =>
            item.booking_id &&
            doc.booking_id === item.booking_id &&
            !allLinks.some((link) => link.document_id === doc.id)
        )
        .map((doc) => doc.id);
      const ids = [...allLinks.map((link) => link.document_id), ...inheritedIds];
      const from = ids.indexOf(documentId);
      const to = ids.indexOf(adjacentId);
      if (from < 0 || to < 0) throw new Error("Refresh the documents before reordering.");
      if (inheritedIds.length) await attachDocumentsToEvent(item, inheritedIds);
      [ids[from], ids[to]] = [ids[to], ids[from]];
      await reorderEventDocuments(item.id, ids);
    },
    onSuccess: refreshDocumentLinks
  });
  const matchesFocus = (document: NonNullable<typeof documentsQuery.data>[number]) =>
    !travelerId || documentMatchesTraveler(document, travelerId);
  const explicitLinks = (linksQuery.data ?? []).filter((link) => matchesFocus(link.document));
  const bookingDocuments = item.booking_id
    ? (documentsQuery.data ?? []).filter(
        (document) =>
          matchesFocus(document) &&
          document.booking_id === item.booking_id &&
          !explicitLinks.some((link) => link.document_id === document.id)
      )
    : [];
  const visibleLinks = [
    ...explicitLinks.map((link) => ({ ...link, inherited: false })),
    ...bookingDocuments.map((document, index) => ({
      itinerary_item_id: item.id,
      document_id: document.id,
      label: null,
      sort_order: explicitLinks.length + index,
      document,
      inherited: true
    }))
  ];
  const documentGroups = (() => {
    const groups = new Map<
      string,
      { key: string; label: string; order: number; links: typeof visibleLinks }
    >();
    for (const link of visibleLinks) {
      const group = travelerGroup(link.document, travelers);
      const existing = groups.get(group.key);
      if (existing) existing.links.push(link);
      else groups.set(group.key, { ...group, links: [link] });
    }
    return [...groups.values()].sort((left, right) => left.order - right.order);
  })();

  const isCollapsed = (key: string) =>
    collapsedGroups[key] ??
    (compact && !travelerId && documentGroups.length > 1 && key !== "shared");
  const toggleGroup = (key: string) =>
    setCollapsedGroups((current) => ({ ...current, [key]: !isCollapsed(key) }));

  const attach = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const ids = new FormData(event.currentTarget).getAll("documents").map(String);
    if (ids.length) attachMutation.mutate(ids);
  };

  return (
    <div className="mt-4 border-t border-line pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto flex items-center gap-2 text-sm font-extrabold text-ink">
          <Paperclip className="size-4 text-muted" aria-hidden="true" /> Documents
          <span
            className="rounded-full bg-elevated px-2 py-0.5 text-xs font-bold text-muted"
            aria-label={`${visibleLinks.length} attached document${visibleLinks.length === 1 ? "" : "s"}`}
          >
            {visibleLinks.length}
          </span>
        </h3>
      </div>
      {visibleLinks.length > 0 && (
        <div className="mt-1 space-y-1">
          {documentGroups.map((group) => (
            <section key={group.key} aria-label={group.label ?? undefined}>
              {group.label && (
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  className="flex min-h-11 w-full items-center gap-2 text-left"
                  aria-expanded={!isCollapsed(group.key)}
                  aria-label={`${isCollapsed(group.key) ? "Expand" : "Collapse"} documents for ${group.label}`}
                >
                  <strong className="min-w-0 break-words text-xs font-bold text-muted">
                    {group.key === "unassigned" ? "Unassigned documents" : `For ${group.label}`}
                  </strong>
                  <span className="shrink-0 rounded-full bg-elevated px-1.5 py-0.5 text-[.65rem] font-bold text-muted">
                    {group.links.length}
                  </span>
                  <ChevronDown
                    className={`ml-auto size-3.5 shrink-0 text-muted transition-transform ${isCollapsed(group.key) ? "-rotate-90" : ""}`}
                  />
                </button>
              )}
              {(!group.label || !isCollapsed(group.key)) && (
                <div className="grid gap-2">
                  {group.links.map((link, index) => {
                    const documentTitle = link.label || link.document.title;
                    return (
                      <div
                        key={link.document_id}
                        className="relative min-w-0 overflow-hidden rounded-xl border border-line bg-surface/70"
                      >
                        <TripChildLink
                          tripId={item.trip_id}
                          id={`event-document-${item.id}-${link.document_id}`}
                          scrollAnchorId={`timeline-${item.id}`}
                          aria-label={documentTitle}
                          className="tap-target group grid min-w-0 grid-cols-[.875rem_minmax(0,1fr)_1rem] items-start gap-x-2 px-3 py-2 text-xs font-bold transition hover:bg-brand-soft/40 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
                          to={`/trips/${item.trip_id}/documents/${link.document_id}`}
                          state={navigationState}
                        >
                          <FileText
                            className="mt-0.5 size-3.5 shrink-0 text-brand"
                            aria-hidden="true"
                          />
                          <span className="min-w-0">
                            <span className="block break-words leading-5 [overflow-wrap:anywhere]">
                              {documentTitle}
                            </span>
                            <span
                              className={`mt-1 flex min-h-9 flex-wrap items-center gap-x-2 gap-y-1 ${canEdit ? (group.links.length > 1 ? "pr-24" : !link.inherited ? "pr-7" : "") : ""}`}
                            >
                              <span className="text-[.65rem] font-medium text-muted">
                                {documentPurposeLabel(link.document.purpose)}
                                {link.inherited ? " · booking document" : ""}
                                {link.document.sync_state === "queued"
                                  ? " · saved on device, cloud pending"
                                  : ""}
                              </span>
                              <DocumentVisibilityBadge visibility={link.document.visibility} />
                            </span>
                          </span>
                          <ChevronRight
                            className="mt-0.5 size-4 text-muted transition-transform group-hover:translate-x-0.5"
                            aria-hidden="true"
                          />
                        </TripChildLink>
                        {canEdit && (
                          <div className="absolute bottom-1 right-1 flex items-center">
                            {group.links.length > 1 &&
                              (["up", "down"] as const).map((direction) => {
                                const adjacent = group.links[index + (direction === "up" ? -1 : 1)];
                                const Icon = direction === "up" ? ArrowUp : ArrowDown;
                                return (
                                  <button
                                    key={direction}
                                    type="button"
                                    disabled={
                                      !adjacent ||
                                      reorderMutation.isPending ||
                                      unlinkMutation.isPending
                                    }
                                    aria-label={`Move ${documentTitle} ${direction === "up" ? "earlier" : "later"}`}
                                    onClick={() =>
                                      adjacent &&
                                      reorderMutation.mutate({
                                        documentId: link.document_id,
                                        adjacentId: adjacent.document_id
                                      })
                                    }
                                    className="grid min-h-11 w-9 place-items-center rounded-lg text-muted hover:bg-brand-soft disabled:opacity-30"
                                  >
                                    <Icon className="size-3.5" />
                                  </button>
                                );
                              })}
                            {!link.inherited && (
                              <button
                                type="button"
                                disabled={reorderMutation.isPending || unlinkMutation.isPending}
                                onClick={async () => {
                                  if (
                                    await confirm({
                                      title: "Unlink document?",
                                      message: `Unlink ${link.document.title} from this event? The Vault document will remain.`,
                                      confirmLabel: "Unlink",
                                      tone: "danger"
                                    })
                                  )
                                    unlinkMutation.mutate(link.document_id);
                                }}
                                className="grid min-h-11 w-9 place-items-center rounded-lg text-muted hover:bg-danger/5 hover:text-danger focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
                                aria-label={`Unlink ${documentTitle}`}
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
      {!visibleLinks.length && !linksQuery.isLoading && (
        <p className="mt-3 text-sm text-muted">No documents attached yet.</p>
      )}
      {(reorderMutation.error || unlinkMutation.error) && (
        <p role="alert" className="mt-2 text-xs font-bold text-danger">
          Could not update document order or links. Please refresh and retry.
        </p>
      )}
      {canEdit && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {onUpload && (
            <button
              type="button"
              onClick={onUpload}
              className={
                visibleLinks.length
                  ? "tap-target inline-flex items-center gap-1.5 rounded-lg px-2 text-xs font-bold text-brand hover:bg-brand-soft"
                  : "primary-button text-sm"
              }
            >
              <FilePlus2 aria-hidden="true" className="size-4" /> Upload new
            </button>
          )}
          <button
            type="button"
            onClick={() => setPicking(true)}
            className={
              visibleLinks.length
                ? "tap-target inline-flex items-center gap-1.5 rounded-lg px-2 text-xs font-bold text-brand hover:bg-brand-soft"
                : "secondary-button text-sm"
            }
          >
            <Paperclip aria-hidden="true" className="size-4" /> Attach existing
          </button>
        </div>
      )}
      {picking && (
        <ModalSheet
          eyebrow={item.title}
          title="Attach Vault documents"
          onClose={() => setPicking(false)}
        >
          <form onSubmit={attach} className="mt-6">
            <div className="max-h-80 space-y-2 overflow-auto">
              {documentsQuery.isLoading && (
                <p className="flex items-center gap-2 text-sm text-muted">
                  <Loader2 className="size-4 animate-spin" /> Loading documents
                </p>
              )}
              {documentsQuery.data?.filter(matchesFocus).map((document) => {
                const attached = explicitLinks.some((link) => link.document_id === document.id);
                const inherited = Boolean(
                  item.booking_id && document.booking_id === item.booking_id
                );
                const unavailable = attached || inherited;
                return (
                  <label
                    key={document.id}
                    className={
                      unavailable
                        ? "flex items-center gap-3 rounded-2xl border border-success/30 bg-success/5 p-4 opacity-60"
                        : "flex items-center gap-3 rounded-2xl border border-line p-4"
                    }
                  >
                    <input
                      type="checkbox"
                      name="documents"
                      value={document.id}
                      disabled={unavailable}
                      className="size-4"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:items-center">
                        <strong className="min-w-0 flex-1 break-words text-sm [overflow-wrap:anywhere]">
                          {document.title}
                        </strong>
                        <DocumentVisibilityBadge visibility={document.visibility} />
                      </span>
                      <span className="mt-1 block text-xs capitalize text-muted">
                        {document.purpose.replace("_", " ")}
                        {attached
                          ? " · already attached"
                          : inherited
                            ? " · already available through booking"
                            : ""}
                      </span>
                    </span>
                  </label>
                );
              })}
              {documentsQuery.data?.filter(matchesFocus).length === 0 && (
                <p className="rounded-2xl border border-dashed border-line p-5 text-sm text-muted">
                  No Vault documents match the selected traveler yet.
                </p>
              )}
            </div>
            {attachMutation.error && (
              <p role="alert" className="mt-4 text-sm font-bold text-danger">
                Could not attach the selected documents.
              </p>
            )}
            <button className="primary-button mt-5 w-full" disabled={attachMutation.isPending}>
              {attachMutation.isPending && <Loader2 className="size-4 animate-spin" />} Attach
              selected
            </button>
          </form>
        </ModalSheet>
      )}
    </div>
  );
}
