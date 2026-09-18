import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, FilePlus2, FileText, Loader2, Paperclip, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { DocumentVisibilityBadge } from "../../components/DocumentVisibilityBadge";
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

function travelerGroup(document: VaultDocument, travelers: Traveler[]) {
  const ids = [...assignedTravelerIds(document)].sort();
  if (!ids.length)
    return document.assignment_mode === "unassigned"
      ? { key: "unassigned", label: "Unassigned" }
      : { key: "shared", label: "Everyone" };
  const names = ids.map(
    (id) => travelers.find((traveler) => traveler.id === id)?.display_name ?? "Traveler"
  );
  return { key: `travelers:${ids.join(",")}`, label: names.join(" + ") };
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
    <Link
      className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-brand-soft px-3 text-xs font-extrabold text-brand"
      to={`/trips/${item.trip_id}/documents/${primary.id}`}
      state={navigationState}
      aria-label={`Open ${purpose}: ${primary.title}`}
    >
      <FileText className="size-4" /> Open {purpose}
      {primary.short_label ? ` · ${primary.short_label}` : ""}
      <DocumentVisibilityBadge className="bg-surface/80" visibility={primary.visibility} />
    </Link>
  );
}

export function EventDocuments({
  item,
  canEdit,
  onUpload,
  travelerId,
  travelers = [],
  navigationState
}: {
  item: ItineraryItem;
  canEdit: boolean;
  onUpload?: () => void;
  travelerId?: string | null;
  travelers?: Traveler[];
  navigationState?: unknown;
}) {
  const confirm = useConfirmDialog();
  const queryClient = useQueryClient();
  const [picking, setPicking] = useState(false);
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
    mutationFn: (ids: string[]) => reorderEventDocuments(item.id, ids),
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
  const groupByTraveler = visibleLinks.some(
    (link) => assignedTravelerIds(link.document).length > 0
  );
  const documentGroups = (() => {
    if (!groupByTraveler) return [{ key: "all", label: null, links: visibleLinks }];
    const groups = new Map<string, { key: string; label: string; links: typeof visibleLinks }>();
    for (const link of visibleLinks) {
      const group = travelerGroup(link.document, travelers);
      const existing = groups.get(group.key);
      if (existing) existing.links.push(link);
      else groups.set(group.key, { ...group, links: [link] });
    }
    return [...groups.values()];
  })();

  const attach = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const ids = new FormData(event.currentTarget).getAll("documents").map(String);
    if (ids.length) attachMutation.mutate(ids);
  };

  return (
    <div className="mt-4 border-t border-line pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto flex items-center gap-2 text-xs font-bold text-muted">
          <Paperclip className="size-4" /> {visibleLinks.length} document
          {visibleLinks.length === 1 ? "" : "s"}
        </p>
        {canEdit && (
          <div className="flex flex-wrap items-center gap-1 sm:flex-nowrap">
            {onUpload && (
              <button
                type="button"
                onClick={onUpload}
                className="tap-target inline-flex min-h-9 items-center gap-1 rounded-full px-3 text-xs font-extrabold text-brand"
              >
                <FilePlus2 className="size-4" /> Upload new
              </button>
            )}
            <button
              type="button"
              onClick={() => setPicking(true)}
              className="tap-target inline-flex min-h-9 items-center gap-1 rounded-full px-3 text-xs font-extrabold text-brand"
            >
              <Paperclip className="size-4" /> Attach existing
            </button>
          </div>
        )}
      </div>
      {visibleLinks.length > 0 && (
        <div className="mt-3 space-y-3">
          {documentGroups.map((group) => (
            <section key={group.key} aria-label={group.label ?? undefined}>
              {group.label && (
                <div className="mb-1.5 flex items-center gap-2">
                  <strong className="shrink-0 text-xs font-extrabold text-ink">
                    {group.label}
                  </strong>
                  <span className="h-px flex-1 bg-line" aria-hidden="true" />
                  <span className="text-[.65rem] font-bold text-muted">{group.links.length}</span>
                </div>
              )}
              <div className="grid gap-2">
                {group.links.map((link) => {
                  const explicitIndex = explicitLinks.findIndex(
                    (row) => row.document_id === link.document_id
                  );
                  const documentTitle = link.label || link.document.title;
                  return (
                    <div
                      key={link.document_id}
                      className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-surface/70 sm:flex-row sm:items-stretch"
                    >
                      <Link
                        className="tap-target flex min-w-0 flex-1 items-start gap-2 px-3 py-2 text-xs font-bold sm:items-center"
                        to={`/trips/${item.trip_id}/documents/${link.document_id}`}
                        state={navigationState}
                      >
                        <FileText className="mt-0.5 size-3.5 shrink-0 text-brand sm:mt-0" />
                        <span className="min-w-0 flex-1 break-words leading-5 [overflow-wrap:anywhere]">
                          {documentTitle}
                        </span>
                      </Link>
                      <div className="flex min-w-0 items-stretch border-t border-line sm:border-l sm:border-t-0">
                        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 px-3 py-1 sm:flex-none sm:flex-nowrap sm:px-2">
                          <span className="text-[.65rem] font-medium text-muted">
                            {documentPurposeLabel(link.document.purpose)}
                            {link.inherited ? " · booking document" : ""}
                            {link.document.sync_state === "queued"
                              ? " · saved on device, cloud pending"
                              : ""}
                          </span>
                          <DocumentVisibilityBadge visibility={link.document.visibility} />
                        </div>
                        {canEdit && !link.inherited && (
                          <div
                            className="ml-auto flex shrink-0 border-l border-line"
                            aria-label={`Actions for ${documentTitle}`}
                            role="group"
                          >
                            <div className="flex divide-x divide-line sm:flex-col sm:divide-x-0 sm:divide-y">
                              <button
                                disabled={explicitIndex === 0 || reorderMutation.isPending}
                                type="button"
                                onClick={() => {
                                  const ids = explicitLinks.map((row) => row.document_id);
                                  [ids[explicitIndex - 1], ids[explicitIndex]] = [
                                    ids[explicitIndex],
                                    ids[explicitIndex - 1]
                                  ];
                                  reorderMutation.mutate(ids);
                                }}
                                className="tap-target grid size-11 place-items-center text-muted disabled:opacity-30 sm:h-auto sm:min-h-6 sm:w-8 sm:min-w-8 sm:flex-1"
                                aria-label={`Move ${documentTitle} earlier`}
                              >
                                <ArrowUp className="size-3" />
                              </button>
                              <button
                                disabled={
                                  explicitIndex === explicitLinks.length - 1 ||
                                  reorderMutation.isPending
                                }
                                type="button"
                                onClick={() => {
                                  const ids = explicitLinks.map((row) => row.document_id);
                                  [ids[explicitIndex], ids[explicitIndex + 1]] = [
                                    ids[explicitIndex + 1],
                                    ids[explicitIndex]
                                  ];
                                  reorderMutation.mutate(ids);
                                }}
                                className="tap-target grid size-11 place-items-center text-muted disabled:opacity-30 sm:h-auto sm:min-h-6 sm:w-8 sm:min-w-8 sm:flex-1"
                                aria-label={`Move ${documentTitle} later`}
                              >
                                <ArrowDown className="size-3" />
                              </button>
                            </div>
                            <button
                              type="button"
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
                              className="tap-target grid size-11 place-items-center border-l border-line text-muted hover:text-danger sm:h-auto sm:self-stretch"
                              aria-label={`Unlink ${documentTitle}`}
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
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
