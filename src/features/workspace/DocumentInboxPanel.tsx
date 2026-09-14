import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CloudUpload, FilePlus2, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { ModalSheet } from "../../components/ModalSheet";
import { FileDropzone } from "../../components/FileDropzone";
import { localProfileId } from "../sync/localSync";
import { listTrips } from "../trips/api";
import { getErrorMessage } from "../trips/presentation";
import { associateAccountDocument, deleteAccountDocumentUpload, listAccountDocumentUploads, listMembers, listTravelers, retryAccountDocumentUpload, stageAccountDocument } from "./api";
import { documentKind, documentKinds, suggestedDocumentTitle, type DocumentKind } from "./documentModel";
import type { AccountDocumentUpload, DocumentAssignmentMode, DocumentVisibility } from "./types";

export function DocumentInboxPanel() {
  const queryClient = useQueryClient();
  const uploads = useQuery({ queryKey: ["account-document-uploads"], queryFn: listAccountDocumentUploads });
  const trips = useQuery({ queryKey: ["trips"], queryFn: () => listTrips() });
  const [selected, setSelected] = useState<AccountDocumentUpload | null>(null);
  const [selectedTripId, setSelectedTripId] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const stage = useMutation({
    mutationFn: stageAccountDocument,
    onSuccess: async (upload) => {
      setMessage(upload.stored_at
        ? "File saved to your private inbox. Attach it now or return later."
        : upload.sync_error
          ? "File saved on this device, but its cloud upload needs attention. Use Retry cloud below."
          : "File saved on this device. Its cloud upload is queued and will finish when you are connected.");
      await queryClient.invalidateQueries({ queryKey: ["account-document-uploads"] });
    }
  });
  const remove = useMutation({
    mutationFn: deleteAccountDocumentUpload,
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["account-document-uploads"] })
  });
  const retry = useMutation({
    mutationFn: retryAccountDocumentUpload,
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["account-document-uploads"] })
  });
  const submitUpload = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setMessage("");
    const formElement = event.currentTarget;
    const file = selectedFile;
    if (!file?.size) { setMessage("Choose a PDF or image first."); return; }
    stage.mutate(file, { onSuccess: () => { formElement.reset(); setSelectedFile(null); } });
  };
  const openAssociation = (upload: AccountDocumentUpload) => {
    setSelected(upload);
    setSelectedTripId(trips.data?.[0]?.id ?? "");
  };
  return <section className="surface-card p-5 sm:p-6">
    <span className="grid size-12 place-items-center rounded-2xl bg-brand-soft text-brand"><FilePlus2 className="size-5" /></span>
    <p className="eyebrow mt-5">Private document inbox</p>
    <h2 className="mt-1 font-display text-xl font-black">Upload first, organize later</h2>
    <p className="mt-3 text-sm leading-6 text-muted">The file is saved under this login before any trip association is attempted. Unfinished files stay here until you attach or delete them.</p>
    <form className="mt-5 space-y-3" onSubmit={submitUpload}>
      <FileDropzone name="inboxFile" label="PDF or image under 5 MB" prompt="Choose a private PDF or image" file={selectedFile} onFileChange={(file) => { setSelectedFile(file); setMessage(""); }} busy={stage.isPending} description="Save it now, then choose its trip and travelers when you are ready" />
      <button className="primary-button w-full" disabled={stage.isPending}>{stage.isPending ? <Loader2 className="size-4 animate-spin" /> : <CloudUpload className="size-4" />} Save privately</button>
    </form>
    {(message || stage.error || remove.error || retry.error) && <p role="status" className={`mt-3 rounded-xl p-3 text-sm font-bold ${stage.error || remove.error || retry.error ? "bg-danger/10 text-danger" : "bg-success/10 text-success"}`}>{stage.error || remove.error || retry.error ? getErrorMessage(stage.error || remove.error || retry.error) : message}</p>}
    <div className="mt-5 border-t border-line pt-4">
      <p className="eyebrow">Waiting for association</p>
      <div className="mt-3 space-y-2">{uploads.data?.map((upload) => {
        const needsOriginalFile = !upload.stored_at && !upload.can_retry;
        const canCheckCloud = !upload.stored_at && !upload.can_retry && upload.can_verify;
        const cloudStatus = upload.stored_at
          ? "stored privately"
          : upload.sync_error === "storage_missing"
            ? "cloud file missing"
            : canCheckCloud
              ? "cloud verification needed"
              : upload.sync_error
                ? "cloud action required"
                : "cloud upload pending";
        return <div className="rounded-2xl bg-elevated p-4" key={upload.id}>
          <div className="flex items-start gap-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-extrabold">{upload.original_filename}</p><p className="mt-1 text-xs text-muted">{(upload.byte_size / 1_000_000).toFixed(2)} MB · {cloudStatus}</p>{needsOriginalFile && <p className="mt-2 text-xs font-bold leading-5 text-warning">This device does not have the original file. Delete this unfinished entry and select the file again here, or retry on the device where it was added.</p>}</div><button type="button" className="tap-target grid size-9 place-items-center text-danger" disabled={remove.isPending} onClick={() => window.confirm(`Delete ${upload.original_filename} permanently?`) && remove.mutate(upload)} aria-label={`Delete ${upload.original_filename}`}><Trash2 className="size-4" /></button></div>
          <div className="mt-3 flex flex-wrap items-center gap-2">{upload.association_pending ? <span className="rounded-full bg-brand-soft px-3 py-2 text-xs font-bold text-brand">Trip details saved</span> : upload.stored_at && <button type="button" className="secondary-button min-h-9 px-3 py-2 text-xs" onClick={() => openAssociation(upload)}>Attach to trip</button>}{upload.sync_state === "queued" && (upload.can_retry || canCheckCloud) && <button type="button" className="secondary-button min-h-9 px-3 py-2 text-xs" disabled={retry.isPending || !navigator.onLine} onClick={() => retry.mutate(upload.id)}><RefreshCw className="size-3.5" /> {upload.association_pending ? "Finish association" : upload.can_retry ? "Retry cloud" : "Check cloud"}</button>}</div>
        </div>;
      })}{uploads.isLoading && <p className="flex items-center gap-2 text-sm text-muted"><Loader2 className="size-4 animate-spin" /> Opening inbox</p>}{uploads.data?.length === 0 && <p className="text-sm text-muted">No unfinished uploads.</p>}</div>
    </div>
    {selected && <AssociateInboxDocumentSheet upload={selected} tripId={selectedTripId} onTripChange={setSelectedTripId} trips={trips.data ?? []} onClose={() => setSelected(null)} onAssociated={async () => { setSelected(null); await Promise.all([queryClient.invalidateQueries({ queryKey: ["account-document-uploads"] }), queryClient.invalidateQueries({ queryKey: ["documents"] }), queryClient.invalidateQueries({ queryKey: ["documents", selectedTripId] })]); }} />}
  </section>;
}

