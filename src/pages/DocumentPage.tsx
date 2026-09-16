import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArrowLeft,
  Download,
  ExternalLink,
  FileCheck2,
  FileWarning,
  HardDrive,
  Info,
  Loader2,
  ShieldCheck
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { ActionPanel } from "../components/ActionPanel";
import {
  DocumentVisibilityBadge,
  documentVisibilityPresentation
} from "../components/DocumentVisibilityBadge";
import { DocumentPreview } from "../components/DocumentPreview";
import { FileDropzone } from "../components/FileDropzone";
import { ModalSheet } from "../components/ModalSheet";
import { useConfirmDialog } from "../components/ConfirmDialogProvider";
import { ErrorCard, LoadingCard } from "../components/TripUi";
import { localProfileId } from "../features/sync/localSync";
import { tripReturnNavigation } from "../features/trips/navigation";
import { documentAssignmentLabel, documentPurposeLabel } from "../features/workspace/documentModel";
import {
  archiveDocument,
  downloadDocumentVersion,
  getVaultDocument,
  listDocumentAccessUserIds,
  listDocumentVersions,
  listMembers,
  listTravelers,
  replaceDocumentVersion,
  updateDocumentDetails,
  updateDocumentVisibility
} from "../features/workspace/api";
import type { DocumentAssignmentMode, DocumentVisibility } from "../features/workspace/types";
import {
  readOfflineFile,
  removeDocumentOfflineCopy,
  storeOfflineFile
} from "../lib/storage/offlineFiles";

