import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArrowLeft, Download, ExternalLink, FileCheck2, FileUp, FileWarning, HardDrive, Info, Loader2, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { ModalSheet } from "../components/ModalSheet";
import { ErrorCard, LoadingCard } from "../components/TripUi";
import { localProfileId } from "../features/sync/localSync";
import { documentAssignmentLabel, documentPurposeLabel } from "../features/workspace/documentModel";
import { archiveDocument, downloadDocumentVersion, getVaultDocument, listDocumentVersions, listMembers, listTravelers, replaceDocumentVersion } from "../features/workspace/api";
import { readOfflineFile, removeDocumentOfflineCopy, storeOfflineFile } from "../lib/storage/offlineFiles";

export function DocumentPage() {
  const { tripId = "", documentId = "" } = useParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const query = useQuery({ queryKey: ["document", documentId], queryFn: () => getVaultDocument(documentId), enabled: Boolean(documentId) });
  const membersQuery = useQuery({ queryKey: ["members", tripId], queryFn: () => listMembers(tripId), enabled: Boolean(tripId) });
  const travelersQuery = useQuery({ queryKey: ["travelers", tripId], queryFn: () => listTravelers(tripId), enabled: Boolean(tripId) });
  const versionsQuery = useQuery({ queryKey: ["document-versions", documentId], queryFn: () => listDocumentVersions(documentId), enabled: Boolean(documentId) && navigator.onLine });
  const [url, setUrl] = useState("");
  const [attemptedVersion, setAttemptedVersion] = useState("");
  const [loadingFile, setLoadingFile] = useState(false);
  const [fileError, setFileError] = useState("");
  const [fileMessage, setFileMessage] = useState("");
  const [removingLocal, setRemovingLocal] = useState(false);
  const [source, setSource] = useState<"local" | "cloud" | "">("");
  const [showInfo, setShowInfo] = useState(false);
  const [userId, setUserId] = useState("");
  const document = query.data;
  const role = membersQuery.data?.find((member) => member.user_id === userId)?.role;
  const canManage = Boolean(document && (document.uploaded_by === userId || role === "owner" || role === "editor"));
  const travelerNames = useMemo(() => new Map((travelersQuery.data ?? []).map((traveler) => [traveler.id, traveler.display_name])), [travelersQuery.data]);
  const replaceMutation = useMutation({ mutationFn: (file: File) => replaceDocumentVersion(document!, file), onSuccess: async () => { setUrl(""); setAttemptedVersion(""); await Promise.all([queryClient.invalidateQueries({ queryKey: ["document", documentId] }), queryClient.invalidateQueries({ queryKey: ["document-versions", documentId] })]); } });
  const archiveMutation = useMutation({ mutationFn: () => archiveDocument(document!), onSuccess: async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ["documents", tripId] }), queryClient.invalidateQueries({ queryKey: ["documents"] })]); navigate(`/trips/${tripId}`); } });

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  useEffect(() => { void localProfileId().then((profileId) => setUserId(profileId ?? "")); }, []);

  const open = useCallback(async () => {
    if (!document?.current_version || loadingFile) return;
    setLoadingFile(true); setFileError(""); setFileMessage("");
    try {
      const profileId = await localProfileId();
      if (!profileId) throw new Error("Sign in to open this document.");
      const local = await readOfflineFile(profileId, document.current_version.id, document.current_version.mime_type);
      if (local) { setUrl(URL.createObjectURL(local)); setSource("local"); return; }
      if (!navigator.onLine) throw new Error("This file has not been saved on this device yet. Reconnect once to prepare it for offline use.");
      const blob = await downloadDocumentVersion(document);
      await storeOfflineFile({ profileId, versionId: document.current_version.id, blob, sha256: document.current_version.sha256, pinReason: "document" });
      setUrl(URL.createObjectURL(blob)); setSource("cloud");
    } catch (error) { setFileError(error instanceof Error ? error.message : "The document could not be opened."); }
    finally { setLoadingFile(false); }
  }, [document, loadingFile]);

  useEffect(() => {
    const versionId = document?.current_version?.id;
    if (!versionId || url || loadingFile || attemptedVersion === versionId) return;
    setAttemptedVersion(versionId);
    void open();
  }, [attemptedVersion, document?.current_version?.id, loadingFile, open, url]);

  const removeLocal = async () => {
    if (!document?.current_version || removingLocal) return;
    setRemovingLocal(true); setFileError(""); setFileMessage("");
    try {
      const profileId = await localProfileId();
      if (!profileId) throw new Error("Sign in to change this device copy.");
      await removeDocumentOfflineCopy(profileId, document.current_version.id);
      if (url) URL.revokeObjectURL(url);
      setUrl(""); setSource(""); setAttemptedVersion(document.current_version.id);
      setFileMessage("Removed from this device. The cloud original remains available.");
      await queryClient.invalidateQueries({ queryKey: ["offline-packs"] });
    } catch (error) { setFileError(error instanceof Error ? error.message : "The local copy could not be removed."); }
    finally { setRemovingLocal(false); }
  };

  const retryOpen = () => { setAttemptedVersion(""); void open(); };

  return <AppShell><div className="mx-auto max-w-6xl">
    <Link className="tap-target inline-flex items-center gap-2 text-sm font-bold text-muted" to={`/trips/${tripId}`}><ArrowLeft className="size-4" /> Back to trip</Link>
    {query.isLoading && <LoadingCard label="Loading document" />}
    {query.error && <ErrorCard error={query.error} />}
    {document && <>
      <header className="page-enter mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-3 shadow-soft sm:px-5">
        <div className="min-w-0"><p className="eyebrow">{documentPurposeLabel(document.purpose)}</p><h1 className="mt-1 truncate font-display text-xl font-black sm:text-2xl">{document.title}</h1></div>
        <div className="flex shrink-0 gap-2">{url && <a href={url} target="_blank" rel="noreferrer" className="secondary-button px-3 sm:px-4" aria-label="Open full-screen viewer"><ExternalLink className="size-4" /><span>Open</span></a>}<button type="button" className="secondary-button size-11 px-0 sm:size-auto sm:px-4" onClick={() => setShowInfo(true)} aria-label="Document information and actions"><Info className="size-5" /><span className="hidden sm:inline">Info</span></button></div>
      </header>

      {document.sync_state === "queued" && <p role="status" className={`mt-3 flex items-center gap-2 rounded-xl p-3 text-sm font-bold ${document.sync_error ? "bg-warning/10 text-warning" : "bg-brand-soft text-brand"}`}><HardDrive className="size-4 shrink-0" />{document.sync_error === "permission" || document.sync_error === "schema" ? "Available on this device. Supabase rejected the cloud copy; open Info for the recovery step." : document.sync_error === "authentication" ? "Available on this device. Sign in again to finish the cloud copy." : "Available on this device. The cloud copy is waiting to synchronize."}</p>}

      <section className="mt-3 min-h-[62dvh] overflow-hidden rounded-2xl border border-line bg-elevated shadow-soft sm:min-h-[70dvh]">
        {url && document.current_version?.mime_type === "application/pdf" && <iframe key={url} title={document.title} className="h-[72dvh] min-h-[34rem] w-full bg-white" src={`${url}#view=FitH`} allowFullScreen />}
        {url && document.current_version?.mime_type !== "application/pdf" && <a href={url} target="_blank" rel="noreferrer" className="grid min-h-[62dvh] place-items-center p-2 sm:min-h-[70dvh]"><img alt={document.title} className="max-h-[78dvh] w-full object-contain" src={url} /></a>}
        {!url && <div className="grid min-h-[62dvh] place-items-center p-8 text-center sm:min-h-[70dvh]"><div>{loadingFile ? <><Loader2 className="mx-auto size-8 animate-spin text-brand" /><p className="mt-4 text-sm font-bold">Preparing the viewer and offline copy…</p></> : <><FileWarning className="mx-auto size-8 text-warning" /><p className="mt-4 max-w-md text-sm font-bold">{fileError || "This document does not have a complete file yet."}</p>{document.current_version && <button type="button" className="primary-button mx-auto mt-5" onClick={retryOpen}><FileCheck2 className="size-4" /> Try again</button>}</>}</div></div>}
      </section>
      <p className="mt-3 text-center text-xs text-muted">{source ? `Opened from ${source === "local" ? "this device" : "the cloud and now saved offline"}. Use Open full screen to zoom with the phone's native viewer.` : "Trip Vault opens the document here first; downloading is optional."}</p>
      {fileMessage && <p role="status" className="mt-3 rounded-xl bg-success/10 p-3 text-sm font-bold text-success">{fileMessage}</p>}

      {showInfo && <ModalSheet eyebrow={documentPurposeLabel(document.purpose)} title="Document information" onClose={() => setShowInfo(false)}>
        <dl className="mt-6 grid gap-4 rounded-2xl bg-elevated p-4 text-sm sm:grid-cols-2"><div><dt className="text-xs font-bold text-muted">Title</dt><dd className="mt-1 font-bold">{document.title}</dd></div><div><dt className="text-xs font-bold text-muted">For</dt><dd className="mt-1 font-bold">{documentAssignmentLabel(document, travelerNames)}</dd></div><div><dt className="text-xs font-bold text-muted">Access</dt><dd className="mt-1 font-bold capitalize">{document.visibility === "private" ? "Only me" : document.visibility === "trip" ? "Signed-in trip members" : document.visibility.replaceAll("_", " ")}</dd></div><div><dt className="text-xs font-bold text-muted">Storage</dt><dd className="mt-1 inline-flex items-center gap-1.5 font-bold text-success"><ShieldCheck className="size-4" /> Private Supabase bucket</dd></div>{document.current_version && <><div><dt className="text-xs font-bold text-muted">File</dt><dd className="mt-1 break-all font-bold">{document.current_version.original_filename}</dd></div><div><dt className="text-xs font-bold text-muted">Size</dt><dd className="mt-1 font-bold">{(document.current_version.byte_size / 1_000_000).toFixed(2)} MB</dd></div></>}</dl>
        {document.sync_error && <p className="mt-4 rounded-xl bg-warning/10 p-3 text-sm font-bold text-warning">{document.sync_error === "permission" || document.sync_error === "schema" ? "Cloud setup or permission failed. Run the latest document migration in Supabase, then use Profile → Sync issues → Retry." : document.sync_error === "authentication" ? "Your cloud session needs refreshing. Sign out and back in; the device copy will remain." : "Cloud synchronization needs attention. Open Profile → Sync issues to retry or inspect it."}</p>}
        {url && <div className="mt-5 flex flex-wrap gap-2"><button type="button" disabled={removingLocal} onClick={() => window.confirm("Remove this verified copy from this device? The cloud original will remain.") && void removeLocal()} className="secondary-button"><HardDrive className="size-4" /> Remove device copy</button><a className="secondary-button" href={url} download={document.current_version?.original_filename}><Download className="size-4" /> Download a copy</a></div>}
        {canManage && <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-5"><label className="secondary-button cursor-pointer">{replaceMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />} Replace version<input className="sr-only" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) replaceMutation.mutate(file); }} /></label><button type="button" className="secondary-button text-danger" disabled={archiveMutation.isPending} onClick={() => window.confirm("Archive this document? Its local copy remains on this device.") && archiveMutation.mutate()}><Archive className="size-4" /> Archive</button></div>}
        {(versionsQuery.data?.length ?? 0) > 0 && <section className="mt-5 border-t border-line pt-5"><p className="eyebrow">Version history</p><div className="mt-3 space-y-2">{versionsQuery.data?.map((version) => <div className={`flex items-center justify-between gap-3 rounded-xl p-3 text-sm ${version.id === document.current_version_id ? "bg-brand-soft" : "bg-elevated"}`} key={version.id}><div className="min-w-0"><p className="truncate font-bold">Version {version.version_number} · {version.original_filename}</p><p className="mt-1 text-xs text-muted">{new Date(version.created_at).toLocaleString()} · {(version.byte_size / 1_000_000).toFixed(2)} MB</p></div>{version.id === document.current_version_id && <span className="rounded-full bg-success/10 px-2 py-1 text-[.6rem] font-black uppercase text-success">Current</span>}</div>)}</div></section>}
        {(replaceMutation.error || archiveMutation.error || fileError) && <p role="alert" className="mt-4 rounded-xl bg-danger/10 p-3 text-sm font-bold text-danger">{replaceMutation.error instanceof Error ? replaceMutation.error.message : archiveMutation.error instanceof Error ? archiveMutation.error.message : fileError}</p>}
      </ModalSheet>}
    </>}
  </div></AppShell>;
}
