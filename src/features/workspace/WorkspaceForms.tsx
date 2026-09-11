import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Clipboard, FileUp, Loader2, NotebookPen, RefreshCw, ShieldCheck, TicketCheck, Trash2, UserPlus, UsersRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { z } from "zod";
import { ModalSheet } from "../../components/ModalSheet";
import { LocalQrCode } from "../../components/LocalQrCode";
import { getErrorMessage } from "../trips/presentation";
import type { Trip } from "../trips/types";
import { firstValidationMessage, isoToLocalDateTime, localDateTimeToIso } from "../trips/validation";
import {
  addRequirement,
  addTraveler,
  createInvitation,
  listInvitations,
  listRequirementAssigneeIds,
  listVaultDocuments,
  revokeInvitation,
  updateBooking,
  updateNote,
  updateRequirement,
  updateTraveler,
  DuplicateDocumentError,
  uploadDocument
} from "./api";
import { addNote } from "./api";
import { bookingTypes, requirementStatuses, requirementTypes, type Booking, type DocumentAssignmentMode, type DocumentVisibility, type Requirement, type RequirementInput, type Traveler, type TripMember, type TripNote } from "./types";
import { documentKind, documentKinds, type DocumentKind } from "./documentModel";
import { ParticipantSelector } from "./ParticipantSelector";
import { useFormDraft } from "../../lib/forms/useFormDraft";
import { AddEventForm } from "../timeline/AddEventForm";
import { VendorPicker } from "../metadata/VendorPicker";
import { TimeZoneAutocomplete } from "../../components/TimeZoneAutocomplete";

const requiredText = (message: string, max = 160) => z.string().trim().min(1, message).max(max);

const bookingSchema = z.object({
  type: z.enum(bookingTypes), title: requiredText("Name this booking."), provider: z.string().trim().max(160).optional(),
  referenceCode: z.string().trim().max(160).optional(), startsAt: z.string().optional(), endsAt: z.string().optional(),
  timezone: z.string().trim().optional(), location: z.string().trim().max(220).optional(), notes: z.string().trim().max(2000).optional(),
  journeyScope: z.enum(["domestic", "international"]).optional(), bookedViaName: z.string().trim().max(160).optional(),
  bookedViaUrl: z.string().trim().url("Use a complete booking website address.").or(z.literal("")).optional(), contactName: z.string().trim().max(160).optional(), contactPhone: z.string().trim().max(40).optional()
}).superRefine((value, context) => {
  if (value.startsAt && value.endsAt && value.endsAt < value.startsAt) context.addIssue({ code: "custom", path: ["endsAt"], message: "End time cannot be before start time." });
});

export function AddBookingForm({ trip, travelers, preferredTravelerId, onClose }: { trip: Trip; travelers: Traveler[]; preferredTravelerId?: string; onClose: () => void }) {
  return <AddEventForm trip={trip} travelers={travelers} preferredTravelerId={preferredTravelerId} onClose={onClose} />;
}

