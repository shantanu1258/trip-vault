import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, CalendarPlus, Loader2, ReceiptIndianRupee, Save, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { ModalSheet } from "../../components/ModalSheet";
import { addItineraryItem, addTripCost, archiveTrip, deleteTripRecoverably, updateItineraryItem, updateTrip, updateTripCost } from "./api";
import { getErrorMessage } from "./presentation";
import type { CreateCostInput, CreateItineraryInput, ItineraryItem, Trip, TripCost } from "./types";
import { amountStringToMinor, costFormSchema, currencyFractionDigits, firstValidationMessage, isoToLocalDateTime, itineraryFormSchema, localDateTimeToIso, tripFormSchema } from "./validation";
import type { Booking, Traveler } from "../workspace/types";
import { ParticipantSelector } from "../workspace/ParticipantSelector";
import { listItineraryParticipantIds } from "../workspace/api";
import { useFormDraft } from "../../lib/forms/useFormDraft";

const currencies = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "JPY"];

function defaultStart(trip: Trip) {
  return `${trip.start_date}T09:00`;
}

export function AddItineraryForm({ trip, travelers, bookings = [], item, preferredTravelerId, onClose }: { trip: Trip; travelers: Traveler[]; bookings?: Booking[]; item?: ItineraryItem; preferredTravelerId?: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [allDay, setAllDay] = useState(Boolean(item?.is_all_day));
  const draft = useFormDraft(`itinerary:${item?.id ?? "new"}:${trip.id}`);
  const participants = useQuery({ queryKey: ["itinerary-participant-ids", item?.id], queryFn: () => listItineraryParticipantIds(item!.id, trip.id), enabled: Boolean(item) });
  const mutation = useMutation({
    mutationFn: (input: CreateItineraryInput) => item ? updateItineraryItem({ ...input, id: item.id, version: item.version }) : addItineraryItem(input),
    onSuccess: async () => {
      draft.clearDraft();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["itinerary", trip.id] }),
        queryClient.invalidateQueries({ queryKey: ["itinerary-participant-ids", item?.id] })
      ]);
      onClose();
    }
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    const form = new FormData(event.currentTarget);
    const parsed = itineraryFormSchema.safeParse({
      title: form.get("title"), startsAt: form.get("startsAt"), endsAt: form.get("endsAt") || undefined,
      location: form.get("location") || undefined, notes: form.get("notes") || undefined
    });
    if (!parsed.success) { setMessage(firstValidationMessage(parsed.error)); return; }
    mutation.mutate({
      tripId: trip.id,
      bookingId: String(form.get("bookingId") ?? "") || undefined,
      title: parsed.data.title,
      startsAt: localDateTimeToIso(allDay ? `${parsed.data.startsAt}T12:00` : parsed.data.startsAt, trip.primary_timezone),
      endsAt: parsed.data.endsAt ? localDateTimeToIso(allDay ? `${parsed.data.endsAt}T12:00` : parsed.data.endsAt, trip.primary_timezone) : undefined,
      timezone: trip.primary_timezone,
      location: parsed.data.location,
      notes: parsed.data.notes,
      travelerIds: form.getAll("travelerIds").map(String),
      isAllDay: allDay
    });
  };

  return (
    <ModalSheet eyebrow={trip.title} title={item ? "Edit itinerary item" : "Add itinerary item"} onClose={onClose}>
      <form ref={draft.formRef} className="mt-6 space-y-4" onSubmit={submit}>
        <label className="form-label">Title<input className="form-input" name="title" placeholder="Airport transfer" defaultValue={item?.title} autoFocus /></label>
        <label className="flex items-center gap-3 rounded-xl border border-line p-3 text-sm font-bold"><input type="checkbox" name="isAllDay" checked={allDay} onChange={(event) => setAllDay(event.target.checked)} /> Date-only / all-day item</label>
        <div className="grid gap-4 sm:grid-cols-2"><label className="form-label">{allDay ? "Date" : "Starts"}<input className="form-input" name="startsAt" type={allDay ? "date" : "datetime-local"} defaultValue={item ? allDay ? isoToLocalDateTime(item.starts_at, item.timezone).slice(0, 10) : isoToLocalDateTime(item.starts_at, item.timezone) : allDay ? trip.start_date : defaultStart(trip)} key={`start-${allDay}`} /></label><label className="form-label">{allDay ? "End date (optional)" : "Ends (optional)"}<input className="form-input" name="endsAt" type={allDay ? "date" : "datetime-local"} defaultValue={item ? allDay ? isoToLocalDateTime(item.ends_at, item.timezone).slice(0, 10) : isoToLocalDateTime(item.ends_at, item.timezone) : ""} key={`end-${allDay}`} /></label></div>
        <p className="-mt-2 text-xs text-muted">Times use {trip.primary_timezone}.</p>
        <label className="form-label">Location (optional)<input className="form-input" name="location" placeholder="Address or place name" defaultValue={item?.location?.label ?? ""} /></label>
        {bookings.length > 0 && <label className="form-label">Related booking (optional)<select className="form-input" name="bookingId" defaultValue={item?.booking_id ?? ""}><option value="">No related booking</option>{bookings.map((booking) => <option key={booking.id} value={booking.id}>{booking.title}</option>)}</select></label>}
        <label className="form-label">Notes (optional)<textarea className="form-input min-h-24 resize-y" name="notes" placeholder="Meeting point, reference, or useful detail" defaultValue={item?.notes ?? ""} /></label>
        <ParticipantSelector travelers={travelers} selectedTravelerIds={item ? participants.data ?? [] : preferredTravelerId ? [preferredTravelerId] : undefined} />
        {(message || mutation.error) && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm font-bold text-danger">{message || getErrorMessage(mutation.error)}</p>}
        <button disabled={mutation.isPending} className="primary-button w-full" type="submit">{mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <CalendarPlus className="size-4" />} {item ? "Save changes" : "Save itinerary item"}</button>
      </form>
    </ModalSheet>
  );
}

