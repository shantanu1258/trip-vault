import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArrowLeft, Download, FileCheck2, FileUp, FileWarning, HardDrive, Loader2, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { ErrorCard, LoadingCard } from "../components/TripUi";
import { archiveDocument, downloadDocumentVersion, getVaultDocument, listDocumentVersions, listMembers, replaceDocumentVersion } from "../features/workspace/api";
import { localProfileId } from "../features/sync/localSync";
import { readOfflineFile, removeDocumentOfflineCopy, storeOfflineFile } from "../lib/storage/offlineFiles";

export function DocumentPage() {
  const { tripId = "", documentId = "" } = useParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const query = useQuery({ queryKey: ["document", documentId], queryFn: () => getVaultDocument(documentId), enabled: Boolean(documentId) });
  const membersQuery = useQuery({ queryKey: ["members", tripId], queryFn: () => listMembers(tripId), enabled: Boolean(tripId) });
  const versionsQuery = useQuery({ queryKey: ["document-versions", documentId], queryFn: () => listDocumentVersions(documentId), enabled: Boolean(documentId) && navigator.onLine });
  const [url, setUrl] = useState("");
  const [loadingFile, setLoadingFile] = useState(false);
  const [fileError, setFileError] = useState("");
  const [fileMessage, setFileMessage] = useState("");
  const [removingLocal, setRemovingLocal] = useState(false);
  const [source, setSource] = useState<"local" | "cloud" | "">("");
  const [userId, setUserId] = useState("");
  const document = query.data;
  const role = membersQuery.data?.find((member) => member.user_id === userId)?.role;
  const canManage = Boolean(document && (document.uploaded_by === userId || role === "owner" || role === "editor"));
  const replaceMutation = useMutation({ mutationFn: (file: File) => replaceDocumentVersion(document!, file), onSuccess: async () => { setUrl(""); await Promise.all([queryClient.invalidateQueries({ queryKey: ["document", documentId] }), queryClient.invalidateQueries({ queryKey: ["document-versions", documentId] })]); } });
  const archiveMutation = useMutation({ mutationFn: () => archiveDocument(document!), onSuccess: async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ["documents", tripId] }), queryClient.invalidateQueries({ queryKey: ["documents"] })]); navigate(`/trips/${tripId}`); } });

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  useEffect(() => { void localProfileId().then((profileId) => setUserId(profileId ?? "")); }, []);
  useEffect(() => {
    if (!document?.current_version) return;
    let active = true;
    localProfileId().then(async (profileId) => {
      if (!profileId) return;
      const local = await readOfflineFile(profileId, document.current_version!.id);
      if (active && local) { setUrl(URL.createObjectURL(local)); setSource("local"); }
    });
    return () => { active = false; };
  }, [document]);

  const open = async () => {
    if (!document?.current_version || loadingFile) return;
    setLoadingFile(true); setFileError(""); setFileMessage("");
    try {
      const profileId = await localProfileId();
      if (!profileId) throw new Error("Sign in to open this document.");
      const local = await readOfflineFile(profileId, document.current_version.id);
      if (local) { setUrl(URL.createObjectURL(local)); setSource("local"); return; }
      if (!navigator.onLine) throw new Error("This file was not prepared on this device. Reconnect to download it.");
      const blob = await downloadDocumentVersion(document);
      await storeOfflineFile({ profileId, versionId: document.current_version.id, blob, sha256: document.current_version.sha256 });
      setUrl(URL.createObjectURL(blob)); setSource("cloud");
    } catch (error) { setFileError(error instanceof Error ? error.message : "The document could not be opened."); }
    finally { setLoadingFile(false); }
  };

  const removeLocal = async () => {
    if (!document?.current_version || removingLocal) return;
    setRemovingLocal(true); setFileError(""); setFileMessage("");
    try {
      const profileId = await localProfileId();
      if (!profileId) throw new Error("Sign in to change this device copy.");
      await removeDocumentOfflineCopy(profileId, document.current_version.id);
      if (url) URL.revokeObjectURL(url);
      setUrl(""); setSource(""); setFileMessage("Removed from this device. The cloud original remains available.");
      await queryClient.invalidateQueries({ queryKey: ["offline-packs"] });
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "The local copy could not be removed.");
    } finally {
      setRemovingLocal(false);
    }
  };

  return <AppShell><div className="mx-auto max-w-4xl">
    <Link className="tap-target inline-flex items-center gap-2 text-sm font-bold text-muted" to={`/trips/${tripId}`}><ArrowLeft className="size-4" /> Back to trip</Link>
    {query.isLoading && <LoadingCard label="Loading document" />}
    {query.error && <ErrorCard error={query.error} />}
    {document && <section className="surface-card page-enter mt-5 p-6 sm:p-8">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start"><div><p className="eyebrow">{document.purpose.replace("_", " ")} · {document.visibility.replaceAll("_", " ")}</p><h1 className="mt-2 font-display text-3xl font-black">{document.title}</h1>{document.current_version && <p className="mt-2 text-sm text-muted">{document.current_version.original_filename} · {(document.current_version.byte_size / 1_000_000).toFixed(2)} MB</p>}</div><span className="inline-flex items-center gap-2 self-start rounded-full bg-success/10 px-3 py-2 text-xs font-bold text-success"><ShieldCheck className="size-4" /> Private storage</span></div>
      {url ? <div className="mt-6"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><span className="inline-flex items-center gap-2 text-xs font-bold text-success"><FileCheck2 className="size-4" /> Verified {source === "local" ? "on this device" : "and saved offline"}</span><div className="flex flex-wrap gap-2"><button type="button" disabled={removingLocal} onClick={() => window.confirm("Remove this verified copy from this device? The cloud original will remain.") && void removeLocal()} className="secondary-button"><HardDrive className="size-4" /> Remove device copy</button><a className="secondary-button" href={url} download={document.current_version?.original_filename}><Download className="size-4" /> Download</a></div></div>{document.current_version?.mime_type === "application/pdf" ? <iframe title={document.title} className="h-[65dvh] w-full rounded-2xl border border-line bg-elevated" src={url} /> : <img alt={document.title} className="max-h-[70dvh] w-full rounded-2xl bg-elevated object-contain" src={url} />}</div> : <button type="button" onClick={open} disabled={loadingFile || !document.current_version} className="primary-button mt-6">{loadingFile ? <Loader2 className="size-4 animate-spin" /> : <FileCheck2 className="size-4" />} {document.current_version ? "Open and keep offline" : "Upload incomplete"}</button>}
      {canManage && <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-5"><label className="secondary-button cursor-pointer">{replaceMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />} Replace with new version<input className="sr-only" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) replaceMutation.mutate(file); }} /></label><button type="button" className="secondary-button text-danger" disabled={archiveMutation.isPending} onClick={() => window.confirm("Archive this document? Its local copy remains on this device.") && archiveMutation.mutate()}><Archive className="size-4" /> Archive</button></div>}
      {(versionsQuery.data?.length ?? 0) > 0 && <section className="mt-5 border-t border-line pt-5"><p className="eyebrow">Version history</p><div className="mt-3 space-y-2">{versionsQuery.data?.map((version) => <div className={`flex items-center justify-between gap-3 rounded-xl p-3 text-sm ${version.id === document.current_version_id ? "bg-brand-soft" : "bg-elevated"}`} key={version.id}><div className="min-w-0"><p className="truncate font-bold">Version {version.version_number} · {version.original_filename}</p><p className="mt-1 text-xs text-muted">{new Date(version.created_at).toLocaleString()} · {(version.byte_size / 1_000_000).toFixed(2)} MB</p></div>{version.id === document.current_version_id && <span className="rounded-full bg-success/10 px-2 py-1 text-[.6rem] font-black uppercase text-success">Current</span>}</div>)}</div></section>}
      {(replaceMutation.error || archiveMutation.error) && <p role="alert" className="mt-3 text-sm font-bold text-danger">{replaceMutation.error instanceof Error ? replaceMutation.error.message : archiveMutation.error instanceof Error ? archiveMutation.error.message : "Document change failed."}</p>}
      {fileError && <p role="alert" className="mt-4 flex gap-2 rounded-xl bg-danger/10 p-3 text-sm font-bold text-danger"><FileWarning className="size-4 shrink-0" />{fileError}</p>}
      {fileMessage && <p role="status" className="mt-4 rounded-xl bg-success/10 p-3 text-sm font-bold text-success">{fileMessage}</p>}
    </section>}
  </div></AppShell>;
}