export function EditBookingForm({ trip, booking, travelers, selectedTravelerIds, onClose }: { trip: Trip; booking: Booking; travelers: Traveler[]; selectedTravelerIds: string[]; onClose: () => void }) {
  const queryClient = useQueryClient(); const [message, setMessage] = useState("");
  const mutation = useMutation({ mutationFn: updateBooking, onSuccess: async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ["booking", booking.id] }), queryClient.invalidateQueries({ queryKey: ["bookings", trip.id] }), queryClient.invalidateQueries({ queryKey: ["booking-traveler-ids", booking.id] })]); onClose(); } });
  const timezone = booking.source_timezone ?? trip.primary_timezone;
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setMessage(""); const form = new FormData(event.currentTarget); const parsed = bookingSchema.safeParse(Object.fromEntries(form)); if (!parsed.success) { setMessage(firstValidationMessage(parsed.error)); return; } const zone = parsed.data.timezone || timezone; try { mutation.mutate({ ...parsed.data, id: booking.id, tripId: trip.id, version: booking.version, startsAt: parsed.data.startsAt ? localDateTimeToIso(parsed.data.startsAt, zone) : undefined, endsAt: parsed.data.endsAt ? localDateTimeToIso(parsed.data.endsAt, zone) : undefined, timezone: zone, travelerIds: form.getAll("travelerIds").map(String) }); } catch (error) { setMessage(getErrorMessage(error)); } };
  return <ModalSheet eyebrow={trip.title} title="Edit booking" onClose={onClose}><form className="mt-6 space-y-4" onSubmit={submit}><input type="hidden" name="type" value={booking.type} /><label className="form-label">Type<input className="form-input capitalize opacity-70" value={booking.type} readOnly /></label><label className="form-label">Booking title<input autoFocus className="form-input" name="title" defaultValue={booking.title} /></label><div className="grid gap-4 sm:grid-cols-2"><label className="form-label">Provider<input className="form-input" name="provider" defaultValue={booking.provider ?? ""} /></label><label className="form-label">Reference / PNR<input className="form-input uppercase" name="referenceCode" defaultValue={booking.reference_code ?? ""} /></label></div>{booking.journey_scope && <label className="form-label">Journey type<select className="form-input" name="journeyScope" defaultValue={booking.journey_scope}><option value="domestic">Domestic</option><option value="international">International</option></select></label>}<div className="grid gap-4 sm:grid-cols-2"><label className="form-label">Starts<input className="form-input" name="startsAt" type="datetime-local" defaultValue={isoToLocalDateTime(booking.start_at, timezone)} /></label><label className="form-label">Ends<input className="form-input" name="endsAt" type="datetime-local" defaultValue={isoToLocalDateTime(booking.end_at, timezone)} /></label></div><label className="form-label">Booking time zone<TimeZoneAutocomplete name="timezone" defaultValue={timezone} /></label><label className="form-label">Location<input className="form-input" name="location" defaultValue={booking.location?.address ?? booking.location?.label ?? ""} /></label><div className="grid gap-4 sm:grid-cols-2"><label className="form-label">Booked via<VendorPicker defaultValue={booking.booked_via_name ?? ""} /></label><label className="form-label">Booking website<input className="form-input" type="url" name="bookedViaUrl" defaultValue={booking.booked_via_url ?? ""} /></label><label className="form-label">Contact name<input className="form-input" name="contactName" defaultValue={booking.contact_name ?? ""} /></label><label className="form-label">Phone<input className="form-input" type="tel" name="contactPhone" defaultValue={booking.contact_phone ?? ""} /></label></div><label className="form-label">Notes<textarea className="form-input min-h-24" name="notes" defaultValue={typeof booking.details.notes === "string" ? booking.details.notes : ""} /></label><ParticipantSelector travelers={travelers} selectedTravelerIds={selectedTravelerIds} explicitAll />{(message || mutation.error) && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm font-bold text-danger">{message || getErrorMessage(mutation.error)}</p>}<button className="primary-button w-full" disabled={mutation.isPending}>{mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <TicketCheck className="size-4" />} Save changes</button></form></ModalSheet>;
}

export function AddTravelerForm({ trip, onClose }: { trip: Trip; onClose: () => void }) {
  const queryClient = useQueryClient(); const [message, setMessage] = useState("");
  const draft = useFormDraft(`traveler:new:${trip.id}`);
  const mutation = useMutation({ mutationFn: addTraveler, onSuccess: async () => { draft.clearDraft(); await queryClient.invalidateQueries({ queryKey: ["travelers", trip.id] }); onClose(); } });
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const displayName = String(form.get("displayName") ?? "").trim(); if (!displayName) { setMessage("Enter the traveler's name."); return; } mutation.mutate({ tripId: trip.id, displayName, isMinor: form.get("isMinor") === "on" }); };
  return <ModalSheet eyebrow={trip.title} title="Add a traveler" onClose={onClose}><form ref={draft.formRef} onSubmit={submit} className="mt-6 space-y-4"><label className="form-label">Traveler name<input autoFocus className="form-input" name="displayName" /></label><label className="flex items-start gap-3 rounded-2xl border border-line p-4 text-sm"><input className="mt-1 size-4" type="checkbox" name="isMinor" /><span><strong className="block">This traveler is a child</strong><span className="mt-1 block text-muted">This is a workflow label only and does not infer legal authority.</span></span></label>{(message || mutation.error) && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm font-bold text-danger">{message || getErrorMessage(mutation.error)}</p>}<button className="primary-button w-full" disabled={mutation.isPending}>{mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />} Add traveler</button></form></ModalSheet>;
}