export function AddCostForm({ trip, cost, onClose }: { trip: Trip; cost?: TripCost; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const draft = useFormDraft(`cost:${cost?.id ?? "new"}:${trip.id}`);
  const mutation = useMutation({
    mutationFn: (input: CreateCostInput) => cost ? updateTripCost({ ...input, id: cost.id, version: cost.version }) : addTripCost(input),
    onSuccess: async () => {
      draft.clearDraft();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["costs", trip.id] }),
        queryClient.invalidateQueries({ queryKey: ["home-costs", trip.id] })
      ]);
      onClose();
    }
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    const form = new FormData(event.currentTarget);
    const parsed = costFormSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success) { setMessage(firstValidationMessage(parsed.error)); return; }
    mutation.mutate({
      tripId: trip.id,
      title: parsed.data.title,
      category: parsed.data.category,
      amountMinor: amountStringToMinor(parsed.data.amount, parsed.data.currencyCode),
      currencyCode: parsed.data.currencyCode,
      paymentStatus: parsed.data.paymentStatus,
      notes: parsed.data.notes
    });
  };

  return (
    <ModalSheet eyebrow={trip.title} title={cost ? "Edit trip cost" : "Add a trip cost"} onClose={onClose}>
      <form ref={draft.formRef} className="mt-6 space-y-4" onSubmit={submit}>
        <label className="form-label">What was it for?<input className="form-input" name="title" placeholder="Return flights" defaultValue={cost?.title} autoFocus /></label>
        <div className="grid gap-4 sm:grid-cols-2"><label className="form-label">Category<select className="form-input capitalize" name="category" defaultValue={cost?.category ?? "other"}>{["flight", "hotel", "transport", "activity", "food", "visa", "insurance", "other"].map((item) => <option key={item}>{item}</option>)}</select></label><label className="form-label">Status<select className="form-input" name="paymentStatus" defaultValue={cost?.payment_status ?? "planned"}><option value="planned">Planned</option><option value="paid">Paid</option><option value="refunded">Refunded</option></select></label></div>
        <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-4"><label className="form-label">Amount<input className="form-input" name="amount" inputMode="decimal" placeholder="0.00" defaultValue={cost ? (cost.amount_minor / 10 ** currencyFractionDigits(cost.currency_code)).toFixed(currencyFractionDigits(cost.currency_code)) : ""} /></label><label className="form-label">Currency<select className="form-input" name="currencyCode" defaultValue={cost?.currency_code ?? trip.base_currency}>{currencies.map((currency) => <option key={currency}>{currency}</option>)}</select></label></div>
        <label className="form-label">Notes (optional)<textarea className="form-input min-h-20 resize-y" name="notes" defaultValue={cost?.notes ?? ""} /></label>
        {(message || mutation.error) && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm font-bold text-danger">{message || getErrorMessage(mutation.error)}</p>}
        <button disabled={mutation.isPending} className="primary-button w-full" type="submit">{mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <ReceiptIndianRupee className="size-4" />} {cost ? "Save changes" : "Save cost"}</button>
      </form>
    </ModalSheet>
  );
}