export function DocumentPage() {
  const confirm = useConfirmDialog();
  const { tripId = "", documentId = "" } = useParams();
  const queryClient = useQueryClient();
  const locationState = useLocation().state;
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ["document", documentId],
    queryFn: () => getVaultDocument(documentId),
    enabled: Boolean(documentId)
  });
  const membersQuery = useQuery({
    queryKey: ["members", tripId],
    queryFn: () => listMembers(tripId),
    enabled: Boolean(tripId)
  });
  const travelersQuery = useQuery({
    queryKey: ["travelers", tripId],
    queryFn: () => listTravelers(tripId),
    enabled: Boolean(tripId)
  });
  const versionsQuery = useQuery({
    queryKey: ["document-versions", documentId],
    queryFn: () => listDocumentVersions(documentId),
    enabled: Boolean(documentId) && navigator.onLine
  });
  const [url, setUrl] = useState("");
  const [blob, setBlob] = useState<Blob | null>(null);
  const [attemptedVersion, setAttemptedVersion] = useState("");
  const [loadingFile, setLoadingFile] = useState(false);
  const [fileError, setFileError] = useState("");
  const [fileMessage, setFileMessage] = useState("");
  const [removingLocal, setRemovingLocal] = useState(false);
  const [source, setSource] = useState<"local" | "cloud" | "">("");
  const [showInfo, setShowInfo] = useState(false);
  const [editingDetails, setEditingDetails] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [assignmentModeDraft, setAssignmentModeDraft] = useState<DocumentAssignmentMode>("shared");
  const [selectedTravelerIds, setSelectedTravelerIds] = useState<string[]>([]);
  const [editingVisibility, setEditingVisibility] = useState(false);
  const [visibilityDraft, setVisibilityDraft] = useState<DocumentVisibility>("private");
  const [selectedAccessUserIds, setSelectedAccessUserIds] = useState<string[]>([]);
  const [userId, setUserId] = useState("");
  const document = query.data;
  const returnNavigation = tripReturnNavigation(locationState, tripId);
  const role = membersQuery.data?.find((member) => member.user_id === userId)?.role;
  const canManage = Boolean(
    document && (document.uploaded_by === userId || role === "owner" || role === "editor")
  );
  const canEditVisibility = role === "owner" || role === "editor";
  const accessQuery = useQuery({
    queryKey: ["document-access", documentId],
    queryFn: () => listDocumentAccessUserIds(documentId),
    enabled: Boolean(documentId) && showInfo && canEditVisibility && navigator.onLine
  });
  const travelerNames = useMemo(
    () =>
      new Map((travelersQuery.data ?? []).map((traveler) => [traveler.id, traveler.display_name])),
    [travelersQuery.data]
  );
  const replaceMutation = useMutation({
    mutationFn: (file: File) => replaceDocumentVersion(document!, file),
    onSuccess: async () => {
      setBlob(null);
      setUrl("");
      setAttemptedVersion("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["document", documentId] }),
        queryClient.invalidateQueries({ queryKey: ["document-versions", documentId] })
      ]);
    }
  });
  const archiveMutation = useMutation({
    mutationFn: () => archiveDocument(document!),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["documents", tripId] }),
        queryClient.invalidateQueries({ queryKey: ["documents"] })
      ]);
      navigate(returnNavigation.href, { replace: true, state: returnNavigation.state });
    }
  });
  const detailsMutation = useMutation({
    mutationFn: () =>
      updateDocumentDetails({
        document: document!,
        title: titleDraft,
        assignmentMode: assignmentModeDraft,
        travelerIds: selectedTravelerIds
      }),
    onSuccess: async (updated) => {
      queryClient.setQueryData(["document", documentId], updated);
      setEditingDetails(false);
      setFileMessage("Document title and travelers updated.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["documents", tripId] }),
        queryClient.invalidateQueries({ queryKey: ["documents"] })
      ]);
    }
  });
  const visibilityMutation = useMutation({
    mutationFn: () =>
      updateDocumentVisibility({
        documentId,
        visibility: visibilityDraft,
        selectedUserIds: selectedAccessUserIds
      }),
    onSuccess: async () => {
      setEditingVisibility(false);
      setFileMessage("Document visibility updated.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["document", documentId] }),
        queryClient.invalidateQueries({ queryKey: ["documents", tripId] }),
        queryClient.invalidateQueries({ queryKey: ["document-access", documentId] })
      ]);
    }
  });

  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url]
  );
  useEffect(() => {
    void localProfileId().then((profileId) => setUserId(profileId ?? ""));
  }, []);
  useEffect(() => {
    if (!document) return;
    setVisibilityDraft(document.visibility);
    setTitleDraft(document.title);
    setAssignmentModeDraft(
      document.assignment_mode ?? (document.traveler_id ? "selected" : "shared")
    );
    setSelectedTravelerIds(
      document.traveler_ids?.length
        ? document.traveler_ids
        : document.traveler_id
          ? [document.traveler_id]
          : []
    );
  }, [document]);
  useEffect(() => {
    if (accessQuery.data) setSelectedAccessUserIds(accessQuery.data);
  }, [accessQuery.data]);

  const open = useCallback(async () => {
    if (!document?.current_version || loadingFile) return;
    setLoadingFile(true);
    setFileError("");
    setFileMessage("");
    try {
      const profileId = await localProfileId();
      if (!profileId) throw new Error("Sign in to open this document.");
      const local = await readOfflineFile(
        profileId,
        document.current_version.id,
        document.current_version.mime_type
      );
      if (local) {
        setBlob(local);
        setUrl(URL.createObjectURL(local));
        setSource("local");
        return;
      }
      if (!navigator.onLine)
        throw new Error(
          "This file has not been saved on this device yet. Reconnect once to prepare it for offline use."
        );
      const downloaded = await downloadDocumentVersion(document);
      await storeOfflineFile({
        profileId,
        versionId: document.current_version.id,
        blob: downloaded,
        sha256: document.current_version.sha256,
        pinReason: "document"
      });
      setBlob(downloaded);
      setUrl(URL.createObjectURL(downloaded));
      setSource("cloud");
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "The document could not be opened.");
    } finally {
      setLoadingFile(false);
    }
  }, [document, loadingFile]);

  useEffect(() => {
    const versionId = document?.current_version?.id;
    if (!versionId || url || loadingFile || attemptedVersion === versionId) return;
    setAttemptedVersion(versionId);
    void open();
  }, [attemptedVersion, document?.current_version?.id, loadingFile, open, url]);

  const removeLocal = async () => {
    if (!document?.current_version || removingLocal) return;
    setRemovingLocal(true);
    setFileError("");
    setFileMessage("");
    try {
      const profileId = await localProfileId();
      if (!profileId) throw new Error("Sign in to change this device copy.");
      await removeDocumentOfflineCopy(profileId, document.current_version.id);
      if (url) URL.revokeObjectURL(url);
      setBlob(null);
      setUrl("");
      setSource("");
      setAttemptedVersion(document.current_version.id);
      setFileMessage("Removed from this device. The cloud original remains available.");
      await queryClient.invalidateQueries({ queryKey: ["offline-packs"] });
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "The local copy could not be removed.");
    } finally {
      setRemovingLocal(false);
    }
  };

  const retryOpen = () => {
    setAttemptedVersion("");
    void open();
  };

  return (
    <AppShell>
      <div className="document-page mx-auto min-w-0 max-w-6xl">
        <Link
          replace
          className="tap-target inline-flex items-center gap-2 text-sm font-bold text-muted"
          to={returnNavigation.href}
          state={returnNavigation.state}
        >
          <ArrowLeft className="size-4" /> Back to trip
        </Link>
        {query.isLoading && <LoadingCard label="Loading document" />}
        {query.error && <ErrorCard error={query.error} />}
        {document && (
          <>
            <header className="page-enter mt-4 grid min-w-0 gap-4 rounded-2xl border border-line bg-surface p-4 shadow-soft sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
              <div className="min-w-0">
                <p className="eyebrow">{documentPurposeLabel(document.purpose)}</p>
                <h1 className="mt-2 min-w-0 whitespace-normal break-words font-display text-xl font-black [overflow-wrap:anywhere] sm:text-2xl">
                  {document.title}
                </h1>
                <DocumentVisibilityBadge className="mt-3" visibility={document.visibility} />
              </div>
              <div className="flex items-center gap-2 lg:justify-end">
                {url && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="secondary-button px-3 sm:px-4"
                    aria-label="Open with device viewer"
                  >
                    <ExternalLink className="size-4" />
                    <span>Open</span>
                  </a>
                )}
                <button
                  type="button"
                  className="tap-target grid size-11 shrink-0 place-items-center rounded-full border border-line bg-surface text-brand hover:border-brand/40 sm:flex sm:w-auto sm:gap-2 sm:rounded-2xl sm:px-4"
                  onClick={() => setShowInfo(true)}
                  aria-label="Document information and actions"
                  title="Document information and actions"
                >
                  <Info className="size-5" aria-hidden="true" />
                  <span className="hidden sm:inline">Info</span>
                </button>
              </div>
            </header>

            {document.sync_state === "queued" && (
              <p
                role="status"
                className={`mt-3 flex items-center gap-2 rounded-xl p-3 text-sm font-bold ${document.sync_error ? "bg-warning/10 text-warning" : "bg-brand-soft text-brand"}`}
              >
                <HardDrive className="size-4 shrink-0" />
                {document.sync_error === "permission" || document.sync_error === "schema"
                  ? "Available on this device. Supabase rejected the cloud copy; open Info for the recovery step."
                  : document.sync_error === "authentication"
                    ? "Available on this device. Sign in again to finish the cloud copy."
                    : "Available on this device. The cloud copy is waiting to synchronize."}
              </p>
            )}

            <section className="mt-3 min-h-[62dvh] overflow-hidden rounded-2xl border border-line bg-elevated shadow-soft sm:min-h-[70dvh]">
              {url && blob && document.current_version && (
                <DocumentPreview
                  key={url}
                  blob={blob}
                  url={url}
                  title={document.title}
                  mimeType={document.current_version.mime_type}
                  filename={document.current_version.original_filename}
                />
              )}
              {!url && (
                <div className="grid min-h-[62dvh] place-items-center p-8 text-center sm:min-h-[70dvh]">
                  <div>
                    {loadingFile ? (
                      <>
                        <Loader2 className="mx-auto size-8 animate-spin text-brand" />
                        <p className="mt-4 text-sm font-bold">
                          Preparing the viewer and offline copy…
                        </p>
                      </>
                    ) : (
                      <>
                        <FileWarning className="mx-auto size-8 text-warning" />
                        <p className="mt-4 max-w-md text-sm font-bold">
                          {fileError || "This document does not have a complete file yet."}
                        </p>
                        {document.current_version && (
                          <button
                            type="button"
                            className="primary-button mx-auto mt-5"
                            onClick={retryOpen}
                          >
                            <FileCheck2 className="size-4" /> Try again
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </section>
            <p className="mt-3 text-center text-xs text-muted">
              {source
                ? `Opened from ${source === "local" ? "this device" : "the cloud and now saved offline"}. Preview pages and zoom here, or use Open for your device's viewer.`
                : "Trip Vault opens the document here first; downloading is optional."}
            </p>
            {fileMessage && (
              <p
                role="status"
                className="mt-3 rounded-xl bg-success/10 p-3 text-sm font-bold text-success"
              >
                {fileMessage}
              </p>
            )}

            {showInfo && (
              <ModalSheet
                eyebrow={documentPurposeLabel(document.purpose)}
                title="Document information"
                onClose={() => setShowInfo(false)}
              >
                <dl className="mt-6 grid min-w-0 gap-4 rounded-2xl bg-elevated p-4 text-sm sm:grid-cols-2">
                  <div className="min-w-0">
                    <dt className="text-xs font-bold text-muted">Title</dt>
                    <dd className="mt-1 whitespace-normal break-words font-bold [overflow-wrap:anywhere]">
                      {document.title}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-bold text-muted">For</dt>
                    <dd className="mt-1 font-bold">
                      {documentAssignmentLabel(document, travelerNames)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-bold text-muted">Access</dt>
                    <dd className="mt-1 font-bold">
                      {documentVisibilityPresentation(document.visibility).description}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-bold text-muted">Storage</dt>
                    <dd className="mt-1 inline-flex items-center gap-1.5 font-bold text-success">
                      <ShieldCheck className="size-4" /> Private Supabase bucket
                    </dd>
                  </div>
                  {document.current_version && (
                    <>
                      <div>
                        <dt className="text-xs font-bold text-muted">File</dt>
                        <dd className="mt-1 break-all font-bold">
                          {document.current_version.original_filename}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-bold text-muted">Size</dt>
                        <dd className="mt-1 font-bold">
                          {(document.current_version.byte_size / 1_000_000).toFixed(2)} MB
                        </dd>
                      </div>
                    </>
                  )}
                </dl>
                {canManage && (
                  <ActionPanel
                    title="Document title and travelers"
                    description="Correct the generated name or reassign who this file is for."
                    editing={editingDetails}
                    onToggle={() => {
                      setEditingDetails((value) => !value);
                      detailsMutation.reset();
                    }}
                  >
                    <form
                      className="space-y-4"
                      onSubmit={(event) => {
                        event.preventDefault();
                        detailsMutation.mutate();
                      }}
                    >
                      <label className="form-label">
                        Title
                        <input
                          autoFocus
                          required
                          className="form-input"
                          value={titleDraft}
                          onChange={(event) => setTitleDraft(event.target.value)}
                          placeholder="Name this document so it is easy to recognize"
                        />
                      </label>
                      <fieldset className="rounded-xl bg-elevated p-3">
                        <legend className="px-1 text-xs font-black">Who is it for?</legend>
                        <div className="mt-2 grid gap-2">
                          <label className="flex items-start gap-3 rounded-xl bg-surface p-3 text-sm">
                            <input
                              type="radio"
                              name="documentAssignment"
                              className="mt-1 size-4"
                              checked={assignmentModeDraft === "shared"}
                              onChange={() => setAssignmentModeDraft("shared")}
                            />
                            <span>
                              <strong className="block">Everyone</strong>
                              <span className="mt-0.5 block text-xs text-muted">
                                One file used together
                              </span>
                            </span>
                          </label>
                          <label className="flex items-start gap-3 rounded-xl bg-surface p-3 text-sm">
                            <input
                              type="radio"
                              name="documentAssignment"
                              className="mt-1 size-4"
                              checked={assignmentModeDraft === "selected"}
                              onChange={() => setAssignmentModeDraft("selected")}
                            />
                            <span>
                              <strong className="block">Traveler(s)</strong>
                              <span className="mt-0.5 block text-xs text-muted">
                                Choose one or more people
                              </span>
                            </span>
                          </label>
                          <label className="flex items-start gap-3 rounded-xl bg-surface p-3 text-sm">
                            <input
                              type="radio"
                              name="documentAssignment"
                              className="mt-1 size-4"
                              checked={assignmentModeDraft === "unassigned"}
                              onChange={() => setAssignmentModeDraft("unassigned")}
                            />
                            <span>
                              <strong className="block">Assign later</strong>
                              <span className="mt-0.5 block text-xs text-muted">
                                Use when the owner is not known yet
                              </span>
                            </span>
                          </label>
                        </div>
                        {assignmentModeDraft === "selected" && (
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            {travelersQuery.data?.map((traveler) => (
                              <label
                                key={traveler.id}
                                className="flex items-center gap-2 rounded-xl border border-line bg-surface p-3 text-sm font-bold"
                              >
                                <input
                                  type="checkbox"
                                  className="size-4"
                                  checked={selectedTravelerIds.includes(traveler.id)}
                                  onChange={(event) =>
                                    setSelectedTravelerIds((ids) =>
                                      event.target.checked
                                        ? [...new Set([...ids, traveler.id])]
                                        : ids.filter((id) => id !== traveler.id)
                                    )
                                  }
                                />
                                {traveler.display_name}
                              </label>
                            ))}
                          </div>
                        )}
                      </fieldset>
                      {detailsMutation.error && (
                        <p role="alert" className="text-xs font-bold text-danger">
                          {detailsMutation.error instanceof Error
                            ? detailsMutation.error.message
                            : "Document details could not be updated."}
                        </p>
                      )}
                      <button
                        type="submit"
                        className="primary-button w-full"
                        disabled={
                          detailsMutation.isPending ||
                          !navigator.onLine ||
                          !titleDraft.trim() ||
                          (assignmentModeDraft === "selected" && !selectedTravelerIds.length)
                        }
                      >
                        {detailsMutation.isPending ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : null}{" "}
                        Save document details
                      </button>
                      {!navigator.onLine && (
                        <p className="text-xs font-bold text-warning">
                          Reconnect to change document details.
                        </p>
                      )}
                    </form>
                  </ActionPanel>
                )}
                {canEditVisibility && (
                  <ActionPanel
                    title="Who can open this document?"
                    description="You can change this after upload."
                    editing={editingVisibility}
                    actionLabel="Change"
                    onToggle={() => {
                      if (editingVisibility) {
                        setEditingVisibility(false);
                        setVisibilityDraft(document.visibility);
                        setSelectedAccessUserIds(accessQuery.data ?? []);
                      } else setEditingVisibility(true);
                    }}
                  >
                    <div className="space-y-3">
                      <label className="form-label">
                        Visibility
                        <select
                          className="form-input"
                          value={visibilityDraft}
                          onChange={(event) =>
                            setVisibilityDraft(event.target.value as DocumentVisibility)
                          }
                        >
                          <option value="trip">Everyone signed in to this trip</option>
                          <option value="private">Only me</option>
                          <option value="selected_members">Selected signed-in members</option>
                        </select>
                      </label>
                      {visibilityDraft === "selected_members" && (
                        <fieldset className="rounded-xl bg-elevated p-3">
                          <legend className="px-1 text-xs font-black">Selected members</legend>
                          <div className="mt-2 space-y-2">
                            {membersQuery.data?.map((member) => (
                              <label
                                key={member.user_id}
                                className="flex items-center gap-3 text-sm"
                              >
                                <input
                                  type="checkbox"
                                  className="size-4"
                                  checked={selectedAccessUserIds.includes(member.user_id)}
                                  onChange={(event) =>
                                    setSelectedAccessUserIds((ids) =>
                                      event.target.checked
                                        ? [...new Set([...ids, member.user_id])]
                                        : ids.filter((id) => id !== member.user_id)
                                    )
                                  }
                                />
                                {member.display_name}
                              </label>
                            ))}
                          </div>
                        </fieldset>
                      )}
                      <button
                        type="button"
                        className="primary-button w-full"
                        disabled={
                          visibilityMutation.isPending ||
                          !navigator.onLine ||
                          (visibilityDraft === "selected_members" && !selectedAccessUserIds.length)
                        }
                        onClick={() => visibilityMutation.mutate()}
                      >
                        {visibilityMutation.isPending ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : null}{" "}
                        Save visibility
                      </button>
                      {!navigator.onLine && (
                        <p className="text-xs font-bold text-warning">
                          Reconnect to change document access.
                        </p>
                      )}
                      {visibilityMutation.error && (
                        <p role="alert" className="text-xs font-bold text-danger">
                          {visibilityMutation.error instanceof Error
                            ? visibilityMutation.error.message
                            : "Visibility could not be updated."}
                        </p>
                      )}
                    </div>
                  </ActionPanel>
                )}
                {document.sync_error && (
                  <p className="mt-4 rounded-xl bg-warning/10 p-3 text-sm font-bold text-warning">
                    {document.sync_error === "permission" || document.sync_error === "schema"
                      ? "Cloud setup or permission failed. Run the latest document migration in Supabase, then use Profile → Sync issues → Retry."
                      : document.sync_error === "authentication"
                        ? "Your cloud session needs refreshing. Sign out and back in; the device copy will remain."
                        : "Cloud synchronization needs attention. Open Profile → Sync issues to retry or inspect it."}
                  </p>
                )}
                {url && (
                  <div className="mt-5 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={removingLocal}
                      onClick={async () => {
                        if (
                          await confirm({
                            title: "Remove device copy?",
                            message:
                              "Remove this verified copy from this device? The cloud original will remain.",
                            confirmLabel: "Remove copy",
                            tone: "danger"
                          })
                        )
                          void removeLocal();
                      }}
                      className="secondary-button"
                    >
                      <HardDrive className="size-4" /> Remove device copy
                    </button>
                    <a
                      className="secondary-button"
                      href={url}
                      download={document.current_version?.original_filename}
                    >
                      <Download className="size-4" /> Download a copy
                    </a>
                  </div>
                )}
                {canManage && (
                  <div className="mt-5 grid gap-2 border-t border-line pt-5 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <FileDropzone
                      compact
                      name="replacementFile"
                      label="Replace with a new PDF or image"
                      file={null}
                      busy={replaceMutation.isPending}
                      onFileChange={(file) => {
                        if (file) replaceMutation.mutate(file);
                      }}
                    />
                    <button
                      type="button"
                      className="secondary-button justify-center text-danger"
                      disabled={archiveMutation.isPending}
                      onClick={async () => {
                        if (
                          await confirm({
                            title: "Archive document?",
                            message:
                              "Archive this document? Its local copy remains on this device.",
                            confirmLabel: "Archive",
                            tone: "danger"
                          })
                        )
                          archiveMutation.mutate();
                      }}
                    >
                      <Archive className="size-4" /> Archive
                    </button>
                  </div>
                )}
                {(versionsQuery.data?.length ?? 0) > 0 && (
                  <section className="mt-5 border-t border-line pt-5">
                    <p className="eyebrow">Version history</p>
                    <div className="mt-3 space-y-2">
                      {versionsQuery.data?.map((version) => (
                        <div
                          className={`flex items-center justify-between gap-3 rounded-xl p-3 text-sm ${version.id === document.current_version_id ? "bg-brand-soft" : "bg-elevated"}`}
                          key={version.id}
                        >
                          <div className="min-w-0">
                            <p className="truncate font-bold">
                              Version {version.version_number} · {version.original_filename}
                            </p>
                            <p className="mt-1 text-xs text-muted">
                              {new Date(version.created_at).toLocaleString()} ·{" "}
                              {(version.byte_size / 1_000_000).toFixed(2)} MB
                            </p>
                          </div>
                          {version.id === document.current_version_id && (
                            <span className="rounded-full bg-success/10 px-2 py-1 text-[.6rem] font-black uppercase text-success">
                              Current
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                )}
                {(replaceMutation.error || archiveMutation.error || fileError) && (
                  <p
                    role="alert"
                    className="mt-4 rounded-xl bg-danger/10 p-3 text-sm font-bold text-danger"
                  >
                    {replaceMutation.error instanceof Error
                      ? replaceMutation.error.message
                      : archiveMutation.error instanceof Error
                        ? archiveMutation.error.message
                        : fileError}
                  </p>
                )}
              </ModalSheet>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