export function EditTravelerForm({ trip, traveler, onClose }: { trip: Trip; traveler: Traveler; onClose: () => void }) {
  const queryClient = useQueryClient(); const [message, setMessage] = useState("");
  const mutation = useMutation({ mutationFn: updateTraveler, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["travelers", trip.id] }); onClose(); } });
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const displayName = String(form.get("displayName") ?? "").trim(); if (!displayName) { setMessage("Enter the traveler's name."); return; } mutation.mutate({ traveler, displayName, isMinor: form.get("isMinor") === "on" }); };
  return <ModalSheet eyebrow={trip.title} title="Edit traveler" onClose={onClose}><form onSubmit={submit} className="mt-6 space-y-4"><label className="form-label">Traveler name<input autoFocus className="form-input" name="displayName" defaultValue={traveler.display_name} /></label><label className="flex items-start gap-3 rounded-2xl border border-line p-4 text-sm"><input className="mt-1 size-4" type="checkbox" name="isMinor" defaultChecked={traveler.is_minor} /><span><strong className="block">This traveler is a child</strong><span className="mt-1 block text-muted">A workflow label only; it does not infer legal authority.</span></span></label>{(message || mutation.error) && <p role="alert" className="text-sm font-bold text-danger">{message || getErrorMessage(mutation.error)}</p>}<button className="primary-button w-full" disabled={mutation.isPending}><UserPlus className="size-4" /> Save traveler</button></form></ModalSheet>;
}

