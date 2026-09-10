import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowLeft, ArrowUp, CalendarPlus, Download, FileText, MapPin, NotebookPen, Pencil, Plane, Plus, ReceiptIndianRupee, Settings, ShieldCheck, TicketCheck, Trash2, UserPlus, UsersRound } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { FocusSurface } from "../components/FocusSurface";
import { AddButton, CostTotals, ErrorCard, LoadingCard } from "../components/TripUi";
import { archiveItineraryItem, archiveTripCost, listCosts, listItinerary, getTrip, reorderItineraryItems } from "../features/trips/api";
import { currentItineraryItem, formatDateRange, formatEventTime, formatItineraryDate, itineraryDateKey, formatMoney } from "../features/trips/presentation";
import { AddCostForm, AddItineraryForm, TripSettingsForm } from "../features/trips/TripForms";
import { downloadTripCalendar } from "../features/trips/calendar";
import { EventDocuments } from "../features/workspace/EventDocuments";
import { archiveNote, listBookings, listFlightLegsForTrip, listMembers, listNotes, listRequirements, listTravelers, listVaultDocuments, removeMember, removeTraveler, updateMemberRole } from "../features/workspace/api";
import { AddBookingForm, AddNoteForm, AddRequirementForm, AddTravelerForm, EditTravelerForm, ShareTripForm, UploadDocumentForm } from "../features/workspace/WorkspaceForms";
import type { ItineraryItem, TripCost } from "../features/trips/types";
import type { MemberRole, Traveler, TripNote } from "../features/workspace/types";
import { localProfileId } from "../features/sync/localSync";
import { OfflinePackControl } from "../features/readiness/OfflinePackControl";
import { TripAirlinesPanel } from "../features/workspace/TripAirlinesPanel";
import { TravelerSwitcher } from "../features/workspace/TravelerSwitcher";

type OpenForm = "itinerary" | "cost" | "booking" | "document" | "traveler" | "share" | "requirement" | "note" | "settings" | null;

function storedTravelerFocus(tripId: string) {
  try { return localStorage.getItem(`trip-vault:traveler-focus:${tripId}`); }
  catch { return null; }
}

