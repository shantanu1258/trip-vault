import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, FilePlus2, FileText, FileUp, Loader2, Paperclip, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ModalSheet } from "../../components/ModalSheet";
import type { ItineraryItem } from "../trips/types";
import { attachDocumentsToEvent, listEventDocumentLinks, listVaultDocuments, reorderEventDocuments, unlinkDocumentFromEvent, uploadDocument } from "./api";

export function EventDocuments({ item, canEdit }: { item: ItineraryItem; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [picking, setPicking] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [uploadResults, setUploadResults] = useState<string[]>([]);
  const linksQuery = useQuery({ queryKey: ["event-documents", item.id], queryFn: () => listEventDocumentLinks(item.id) });
  const documentsQuery = useQuery({ queryKey: ["documents", item.trip_id], queryFn: () => listVaultDocuments(item.trip_id), enabled: picking });
  const attachMutation = useMutation({ mutationFn: (ids: string[]) => attachDocumentsToEvent(item, ids), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["event-documents", item.id] }); setPicking(false); } });
  const unlinkMutation = useMutation({ mutationFn: (documentId: string) => unlinkDocumentFromEvent(item.id, documentId), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["event-documents", item.id] }) });
  const reorderMutation = useMutation({ mutationFn: (ids: string[]) => reorderEventDocuments(item.id, ids), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["event-documents", item.id] }) });
  const links = linksQuery.data ?? [];

  const attach = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const ids = new FormData(event.currentTarget).getAll("documents").map(String);
    if (ids.length) attachMutation.mutate(ids);
  };

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploadingFiles(true); const results: string[] = []; const uploadedIds: string[] = [];
    for (const file of Array.from(files)) {
      try {
        const document = await uploadDocument({ tripId: item.trip_id, title: file.name.replace(/\.[^.]+$/, ""), category: "other", purpose: "other", visibility: "trip", file });
        uploadedIds.push(document.id); results.push(`${file.name}: uploaded`);
      } catch (error) { results.push(`${file.name}: ${error instanceof Error ? error.message : "failed"}`); }
    }
    if (uploadedIds.length) await attachDocumentsToEvent(item, uploadedIds);
    setUploadResults(results); setUploadingFiles(false);
    await Promise.all([queryClient.invalidateQueries({ queryKey: ["event-documents", item.id] }), queryClient.invalidateQueries({ queryKey: ["documents", item.trip_id] })]);
  };

  return (
    <div className="mt-4 border-t border-line pt-4">
      <div className="flex items-center justify-between gap-3"><p className="flex items-center gap-2 text-xs font-bold text-muted"><Paperclip className="size-4" /> {links.length} document{links.length === 1 ? "" : "s"}</p>{canEdit && <div className="flex items-center"><label className="tap-target inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-full px-3 text-xs font-extrabold text-brand">{uploadingFiles ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />} Upload<input className="sr-only" type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" disabled={uploadingFiles} onChange={(event) => uploadFiles(event.currentTarget.files)} /></label><button type="button" onClick={() => setPicking(true)} className="tap-target inline-flex min-h-9 items-center gap-1 rounded-full px-3 text-xs font-extrabold text-brand"><FilePlus2 className="size-4" /> Attach</button></div>}</div>
      {links.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{(expanded ? links : links.slice(0, 3)).map((link, index) => <span key={link.document_id} className="inline-flex items-center rounded-full border border-line bg-elevated"><Link className="tap-target inline-flex min-h-9 items-center gap-1.5 pl-3 pr-2 text-xs font-bold" to={`/trips/${item.trip_id}/documents/${link.document_id}`}><FileText className="size-3.5" />{link.label || link.document.title}</Link>{canEdit && expanded && <><button disabled={index === 0 || reorderMutation.isPending} type="button" onClick={() => { const ids = links.map((row) => row.document_id); [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]]; reorderMutation.mutate(ids); }} className="tap-target grid min-h-9 min-w-9 place-items-center border-l border-line text-muted" aria-label={`Move ${link.document.title} earlier`}><ArrowUp className="size-3" /></button><button disabled={index === links.length - 1 || reorderMutation.isPending} type="button" onClick={() => { const ids = links.map((row) => row.document_id); [ids[index], ids[index + 1]] = [ids[index + 1], ids[index]]; reorderMutation.mutate(ids); }} className="tap-target grid min-h-9 min-w-9 place-items-center border-l border-line text-muted" aria-label={`Move ${link.document.title} later`}><ArrowDown className="size-3" /></button></>}{canEdit && <button type="button" onClick={() => window.confirm(`Unlink ${link.document.title} from this event? The Vault document will remain.`) && unlinkMutation.mutate(link.document_id)} className="tap-target grid min-h-9 min-w-9 place-items-center border-l border-line text-muted hover:text-danger" aria-label={`Unlink ${link.document.title}`}><Trash2 className="size-3.5" /></button>}</span>)}{links.length > 3 && <button type="button" onClick={() => setExpanded((value) => !value)} className="rounded-full bg-brand-soft px-3 py-2 text-xs font-bold text-brand">{expanded ? "Show less" : `+${links.length - 3} more`}</button>}</div>}
      {uploadResults.length > 0 && <div role="status" className="mt-3 rounded-xl bg-elevated p-3 text-xs text-muted">{uploadResults.map((result) => <p key={result}>{result}</p>)}</div>}
      {picking && <ModalSheet eyebrow={item.title} title="Attach Vault documents" onClose={() => setPicking(false)}><form onSubmit={attach} className="mt-6"><div className="max-h-80 space-y-2 overflow-auto">{documentsQuery.isLoading && <p className="flex items-center gap-2 text-sm text-muted"><Loader2 className="size-4 animate-spin" /> Loading documents</p>}{documentsQuery.data?.map((document) => { const attached = links.some((link) => link.document_id === document.id); const inherited = Boolean(item.booking_id && document.booking_id === item.booking_id); const unavailable = attached || inherited; return <label key={document.id} className={unavailable ? "flex items-center gap-3 rounded-2xl border border-success/30 bg-success/5 p-4 opacity-60" : "flex items-center gap-3 rounded-2xl border border-line p-4"}><input type="checkbox" name="documents" value={document.id} disabled={unavailable} className="size-4" /><span className="min-w-0"><strong className="block truncate text-sm">{document.title}</strong><span className="mt-1 block text-xs capitalize text-muted">{document.purpose.replace("_", " ")}{attached ? " · already attached" : inherited ? " · already available through booking" : ""}</span></span></label>; })}{documentsQuery.data?.length === 0 && <p className="rounded-2xl border border-dashed border-line p-5 text-sm text-muted">Upload a document to this trip first, then attach it here.</p>}</div>{attachMutation.error && <p role="alert" className="mt-4 text-sm font-bold text-danger">Could not attach the selected documents.</p>}<button className="primary-button mt-5 w-full" disabled={attachMutation.isPending}>{attachMutation.isPending && <Loader2 className="size-4 animate-spin" />} Attach selected</button></form></ModalSheet>}
    </div>
  );
}