export function ShareTripForm({ trip, travelers, onClose }: { trip: Trip; travelers: Traveler[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [targetType, setTargetType] = useState<"traveler" | "collaborator">("traveler"); const [message, setMessage] = useState(""); const [code, setCode] = useState(""); const [copied, setCopied] = useState(false);
  const invitations = useQuery({ queryKey: ["invitations", trip.id], queryFn: () => listInvitations(trip.id), enabled: navigator.onLine });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["invitations", trip.id] });
  const mutation = useMutation({ mutationFn: createInvitation, onSuccess: async (createdCode) => { setCode(createdCode); await refresh(); } });
  const revoke = useMutation({ mutationFn: revokeInvitation, onSuccess: refresh });
  const replace = useMutation({ mutationFn: async (invitation: NonNullable<typeof invitations.data>[number]) => { await revokeInvitation(invitation.id); return createInvitation({ tripId: trip.id, targetType: invitation.target_type, travelerId: invitation.traveler_id ?? undefined, role: invitation.role }); }, onSuccess: async (createdCode) => { setCode(createdCode); await refresh(); } });
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setMessage(""); const form = new FormData(event.currentTarget); const travelerId = String(form.get("travelerId") ?? ""); if (targetType === "traveler" && !travelerId) { setMessage("Select the person this code belongs to."); return; } mutation.mutate({ tripId: trip.id, targetType, travelerId: targetType === "traveler" ? travelerId : undefined, role: String(form.get("role")) as "editor" | "viewer" }); };
  const joinUrl = code ? `${window.location.origin}/join?code=${encodeURIComponent(code)}` : "";
  const copy = async (value = code) => { await navigator.clipboard.writeText(value); setCopied(true); };
  return <ModalSheet eyebrow={trip.title} title="Share with a private code" onClose={onClose}>{code ? <div className="mt-7 text-center"><LocalQrCode value={joinUrl} /><p className="mt-5 text-sm text-muted">The recipient signs in, scans this QR, and confirms the prefilled one-time code. It expires after 14 days and cannot be reused.</p><button onClick={() => copy(code)} type="button" className="mt-5 inline-flex items-center gap-3 rounded-2xl bg-brand px-5 py-4 font-mono text-xl font-black tracking-[0.12em] text-surface">{code} {copied ? <Check className="size-5" /> : <Clipboard className="size-5" />}</button><button type="button" className="secondary-button mx-auto mt-3" onClick={() => copy(joinUrl)}><Clipboard className="size-4" /> Copy private link</button><button type="button" className="secondary-button mx-auto mt-3" onClick={() => { setCode(""); setCopied(false); }}>Create another code</button></div> : <form onSubmit={submit} className="mt-6 space-y-4"><div className="grid grid-cols-2 rounded-2xl bg-elevated p-1"><button type="button" onClick={() => setTargetType("traveler")} className={`tap-target rounded-xl text-sm font-bold ${targetType === "traveler" ? "bg-surface shadow-soft" : "text-muted"}`}>Traveler</button><button type="button" onClick={() => setTargetType("collaborator")} className={`tap-target rounded-xl text-sm font-bold ${targetType === "collaborator" ? "bg-surface shadow-soft" : "text-muted"}`}>Non-traveling helper</button></div>{targetType === "traveler" && <label className="form-label">Who is this code for?<select className="form-input" name="travelerId" defaultValue=""><option value="" disabled>Select traveler</option>{travelers.map((traveler) => <option key={traveler.id} value={traveler.id}>{traveler.display_name}</option>)}</select></label>}<label className="form-label">App access<select className="form-input" name="role" defaultValue="viewer"><option value="viewer">Viewer — can view and manage own documents</option><option value="editor">Editor — can also edit the shared trip</option></select></label><p className="rounded-2xl bg-brand-soft p-4 text-sm leading-6 text-muted">The recipient must sign in before the one-time code can reveal or join the trip.</p>{(message || mutation.error) && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm font-bold text-danger">{message || getErrorMessage(mutation.error)}</p>}<button className="primary-button w-full" disabled={mutation.isPending || !navigator.onLine}>{mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <UsersRound className="size-4" />} Generate one-time code</button></form>}
    <section className="mt-7 border-t border-line pt-5"><div className="flex items-center justify-between"><div><p className="eyebrow">Invitation history</p><p className="mt-1 text-sm text-muted">Codes themselves are intentionally never stored in readable form.</p></div>{invitations.isFetching && <Loader2 className="size-4 animate-spin text-muted" />}</div><div className="mt-3 space-y-2">{invitations.data?.slice(0, 10).map((invitation) => { const traveler = travelers.find((item) => item.id === invitation.traveler_id); const status = invitation.redeemed_at ? "used" : invitation.revoked_at ? "revoked" : new Date(invitation.expires_at) <= new Date() ? "expired" : "active"; return <div key={invitation.id} className="rounded-2xl border border-line bg-elevated p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-bold">{invitation.target_type === "collaborator" ? "Non-traveling helper" : traveler?.display_name ?? "Traveler"} · {invitation.role}</p><p className="mt-1 text-xs capitalize text-muted">{status} · expires {new Date(invitation.expires_at).toLocaleDateString()}</p></div>{status === "active" && <div className="flex"><button type="button" disabled={replace.isPending} onClick={() => replace.mutate(invitation)} className="tap-target grid size-9 place-items-center text-brand" aria-label="Replace invitation code"><RefreshCw className="size-3.5" /></button><button type="button" disabled={revoke.isPending} onClick={() => revoke.mutate(invitation.id)} className="tap-target grid size-9 place-items-center text-danger" aria-label="Revoke invitation"><Trash2 className="size-3.5" /></button></div>}</div></div>; })}{invitations.data?.length === 0 && <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">No invitations yet.</p>}{!navigator.onLine && <p className="text-sm text-warning">Invitation history and changes require a connection.</p>}</div></section>
  </ModalSheet>;
}

export function AddRequirementForm({ trip, travelers = [], requirement, preferredTravelerId, onClose }: { trip: Trip; travelers?: Traveler[]; requirement?: Requirement; preferredTravelerId?: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [type, setType] = useState<Requirement["type"]>(requirement?.type ?? "visa");
  const [message, setMessage] = useState("");
  const draft = useFormDraft(`requirement:${requirement?.id ?? "new"}:${trip.id}`);
  const assignees = useQuery({ queryKey: ["requirement-assignee-ids", requirement?.id], queryFn: () => listRequirementAssigneeIds(requirement!.id, trip.id), enabled: Boolean(requirement) });
  const documents = useQuery({ queryKey: ["documents", trip.id], queryFn: () => listVaultDocuments(trip.id) });
  const mutation = useMutation({
    mutationFn: (input: RequirementInput) => requirement ? updateRequirement({ ...input, id: requirement.id, version: requirement.version }) : addRequirement(input),
    onSuccess: async () => {
      draft.clearDraft();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["requirements", trip.id] }),
        queryClient.invalidateQueries({ queryKey: ["requirement-assignee-ids", requirement?.id] })
      ]);
      onClose();
    }
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setMessage("");
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") ?? "").trim();
    const country = String(form.get("destinationCountryCode") ?? "").trim().toUpperCase();
    const official = String(form.get("officialGuidanceUrl") ?? "").trim();
    const travelerIds = form.getAll("travelerIds").map(String);
    if (!title) { setMessage("Name this readiness item."); return; }
    if (type === "visa" && !country) { setMessage("A visa item needs a destination country code."); return; }
    if (type === "visa" && !travelerIds.length) { setMessage("Choose the traveler this visa check affects."); return; }
    if (official && (!official.startsWith("https://") || (() => { try { new URL(official); return false; } catch { return true; } })())) { setMessage("Official guidance must use a valid https link."); return; }
    mutation.mutate({
      tripId: trip.id,
      type,
      title,
      status: String(form.get("status")) as Requirement["status"],
      destinationCountryCode: country || undefined,
      visaType: String(form.get("visaType") ?? "").trim() || undefined,
      dueDate: String(form.get("dueDate") ?? "") || undefined,
      issuedOn: String(form.get("issuedOn") ?? "") || undefined,
      expiresOn: String(form.get("expiresOn") ?? "") || undefined,
      validityBufferDays: form.get("validityBufferDays") ? Number(form.get("validityBufferDays")) : undefined,
      officialGuidanceUrl: official || undefined,
      linkedDocumentId: String(form.get("linkedDocumentId") ?? "") || undefined,
      notes: String(form.get("notes") ?? "").trim() || undefined,
      travelerIds
    });
  };
  return <ModalSheet eyebrow={trip.title} title={requirement ? "Edit readiness item" : "Add readiness item"} onClose={onClose}>
    <form ref={draft.formRef} onSubmit={submit} className="mt-6 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2"><label className="form-label">Type<select className="form-input capitalize" name="type" value={type} onChange={(event) => setType(event.target.value as Requirement["type"])}>{requirementTypes.map((item) => <option key={item} value={item}>{item.replace("_", " ")}</option>)}</select></label><label className="form-label">Status<select className="form-input capitalize" name="status" defaultValue={requirement?.status ?? "to_check"}>{requirementStatuses.map((item) => <option key={item} value={item}>{item.replace("_", " ")}</option>)}</select></label></div>
      <label className="form-label">Title<input className="form-input" name="title" placeholder="Check Schengen visa" defaultValue={requirement?.title ?? ""} /></label>
      {type === "visa" && <div className="grid gap-4 sm:grid-cols-2"><label className="form-label">Country code<input className="form-input uppercase" maxLength={2} name="destinationCountryCode" placeholder="IT" defaultValue={requirement?.destination_country_code ?? ""} /></label><label className="form-label">Visa or permit type<input className="form-input" name="visaType" defaultValue={requirement?.visa_type ?? ""} /></label></div>}
      <div className="grid gap-4 sm:grid-cols-3"><label className="form-label">Due date<input className="form-input" type="date" name="dueDate" defaultValue={requirement?.due_date ?? ""} /></label><label className="form-label">Issued on<input className="form-input" type="date" name="issuedOn" defaultValue={requirement?.issued_on ?? ""} /></label><label className="form-label">Expires on<input className="form-input" type="date" name="expiresOn" defaultValue={requirement?.expires_on ?? ""} /></label></div>
      <label className="form-label">Desired validity after trip (days)<input className="form-input" min="0" type="number" name="validityBufferDays" defaultValue={requirement?.validity_buffer_days ?? ""} /></label>
      <label className="form-label">Official guidance link<input className="form-input" type="url" name="officialGuidanceUrl" placeholder="https://..." defaultValue={requirement?.official_guidance_url ?? ""} /></label>
      <label className="form-label">Linked Vault document (optional)<select className="form-input" name="linkedDocumentId" defaultValue={requirement?.linked_document_id ?? ""}><option value="">No linked document</option>{documents.data?.map((document) => <option value={document.id} key={document.id}>{document.title}</option>)}</select></label>
      <label className="form-label">Notes<textarea className="form-input min-h-20" name="notes" defaultValue={requirement?.notes ?? ""} /></label>
      <ParticipantSelector travelers={travelers} selectedTravelerIds={requirement ? assignees.data ?? [] : preferredTravelerId ? [preferredTravelerId] : undefined} explicitAll />
      {type === "visa" && !travelers.length && <p className="rounded-xl bg-warning/10 p-3 text-sm font-bold text-warning">Add a traveler before creating a visa check.</p>}
      <p className="text-xs leading-5 text-muted">Trip Vault stores your manual notes and dates. It does not determine legal eligibility; verify with official guidance.</p>
      {(message || mutation.error) && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm font-bold text-danger">{message || getErrorMessage(mutation.error)}</p>}
      <button className="primary-button w-full" disabled={mutation.isPending || (type === "visa" && !travelers.length)}>{mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />} {requirement ? "Save changes" : "Save readiness item"}</button>
    </form>
  </ModalSheet>;
}

export function UploadDocumentForm({ trip, travelers, preferredTravelerId, onClose, onUploaded, bookingId, flightLegId, members = [], privateOnly = false }: { trip: Trip; travelers: Traveler[]; preferredTravelerId?: string; onClose: () => void; onUploaded?: (documentId: string) => void | Promise<void>; bookingId?: string; flightLegId?: string; members?: TripMember[]; privateOnly?: boolean }) {
  const initialKind: DocumentKind = flightLegId ? "flight_ticket" : bookingId ? "booking_confirmation" : "other";
  const queryClient = useQueryClient(); const [kind, setKind] = useState<DocumentKind>(initialKind); const [assignmentMode, setAssignmentMode] = useState<DocumentAssignmentMode>(documentKind(initialKind).defaultAssignment); const [visibility, setVisibility] = useState<DocumentVisibility>("private"); const [message, setMessage] = useState(""); const [queuedMessage, setQueuedMessage] = useState("");
  const draft = useFormDraft(`document:new:${trip.id}:${flightLegId ?? bookingId ?? "trip"}`);
  const mutation = useMutation({ mutationFn: uploadDocument, onSuccess: async (document) => { draft.clearDraft(); await Promise.all([queryClient.invalidateQueries({ queryKey: ["documents"] }), queryClient.invalidateQueries({ queryKey: ["documents", trip.id] })]); await onUploaded?.(document.id); if (document.sync_state === "queued") setQueuedMessage(document.sync_error === "permission" || document.sync_error === "schema" ? "Saved on this device, but Supabase refused the cloud upload. Run the latest document migration and retry from Profile → Sync issues." : document.sync_error === "authentication" ? "Saved on this device. Sign in again, then retry from Profile → Sync issues." : "Saved safely on this device. Cloud upload is queued and will retry when synchronization succeeds."); else onClose(); } });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setMessage(""); setQueuedMessage("");
    const form = new FormData(event.currentTarget); const file = form.get("file"); const title = String(form.get("title") ?? "").trim(); const travelerIds = form.getAll("travelerIds").map(String); const selectedUserIds = form.getAll("selectedUserIds").map(String);
    if (!title) { setMessage("Give this document a title."); return; }
    if (!(file instanceof File) || !file.name) { setMessage("Choose a PDF or image."); return; }
    if (assignmentMode === "selected" && !travelerIds.length) { setMessage("Choose at least one traveler, or select Assign later."); return; }
    if (visibility === "selected_members" && !selectedUserIds.length) { setMessage("Choose at least one signed-in member."); return; }
    const selectedKind = documentKind(kind);
    mutation.mutate({ tripId: trip.id, title, category: selectedKind.category, purpose: selectedKind.purpose, assignmentMode, visibility, travelerIds, bookingId, flightLegId, selectedUserIds, shortLabel: String(form.get("shortLabel") ?? "").trim() || undefined, file });
  };
  const duplicate = mutation.error instanceof DuplicateDocumentError ? mutation.error : null;
  return <ModalSheet eyebrow={trip.title} title="Upload a document" onClose={onClose}><form ref={draft.formRef} className="mt-6 space-y-4" onSubmit={submit}>
    <label className="form-label">File<input className="form-input file:mr-3 file:rounded-lg file:border-0 file:bg-brand-soft file:px-3 file:py-2 file:font-bold file:text-brand" type="file" name="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={Boolean(queuedMessage)} onChange={(event) => { const file = event.currentTarget.files?.[0]; const title = event.currentTarget.form?.elements.namedItem("title"); if (file && title instanceof HTMLInputElement && !title.value) title.value = file.name.replace(/\.[^.]+$/, ""); }} /></label>
    <p className="-mt-2 text-xs text-muted">PDF, JPEG, PNG, or WebP under 5 MB. The original is kept unchanged and cached for offline viewing.</p>
    <label className="form-label">Title<input className="form-input" name="title" placeholder="Sam's boarding pass" disabled={Boolean(queuedMessage)} /></label>
    <label className="form-label">What is it?<select className="form-input" name="kind" value={kind} disabled={Boolean(queuedMessage)} onChange={(event) => { const next = event.target.value as DocumentKind; setKind(next); setAssignmentMode(documentKind(next).defaultAssignment); }}>{documentKinds.map((option) => <option key={option.value} value={option.value}>{option.label} — {option.hint}</option>)}</select></label>
    <fieldset className="rounded-2xl border border-line p-4"><legend className="px-1 text-sm font-bold">Who will use it?</legend><div className="mt-2 grid gap-2 sm:grid-cols-3">{([{"value":"shared","label":"Everyone","hint":"Shared booking or event"},{"value":"selected","label":"Traveler(s)","hint":"Choose one or more"},{"value":"unassigned","label":"Assign later","hint":"Useful for unnamed tickets"}] as const).map((option) => <label key={option.value} className={`cursor-pointer rounded-xl border p-3 text-sm ${assignmentMode === option.value ? "border-brand bg-brand-soft" : "border-line"}`}><input className="sr-only" type="radio" name="assignmentMode" value={option.value} checked={assignmentMode === option.value} onChange={() => setAssignmentMode(option.value)} /><strong className="block">{option.label}</strong><span className="mt-1 block text-xs text-muted">{option.hint}</span></label>)}</div>{assignmentMode === "selected" && <div className="mt-4 grid gap-2 sm:grid-cols-2">{travelers.map((traveler) => <label key={traveler.id} className="flex items-center gap-3 rounded-xl bg-elevated p-3 text-sm"><input type="checkbox" name="travelerIds" value={traveler.id} defaultChecked={traveler.id === preferredTravelerId} className="size-4" /><span className="font-bold">{traveler.display_name}</span></label>)}{!travelers.length && <p className="text-xs font-bold text-warning">Add a traveler first, or choose Assign later.</p>}</div>}</fieldset>
    <p className="-mt-2 text-xs leading-5 text-muted">Traveler assignment controls where this appears in the trip. It does not grant anyone access.</p>
    <label className="form-label">Short label (optional)<input className="form-input" name="shortLabel" placeholder="Bag 1 · seat 14A · ticket 2" disabled={Boolean(queuedMessage)} /></label>
    {privateOnly ? <><input type="hidden" name="visibility" value="private" /><p className="rounded-2xl bg-brand-soft p-4 text-sm text-muted">Only you can open this upload. Its traveler assignment is still visible only within your permitted view.</p></> : <><label className="form-label">Who can open it?<select className="form-input" name="visibility" value={visibility} onChange={(event) => setVisibility(event.target.value as DocumentVisibility)} disabled={Boolean(queuedMessage)}><option value="private">Only me</option><option value="trip">Everyone signed in to this trip</option><option value="selected_members">Selected signed-in members</option></select></label>{visibility === "selected_members" && <fieldset className="rounded-2xl border border-line p-4"><legend className="px-1 text-sm font-bold">Selected signed-in members</legend><div className="mt-2 space-y-2">{members.map((member) => <label key={member.user_id} className="flex items-center gap-3 text-sm"><input type="checkbox" name="selectedUserIds" value={member.user_id} className="size-4" />{member.display_name}</label>)}{!members.length && <p className="text-xs text-muted">No signed-in trip members are available.</p>}</div></fieldset>}</>}
    {queuedMessage && <p role="status" className="rounded-xl bg-warning/10 p-3 text-sm font-bold text-warning">{queuedMessage}</p>}
    {(message || mutation.error) && <div role="alert" className="rounded-xl bg-danger/10 p-3 text-sm font-bold text-danger"><p>{message || getErrorMessage(mutation.error)}</p>{duplicate && (onUploaded ? <button type="button" className="secondary-button mt-3" onClick={async () => { await onUploaded(duplicate.existingDocumentId); onClose(); }}>Attach existing document</button> : <Link className="secondary-button mt-3" to={`/trips/${trip.id}/documents/${duplicate.existingDocumentId}`}>Open existing document</Link>)}</div>}
    {queuedMessage ? <button className="primary-button w-full" type="button" onClick={onClose}>Done</button> : <button className="primary-button w-full" disabled={mutation.isPending}>{mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />} Save to Vault</button>}
  </form></ModalSheet>;
}