function AssociateInboxDocumentSheet({ upload, tripId, onTripChange, trips, onClose, onAssociated }: { upload: AccountDocumentUpload; tripId: string; onTripChange: (id: string) => void; trips: Awaited<ReturnType<typeof listTrips>>; onClose: () => void; onAssociated: () => void | Promise<void> }) {
  const [kind, setKind] = useState<DocumentKind>("other");
  const [assignmentMode, setAssignmentMode] = useState<DocumentAssignmentMode>("unassigned");
  const [selectedTravelerIds, setSelectedTravelerIds] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<DocumentVisibility>("trip");
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [customTitle, setCustomTitle] = useState("");
  const [message, setMessage] = useState("");
  const travelers = useQuery({ queryKey: ["travelers", tripId], queryFn: () => listTravelers(tripId), enabled: Boolean(tripId) });
  const profileId = useQuery({ queryKey: ["local-profile-id"], queryFn: async () => (await localProfileId()) ?? null });
  const members = useQuery({ queryKey: ["members", tripId], queryFn: () => listMembers(tripId), enabled: Boolean(tripId) });
  const currentRole = members.data?.find((member) => member.user_id === profileId.data)?.role;
  const canShare = currentRole === "owner" || currentRole === "editor";
  const checkingPermissions = Boolean(tripId) && (profileId.isPending || members.isPending);
  const selectedTrip = trips.find((trip) => trip.id === tripId);
  const defaultTitle = useMemo(() => suggestedDocumentTitle(kind, assignmentMode, selectedTravelerIds, travelers.data ?? [], selectedTrip?.title), [assignmentMode, kind, selectedTravelerIds, selectedTrip?.title, travelers.data]);
  const associate = useMutation({ mutationFn: associateAccountDocument, onSuccess: onAssociated });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setMessage("");
    if (!tripId) { setMessage("Choose a trip."); return; }
    if (assignmentMode === "selected" && !selectedTravelerIds.length) { setMessage("Choose at least one traveler, or select Assign later."); return; }
    const effectiveVisibility: DocumentVisibility = canShare ? visibility : "private";
    const memberIds = new Set((members.data ?? []).map((member) => member.user_id));
    const validSelectedUserIds = effectiveVisibility === "selected_members" ? selectedUserIds.filter((id) => memberIds.has(id)) : [];
    if (effectiveVisibility === "selected_members" && !validSelectedUserIds.length) { setMessage("Choose at least one signed-in member."); return; }
    if (effectiveVisibility === "selected_members" && validSelectedUserIds.length !== selectedUserIds.length) { setMessage("Every selected member must belong to this trip."); return; }
    const option = documentKind(kind);
    const form = new FormData(event.currentTarget);
    associate.mutate({ upload, tripId, title: customTitle.trim() || defaultTitle, category: option.category, purpose: option.purpose, assignmentMode, visibility: effectiveVisibility, travelerIds: selectedTravelerIds, selectedUserIds: validSelectedUserIds, shortLabel: String(form.get("shortLabel") ?? "").trim() || undefined });
  };
  return <ModalSheet eyebrow="Private document inbox" title="Attach uploaded file" onClose={onClose}><form className="mt-6 space-y-4" onSubmit={submit}>
    <div className="rounded-2xl bg-elevated p-4"><p className="truncate font-extrabold">{upload.original_filename}</p><p className="mt-1 text-xs text-muted">The private file already exists; this step only adds trip metadata.</p></div>
    <label className="form-label">Trip<select className="form-input" value={tripId} onChange={(event) => { onTripChange(event.target.value); setSelectedTravelerIds([]); setVisibility("trip"); setSelectedUserIds([]); }}><option value="">Choose a trip</option>{trips.map((trip) => <option value={trip.id} key={trip.id}>{trip.title}</option>)}</select></label>
    <label className="form-label">Document type<select className="form-input" value={kind} onChange={(event) => { const next = event.target.value as DocumentKind; setKind(next); setAssignmentMode(documentKind(next).defaultAssignment); setSelectedTravelerIds([]); }}>{documentKinds.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
    <fieldset className="rounded-2xl border border-line p-4"><legend className="px-1 text-sm font-bold">Who is it for?</legend><div className="mt-2 grid gap-2 sm:grid-cols-3">{([{"value":"shared","label":"Everyone"},{"value":"selected","label":"Traveler(s)"},{"value":"unassigned","label":"Assign later"}] as const).map((option) => <label key={option.value} className={`cursor-pointer rounded-xl border p-3 text-sm font-bold ${assignmentMode === option.value ? "border-brand bg-brand-soft" : "border-line"}`}><input className="sr-only" type="radio" checked={assignmentMode === option.value} onChange={() => { setAssignmentMode(option.value); if (option.value !== "selected") setSelectedTravelerIds([]); }} />{option.label}</label>)}</div>{assignmentMode === "selected" && <div className="mt-3 grid gap-2 sm:grid-cols-2">{travelers.data?.map((traveler) => <label className="flex items-center gap-2 rounded-xl bg-elevated p-3 text-sm font-bold" key={traveler.id}><input type="checkbox" checked={selectedTravelerIds.includes(traveler.id)} onChange={(event) => setSelectedTravelerIds((ids) => event.target.checked ? [...ids, traveler.id] : ids.filter((id) => id !== traveler.id))} />{traveler.display_name}</label>)}</div>}</fieldset>
    <label className="form-label">Document name (optional)<input className="form-input" value={customTitle} onChange={(event) => setCustomTitle(event.target.value)} placeholder="Leave empty to use type, traveler, and trip" /></label>
    <div className="rounded-xl bg-brand-soft p-3 text-sm"><span className="text-muted">Saved name:</span> <strong>{customTitle.trim() || defaultTitle}</strong></div>
    <label className="form-label">Short label (optional)<input className="form-input" name="shortLabel" placeholder="Seat, bag, ticket, or reference detail" /></label>
    {checkingPermissions ? <p className="flex items-center gap-2 rounded-2xl bg-elevated p-4 text-sm text-muted"><Loader2 className="size-4 animate-spin" /> Checking your trip access</p> : canShare ? <><label className="form-label">Who can open it?<select className="form-input" name="visibility" value={visibility} onChange={(event) => { const next = event.target.value as DocumentVisibility; setVisibility(next); if (next !== "selected_members") setSelectedUserIds([]); }}><option value="private">Only me</option><option value="trip">Everyone signed in to this trip</option><option value="selected_members">Selected signed-in members</option></select></label>{visibility === "selected_members" && <fieldset className="rounded-2xl border border-line p-4"><legend className="px-1 text-sm font-bold">Selected signed-in members</legend><div className="mt-2 space-y-2">{members.data?.map((member) => <label key={member.user_id} className="flex items-center gap-3 text-sm"><input type="checkbox" name="selectedUserIds" value={member.user_id} checked={selectedUserIds.includes(member.user_id)} onChange={(event) => setSelectedUserIds((ids) => event.target.checked ? [...new Set([...ids, member.user_id])] : ids.filter((id) => id !== member.user_id))} className="size-4" />{member.display_name}</label>)}{members.isSuccess && !members.data.length && <p className="text-xs text-muted">No signed-in trip members are available.</p>}{members.error && <p className="text-xs font-bold text-danger">{getErrorMessage(members.error)}</p>}</div></fieldset>}</> : <><input type="hidden" name="visibility" value="private" /><p className="rounded-2xl bg-brand-soft p-4 text-sm text-muted">Only you can open this document. Your trip role does not allow sharing it with other signed-in members.</p></>}
    <p className="text-xs leading-5 text-muted">This inbox file stays private until you attach it. The resulting Vault document uses the access choice above and can still be attached to a timeline event.</p>
    {(message || associate.error) && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm font-bold text-danger">{message || getErrorMessage(associate.error)}</p>}
    <button className="primary-button w-full" disabled={associate.isPending || !tripId || checkingPermissions}>{associate.isPending ? <Loader2 className="size-4 animate-spin" /> : <FilePlus2 className="size-4" />} Attach to trip</button>
  </form></ModalSheet>;
}