export function TripPage() {
  const { tripId = "" } = useParams();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialForm = searchParams.get("add") as OpenForm;
  const [openForm, setOpenForm] = useState<OpenForm>(initialForm);
  const [userId, setUserId] = useState("");
  const [editingItinerary, setEditingItinerary] = useState<ItineraryItem | null>(null);
  const [editingCost, setEditingCost] = useState<TripCost | null>(null);
  const [editingTraveler, setEditingTraveler] = useState<Traveler | null>(null);
  const [editingNote, setEditingNote] = useState<TripNote | null>(null);
  const [focusedTravelerId, setFocusedTravelerId] = useState<string | null>(() => storedTravelerFocus(tripId));
  useEffect(() => { void localProfileId().then((profileId) => setUserId(profileId ?? "")); }, []);
  useEffect(() => { setFocusedTravelerId(storedTravelerFocus(tripId)); }, [tripId]);
  const closeForm = () => { setOpenForm(null); if (searchParams.has("add")) { searchParams.delete("add"); setSearchParams(searchParams, { replace: true }); } };

  const tripQuery = useQuery({ queryKey: ["trip", tripId], queryFn: () => getTrip(tripId), enabled: Boolean(tripId) });
  const itineraryQuery = useQuery({ queryKey: ["itinerary", tripId], queryFn: () => listItinerary(tripId), enabled: Boolean(tripId) });
  const costsQuery = useQuery({ queryKey: ["costs", tripId], queryFn: () => listCosts(tripId), enabled: Boolean(tripId) });
  const bookingsQuery = useQuery({ queryKey: ["bookings", tripId], queryFn: () => listBookings(tripId), enabled: Boolean(tripId) });
  const flightsQuery = useQuery({ queryKey: ["flights", tripId], queryFn: () => listFlightLegsForTrip(tripId), enabled: Boolean(tripId) });
  const travelersQuery = useQuery({ queryKey: ["travelers", tripId], queryFn: () => listTravelers(tripId), enabled: Boolean(tripId) });
  const membersQuery = useQuery({ queryKey: ["members", tripId], queryFn: () => listMembers(tripId), enabled: Boolean(tripId) });
  const documentsQuery = useQuery({ queryKey: ["documents", tripId], queryFn: () => listVaultDocuments(tripId), enabled: Boolean(tripId) });
  const requirementsQuery = useQuery({ queryKey: ["requirements", tripId], queryFn: () => listRequirements(tripId), enabled: Boolean(tripId) });
  const notesQuery = useQuery({ queryKey: ["notes", tripId], queryFn: () => listNotes(tripId), enabled: Boolean(tripId) });
  const trip = tripQuery.data;
  const role = membersQuery.data?.find((member) => member.user_id === userId)?.role as MemberRole | undefined;
  const editable = role === "owner" || role === "editor";
  const isOwner = role === "owner";
  const travelers = travelersQuery.data ?? [];
  useEffect(() => {
    if (focusedTravelerId && travelersQuery.data && !travelersQuery.data.some((traveler) => traveler.id === focusedTravelerId)) setFocusedTravelerId(null);
  }, [focusedTravelerId, travelersQuery.data]);
  const chooseTraveler = (travelerId: string | null) => {
    setFocusedTravelerId(travelerId);
    try {
      const key = `trip-vault:traveler-focus:${tripId}`;
      if (travelerId) localStorage.setItem(key, travelerId); else localStorage.removeItem(key);
    } catch { /* The switch still works for this page view. */ }
  };
  const focusedDocuments = focusedTravelerId ? (documentsQuery.data ?? []).filter((document) => document.traveler_id === focusedTravelerId) : documentsQuery.data ?? [];
  const flightByBooking = useMemo(() => new Map((flightsQuery.data ?? []).map((flight) => [flight.booking_id, flight])), [flightsQuery.data]);
  const anyError = tripQuery.error;
  const activeItinerary = currentItineraryItem(itineraryQuery.data ?? []);
  const archiveItinerary = useMutation({ mutationFn: archiveItineraryItem, onSuccess: () => queryClient.invalidateQueries({ queryKey: ["itinerary", tripId] }) });
  const reorderItinerary = useMutation({ mutationFn: ({ itemId, direction }: { itemId: string; direction: "up" | "down" }) => reorderItineraryItems(itineraryQuery.data ?? [], itemId, direction), onSuccess: (items) => queryClient.setQueryData(["itinerary", tripId], items) });
  const archiveCost = useMutation({ mutationFn: archiveTripCost, onSuccess: () => queryClient.invalidateQueries({ queryKey: ["costs", tripId] }) });
  const removeTravelerMutation = useMutation({ mutationFn: removeTraveler, onSuccess: () => queryClient.invalidateQueries({ queryKey: ["travelers", tripId] }) });
  const archiveNoteMutation = useMutation({ mutationFn: archiveNote, onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notes", tripId] }) });

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl">
        <Link to="/trips" className="tap-target inline-flex items-center gap-2 text-sm font-bold text-muted hover:text-ink"><ArrowLeft className="size-4" /> All trips</Link>
        {tripQuery.isLoading && <LoadingCard />}{anyError && <ErrorCard error={anyError} title="This trip could not be opened" />}
        {trip && <>
          <section className="page-enter mt-5 overflow-hidden rounded-[2rem] bg-brand p-6 text-surface shadow-focus sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-5"><div><p className="text-xs font-bold uppercase tracking-[0.17em] text-surface/60">{formatDateRange(trip.start_date, trip.end_date)}</p><h1 className="mt-3 font-display text-4xl font-black tracking-[-0.05em] sm:text-5xl">{trip.title}</h1><p className="mt-3 flex items-center gap-2 text-surface/70"><MapPin className="size-4" />{trip.destination_summary}</p></div><div className="flex items-center gap-2"><span className="rounded-full bg-surface/10 px-3 py-2 text-xs font-bold capitalize">{role ?? "member"}</span>{isOwner && <button type="button" onClick={() => setOpenForm("settings")} className="tap-target grid size-10 place-items-center rounded-xl bg-surface/10" aria-label="Trip settings"><Settings className="size-4" /></button>}</div></div>
            <div className="mt-7 flex flex-wrap gap-2">{editable && <><button onClick={() => setOpenForm("itinerary")} className="hero-action"><CalendarPlus className="size-4" /> Itinerary</button><button onClick={() => setOpenForm("booking")} className="hero-action"><TicketCheck className="size-4" /> Booking</button></>}<button onClick={() => setOpenForm("document")} className="hero-action"><FileText className="size-4" /> {editable ? "Document" : "My document"}</button>{editable && <button onClick={() => setOpenForm("cost")} className="hero-action"><ReceiptIndianRupee className="size-4" /> Cost</button>}{isOwner && <button onClick={() => setOpenForm("share")} className="hero-action"><UsersRound className="size-4" /> Share</button>}</div>
          </section>

          <TravelerSwitcher travelers={travelers} value={focusedTravelerId} onChange={chooseTraveler} />

          <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(18rem,.75fr)]">
            <div className="space-y-5">
              <section className="surface-card p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="eyebrow">Itinerary</p><h2 className="mt-1 font-display text-2xl font-black">Your timeline</h2></div><div className="flex gap-2">{(itineraryQuery.data?.length ?? 0) > 0 && <button type="button" className="secondary-button" onClick={() => downloadTripCalendar(trip, itineraryQuery.data ?? [])}><Download className="size-4" /> Calendar</button>}{editable && <AddButton onClick={() => setOpenForm("itinerary")}>Add event</AddButton>}</div></div>
                <div className="mt-5 space-y-3">{itineraryQuery.data?.map((item, index, items) => <Fragment key={item.id}>{(index === 0 || itineraryDateKey(items[index - 1].starts_at, items[index - 1].timezone) !== itineraryDateKey(item.starts_at, item.timezone)) && <h3 className={`${index ? "pt-5" : ""} text-sm font-black text-ink`}>{formatItineraryDate(item.starts_at, item.timezone)}</h3>}<FocusSurface active={activeItinerary?.id === item.id} className="bg-elevated p-4"><div className="flex items-start gap-4"><div className="min-w-[4.5rem] text-xs font-black text-coral">{item.is_all_day ? "All day" : formatEventTime(item.starts_at, item.timezone).split(",").at(-1)}</div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><div>{activeItinerary?.id === item.id && <span className="mb-2 inline-flex rounded-full bg-coral/15 px-2 py-1 text-[.6rem] font-black uppercase tracking-[.12em] text-coral">{new Date(item.starts_at) <= new Date() ? "Now" : "Next"}</span>}<h3 className="font-display text-lg font-black">{item.title}</h3></div>{editable && <div className="flex">{items[index - 1]?.starts_at === item.starts_at && <button type="button" disabled={reorderItinerary.isPending} onClick={() => reorderItinerary.mutate({ itemId: item.id, direction: "up" })} className="tap-target grid size-9 place-items-center text-muted hover:text-brand" aria-label={`Move ${item.title} earlier among events at the same time`}><ArrowUp className="size-3.5" /></button>}{items[index + 1]?.starts_at === item.starts_at && <button type="button" disabled={reorderItinerary.isPending} onClick={() => reorderItinerary.mutate({ itemId: item.id, direction: "down" })} className="tap-target grid size-9 place-items-center text-muted hover:text-brand" aria-label={`Move ${item.title} later among events at the same time`}><ArrowDown className="size-3.5" /></button>}<button type="button" onClick={() => setEditingItinerary(item)} className="tap-target grid size-9 place-items-center text-muted hover:text-brand" aria-label={`Edit ${item.title}`}><Pencil className="size-3.5" /></button><button type="button" onClick={() => window.confirm(`Archive ${item.title}? Its linked Vault documents remain.`) && archiveItinerary.mutate(item)} className="tap-target grid size-9 place-items-center text-muted hover:text-danger" aria-label={`Archive ${item.title}`}><Trash2 className="size-3.5" /></button></div>}</div><p className="mt-1 text-xs text-muted">{formatEventTime(item.starts_at, item.timezone)} · {item.timezone}</p>{item.location?.label && <p className="mt-2 flex items-center gap-1.5 text-sm text-muted"><MapPin className="size-3.5" />{item.location.label}</p>}{item.notes && <p className="mt-2 text-sm leading-6 text-muted">{item.notes}</p>}<EventDocuments item={item} canEdit={editable} /></div></div></FocusSurface></Fragment>)}{itineraryQuery.data?.length === 0 && (editable ? <button onClick={() => setOpenForm("itinerary")} className="w-full rounded-2xl border border-dashed border-line p-7 text-sm text-muted">No events yet. Add the first thing on your itinerary.</button> : <p className="w-full rounded-2xl border border-dashed border-line p-7 text-sm text-muted">No itinerary events have been added yet.</p>)}</div>
              </section>

              <section className="surface-card p-5 sm:p-6"><div className="flex items-center justify-between gap-4"><div><p className="eyebrow">Bookings</p><h2 className="mt-1 font-display text-2xl font-black">Reservations</h2></div>{editable && <AddButton onClick={() => setOpenForm("booking")}>Add booking</AddButton>}</div><div className="mt-5 grid gap-3 sm:grid-cols-2">{bookingsQuery.data?.map((booking) => { const flight = flightByBooking.get(booking.id); return <Link key={booking.id} to={flight ? `/trips/${trip.id}/flights/${flight.id}` : `/trips/${trip.id}/bookings/${booking.id}`} className="group rounded-2xl border border-line bg-elevated p-4 hover:border-brand/40"><span className="grid size-9 place-items-center rounded-xl bg-brand-soft text-brand">{booking.type === "flight" ? <Plane className="size-4" /> : <TicketCheck className="size-4" />}</span><p className="mt-4 text-xs font-bold uppercase tracking-[.12em] text-muted">{booking.type}</p><h3 className="mt-1 font-display text-lg font-black">{booking.title}</h3><p className="mt-1 text-xs text-muted">{booking.provider}{booking.reference_code ? ` · ${booking.reference_code}` : ""}</p></Link>; })}{bookingsQuery.data?.length === 0 && <p className="col-span-full rounded-2xl border border-dashed border-line p-6 text-sm text-muted">No bookings yet.</p>}</div></section>
            </div>

            <aside className="space-y-5">
              <OfflinePackControl tripId={trip.id} />
              <TripAirlinesPanel tripId={trip.id} canEdit={editable} />
              <section className="surface-card p-5"><CostTotals costs={costsQuery.data ?? []} /><div className="mt-3 space-y-2">{costsQuery.data?.map((cost) => <div key={cost.id} className="flex items-center gap-2 rounded-xl py-1 text-sm"><span className="min-w-0 flex-1 truncate text-muted">{cost.title}</span><strong>{formatMoney(cost.amount_minor, cost.currency_code)}</strong>{editable && <><button type="button" className="tap-target grid size-8 place-items-center text-muted hover:text-brand" onClick={() => setEditingCost(cost)} aria-label={`Edit ${cost.title}`}><Pencil className="size-3.5" /></button><button type="button" className="tap-target grid size-8 place-items-center text-muted hover:text-danger" onClick={() => window.confirm(`Archive cost ${cost.title}?`) && archiveCost.mutate(cost)} aria-label={`Archive ${cost.title}`}><Trash2 className="size-3.5" /></button></>}</div>)}</div>{editable && <button onClick={() => setOpenForm("cost")} className="mt-4 inline-flex items-center gap-2 text-sm font-extrabold text-brand"><Plus className="size-4" /> Add cost</button>}</section>
              <section className="surface-card p-5">
                <div className="flex items-center justify-between">
                  <div><p className="eyebrow">People</p><h2 className="mt-1 font-display text-xl font-black">Travelers</h2></div>
                  {editable && <button onClick={() => setOpenForm("traveler")} className="tap-target grid size-10 place-items-center rounded-xl bg-brand-soft text-brand" aria-label="Add traveler"><UserPlus className="size-4" /></button>}
                </div>
                <div className="mt-4 space-y-2">
                  {travelers.map((traveler) => <div key={traveler.id} className={`flex items-center gap-3 rounded-xl border p-3 transition ${focusedTravelerId === traveler.id ? "border-brand/40 bg-brand-soft" : "border-transparent bg-elevated"}`}>
                    <button type="button" aria-pressed={focusedTravelerId === traveler.id} onClick={() => chooseTraveler(traveler.id)} className="tap-target grid size-9 shrink-0 place-items-center rounded-full bg-brand text-xs font-black text-surface" aria-label={`Plan for ${traveler.display_name}`}>{traveler.display_name.slice(0, 2).toUpperCase()}</button>
                    <div className="min-w-0 flex-1"><p className="text-sm font-bold">{traveler.display_name}</p><p className="text-xs text-muted">{traveler.is_minor ? "Managed child" : focusedTravelerId === traveler.id ? "Selected for new items" : "Traveler"}</p></div>
                    {editable && <button type="button" onClick={() => setEditingTraveler(traveler)} className="tap-target grid size-8 place-items-center text-muted hover:text-brand" aria-label={`Edit ${traveler.display_name}`}><Pencil className="size-3.5" /></button>}
                    {isOwner && <button type="button" onClick={() => window.confirm(`Remove ${traveler.display_name} from future trip assignments? Existing records remain.`) && removeTravelerMutation.mutate(traveler)} className="tap-target grid size-8 place-items-center text-muted hover:text-danger" aria-label={`Remove ${traveler.display_name}`}><Trash2 className="size-3.5" /></button>}
                  </div>)}
                  {travelers.length === 0 && <p className="text-sm text-muted">No traveler profiles yet.</p>}
                </div>
                {membersQuery.data && membersQuery.data.length > 0 && <div className="mt-4 border-t border-line pt-4"><p className="eyebrow">Signed-in members</p><div className="mt-2 space-y-2">{membersQuery.data.map((member) => <div className="flex items-center gap-2 text-xs" key={member.user_id}><span className="min-w-0 flex-1 truncate font-bold">{member.display_name}{member.participation_type === "collaborator" ? " · helper" : ""}</span>{isOwner && member.role !== "owner" ? <><select aria-label={`Role for ${member.display_name}`} className="rounded-lg border border-line bg-elevated p-1 capitalize" defaultValue={member.role} onChange={async (event) => { await updateMemberRole(trip.id, member.user_id, event.target.value as "editor" | "viewer"); membersQuery.refetch(); }}><option value="editor">editor</option><option value="viewer">viewer</option></select><button className="text-danger" onClick={async () => { if (!window.confirm(`Remove ${member.display_name}? Previously downloaded copies cannot be remotely erased.`)) return; await removeMember(trip.id, member.user_id); membersQuery.refetch(); }}>Remove</button></> : <span className="capitalize text-muted">{member.role}</span>}</div>)}</div></div>}
                {isOwner && <button onClick={() => setOpenForm("share")} className="mt-3 inline-flex items-center gap-2 text-sm font-extrabold text-brand"><UsersRound className="size-4" /> Share trip</button>}
              </section>
              <section className="surface-card p-5"><div className="flex items-center justify-between"><div><p className="eyebrow">Readiness</p><h2 className="mt-1 font-display text-xl font-black">Before you go</h2></div><ShieldCheck className="size-5 text-success" /></div><p className="mt-3 text-sm text-muted">{requirementsQuery.data?.filter((item) => item.status === "complete" || item.status === "not_required").length ?? 0} of {requirementsQuery.data?.length ?? 0} resolved</p><Link className="mt-4 inline-flex items-center gap-2 text-sm font-extrabold text-brand" to={`/trips/${trip.id}/readiness`}>Open readiness</Link>{editable && <button onClick={() => setOpenForm("requirement")} className="ml-4 mt-4 text-sm font-extrabold text-brand">+ Add</button>}</section>
              <section className="surface-card p-5">
                <div className="flex items-center justify-between"><div><p className="eyebrow">Vault</p><h2 className="mt-1 font-display text-xl font-black">Documents</h2></div><FileText className="size-5 text-brand" /></div>
                <p className="mt-3 text-sm text-muted">{focusedDocuments.length} document{focusedDocuments.length === 1 ? "" : "s"} {focusedTravelerId ? "for the selected traveler" : "in this trip"}</p>
                <div className="mt-3 space-y-2">{focusedDocuments.slice(0, 3).map((document) => <Link key={document.id} to={`/trips/${trip.id}/documents/${document.id}`} className="block truncate text-sm font-bold text-brand">{document.title}</Link>)}</div>
                {focusedTravelerId && focusedDocuments.length === 0 && <p className="mt-3 text-xs text-muted">No documents are assigned to this traveler yet.</p>}
                <button onClick={() => setOpenForm("document")} className="mt-4 inline-flex items-center gap-2 text-sm font-extrabold text-brand"><Plus className="size-4" /> {editable ? "Upload" : "Upload privately"}</button>
              </section>
              <section className="surface-card p-5"><div className="flex items-center justify-between"><div><p className="eyebrow">Notes</p><h2 className="mt-1 font-display text-xl font-black">Useful details</h2></div><NotebookPen className="size-5 text-brand" /></div><div className="mt-3 space-y-3">{notesQuery.data?.map((note) => <div className="rounded-xl bg-elevated p-3" key={note.id}><div className="flex items-start justify-between gap-2"><div className="min-w-0 flex-1"><p className="text-sm font-bold">{note.title || "Note"}</p><p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-muted">{note.body}</p></div>{editable && <div className="flex"><button type="button" onClick={() => setEditingNote(note)} className="tap-target grid size-8 place-items-center text-muted hover:text-brand" aria-label="Edit note"><Pencil className="size-3.5" /></button><button type="button" onClick={() => window.confirm("Archive this note?") && archiveNoteMutation.mutate(note)} className="tap-target grid size-8 place-items-center text-muted hover:text-danger" aria-label="Archive note"><Trash2 className="size-3.5" /></button></div>}</div></div>)}{notesQuery.data?.length === 0 && <p className="text-sm text-muted">No notes yet.</p>}</div>{editable && <button onClick={() => setOpenForm("note")} className="mt-4 inline-flex items-center gap-2 text-sm font-extrabold text-brand"><Plus className="size-4" /> Add note</button>}</section>
            </aside>
          </div>
        </>}
      </div>
      {trip && editable && openForm === "itinerary" && <AddItineraryForm trip={trip} travelers={travelers} bookings={bookingsQuery.data ?? []} preferredTravelerId={focusedTravelerId ?? undefined} onClose={closeForm} />}
      {trip && editable && openForm === "cost" && <AddCostForm trip={trip} onClose={closeForm} />}
      {trip && editable && openForm === "booking" && <AddBookingForm trip={trip} travelers={travelers} preferredTravelerId={focusedTravelerId ?? undefined} onClose={closeForm} />}
      {trip && editable && openForm === "traveler" && <AddTravelerForm trip={trip} onClose={closeForm} />}
      {trip && isOwner && openForm === "share" && <ShareTripForm trip={trip} travelers={travelersQuery.data ?? []} onClose={closeForm} />}
      {trip && editable && openForm === "requirement" && <AddRequirementForm trip={trip} travelers={travelers} preferredTravelerId={focusedTravelerId ?? undefined} onClose={closeForm} />}
      {trip && openForm === "document" && <UploadDocumentForm trip={trip} travelers={travelers} preferredTravelerId={focusedTravelerId ?? undefined} members={membersQuery.data ?? []} privateOnly={!editable} onClose={closeForm} />}
      {trip && editable && openForm === "note" && <AddNoteForm trip={trip} onClose={closeForm} />}
      {trip && isOwner && openForm === "settings" && <TripSettingsForm trip={trip} onClose={closeForm} onArchived={() => window.location.assign("/trips")} />}
      {trip && editable && editingItinerary && <AddItineraryForm trip={trip} item={editingItinerary} travelers={travelersQuery.data ?? []} bookings={bookingsQuery.data ?? []} onClose={() => setEditingItinerary(null)} />}
      {trip && editable && editingCost && <AddCostForm trip={trip} cost={editingCost} onClose={() => setEditingCost(null)} />}
      {trip && editingTraveler && editable && <EditTravelerForm trip={trip} traveler={editingTraveler} onClose={() => setEditingTraveler(null)} />}
      {trip && editable && editingNote && <AddNoteForm trip={trip} note={editingNote} onClose={() => setEditingNote(null)} />}
    </AppShell>
  );
}