export function AddNoteForm({ trip, note, onClose }: { trip: Trip; note?: TripNote; onClose: () => void }) {
  const queryClient = useQueryClient(); const [message, setMessage] = useState("");
  const draft = useFormDraft(`note:${note?.id ?? "new"}:${trip.id}`);
  const mutation = useMutation({ mutationFn: (input: { tripId: string; title?: string; body: string }) => note ? updateNote({ note, title: input.title, body: input.body }) : addNote(input), onSuccess: async () => { draft.clearDraft(); await queryClient.invalidateQueries({ queryKey: ["notes", trip.id] }); onClose(); } });
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const body = String(form.get("body") ?? "").trim(); if (!body) { setMessage("Write something before saving."); return; } mutation.mutate({ tripId: trip.id, title: String(form.get("title") ?? "").trim() || undefined, body }); };
  return <ModalSheet eyebrow={trip.title} title={note ? "Edit trip note" : "Add a trip note"} onClose={onClose}><form ref={draft.formRef} onSubmit={submit} className="mt-6 space-y-4"><label className="form-label">Title (optional)<input className="form-input" name="title" placeholder="Things to remember" defaultValue={note?.title ?? ""} /></label><label className="form-label">Note<textarea autoFocus className="form-input min-h-40 resize-y" name="body" placeholder="Addresses, ideas, packing notes…" defaultValue={note?.body ?? ""} /></label>{(message || mutation.error) && <p role="alert" className="text-sm font-bold text-danger">{message || getErrorMessage(mutation.error)}</p>}<button className="primary-button w-full"><NotebookPen className="size-4" /> {note ? "Save changes" : "Save note"}</button></form></ModalSheet>;
}