export function TripSettingsForm({ trip, onClose, onArchived }: { trip: Trip; onClose: () => void; onArchived: () => void }) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const update = useMutation({ mutationFn: updateTrip, onSuccess: async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ["trip", trip.id] }), queryClient.invalidateQueries({ queryKey: ["trips"] })]); onClose(); } });
  const archive = useMutation({ mutationFn: () => archiveTrip(trip), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["trips"] }); onArchived(); } });
  const remove = useMutation({ mutationFn: () => deleteTripRecoverably(trip), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["trips"] }); onArchived(); } });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setMessage("");
    const parsed = tripFormSchema.safeParse(Object.fromEntries(new FormData(event.currentTarget)));
    if (!parsed.success) { setMessage(firstValidationMessage(parsed.error)); return; }
    update.mutate({ ...parsed.data, id: trip.id, status: trip.status, version: trip.version });
  };
  return <ModalSheet eyebrow={trip.title} title="Trip settings" onClose={onClose}><form className="mt-6 space-y-4" onSubmit={submit}><label className="form-label">Trip name<input className="form-input" name="title" defaultValue={trip.title} /></label><label className="form-label">Destination<input className="form-input" name="destination" defaultValue={trip.destination_summary} /></label><div className="grid gap-4 sm:grid-cols-2"><label className="form-label">Start date<input className="form-input" name="startDate" type="date" defaultValue={trip.start_date} /></label><label className="form-label">End date<input className="form-input" name="endDate" type="date" defaultValue={trip.end_date} /></label></div><div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]"><label className="form-label">Time zone<input className="form-input" name="timezone" defaultValue={trip.primary_timezone} /></label><label className="form-label">Currency<input className="form-input uppercase" name="baseCurrency" maxLength={3} defaultValue={trip.base_currency} /></label></div>{(message || update.error || archive.error || remove.error) && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm font-bold text-danger">{message || getErrorMessage(update.error || archive.error || remove.error)}</p>}<button className="primary-button w-full" disabled={update.isPending}><Save className="size-4" /> Save trip</button><div className="border-t border-line pt-4"><p className="text-xs leading-5 text-muted">Archiving removes the trip from Home and keeps its cloud and local records recoverable.</p><button type="button" className="secondary-button mt-3 text-danger" disabled={archive.isPending} onClick={() => { if (window.confirm(`Archive ${trip.title}?`)) archive.mutate(); }}><Archive className="size-4" /> Archive trip</button><p className="mt-5 text-xs leading-5 text-muted">Recently deleted trips can be restored for 30 days. This action requires a connection.</p><button type="button" className="secondary-button mt-3 text-danger" disabled={remove.isPending || !navigator.onLine} onClick={() => { if (window.confirm(`Move ${trip.title} to Recently deleted?`)) remove.mutate(); }}><Trash2 className="size-4" /> Move to Recently deleted</button></div></form></ModalSheet>;
}
