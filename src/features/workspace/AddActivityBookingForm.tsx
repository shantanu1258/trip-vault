import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, TicketCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { ModalSheet } from "../../components/ModalSheet";
import { VendorPicker } from "../metadata/VendorPicker";
import { eventTimeLabel } from "../timeline/model";
import { linkBookingToItineraryItem } from "../trips/api";
import { formatEventTime, getErrorMessage } from "../trips/presentation";
import type { ItineraryItem, Trip } from "../trips/types";
import { ParticipantSelector } from "./ParticipantSelector";
import { addBooking, archiveBooking } from "./api";
import type { BookingType, CreateBookingInput, Traveler } from "./types";

type ActivityBookingFormProps = {
  trip: Trip;
  item: ItineraryItem;
  itinerary?: ItineraryItem[];
  travelers: Traveler[];
  eventTravelerIds: string[];
  onClose: () => void;
};

const bookingTypeByEvent: Partial<Record<NonNullable<ItineraryItem["event_type"]>, BookingType>> = {
  activity: "activity",
  meal: "restaurant",
  transport: "transport",
  preparation: "other",
  custom: "other"
};

const providerCopyByEvent: Partial<Record<NonNullable<ItineraryItem["event_type"]>, { label: string; placeholder: string }>> = {
  activity: { label: "Activity provider (optional)", placeholder: "Enter the attraction, tour company, venue, or organizer" },
  meal: { label: "Restaurant or venue (optional)", placeholder: "Enter the restaurant, café, venue, or organizer" },
  transport: { label: "Transport provider (optional)", placeholder: "Enter the transport company, rental service, or operator" },
  preparation: { label: "Service provider (optional)", placeholder: "Enter the agency, appointment provider, or organizer" },
  custom: { label: "Service provider (optional)", placeholder: "Enter the business or organizer providing this booking" }
};

export function canAddEventBooking(item: ItineraryItem) {
  return !item.booking_id && Boolean(bookingTypeByEvent[item.event_type ?? "custom"]);
}

// Retained while existing callers move to the event-wide name.
export const canAddActivityBooking = canAddEventBooking;

export function AddActivityBookingForm({ trip, item, itinerary = [], travelers, eventTravelerIds, onClose }: ActivityBookingFormProps) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [bookedViaUrl, setBookedViaUrl] = useState("");
  const online = navigator.onLine;
  const eventType = item.event_type ?? "custom";
  const bookingType = bookingTypeByEvent[eventType] ?? "other";
  const providerCopy = providerCopyByEvent[eventType] ?? providerCopyByEvent.custom!;
  const explicitRelativeStart = item.has_explicit_start_time === true;
  const hasExplicitStart = (item.timing_mode ?? "exact") === "exact"
    || (item.timing_mode === "relative" && explicitRelativeStart);
  const mutation = useMutation({
    mutationFn: async (input: CreateBookingInput) => {
      if (!canAddEventBooking(item)) throw new Error("This event already has a booking or does not support generic booking details.");
      if (!navigator.onLine) throw new Error("Adding booking details requires a connection.");
      const booking = await addBooking(input);
      try {
        await linkBookingToItineraryItem(item, booking.id);
      } catch (linkError) {
        try {
          await archiveBooking(booking);
        } catch {
          throw new Error(`The booking was saved but could not be attached or cleaned up. Booking ID: ${booking.id}. Refresh the trip before trying again.`);
        }
        throw linkError;
      }
      return booking;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["itinerary", trip.id] }),
        queryClient.invalidateQueries({ queryKey: ["bookings", trip.id] }),
        queryClient.invalidateQueries({ queryKey: ["booking-travelers", trip.id] })
      ]);
      onClose();
    }
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    const form = new FormData(event.currentTarget);
    const travelerIds = form.getAll("travelerIds").map(String);
    if (travelers.length > 0 && travelerIds.length === 0) {
      setMessage("Choose at least one traveler for this booking.");
      return;
    }
    mutation.mutate({
      tripId: trip.id,
      type: bookingType,
      title: item.title,
      provider: String(form.get("provider") ?? "").trim() || undefined,
      referenceCode: String(form.get("referenceCode") ?? "").trim() || undefined,
      startsAt: hasExplicitStart ? item.starts_at : undefined,
      endsAt: hasExplicitStart ? item.ends_at ?? undefined : undefined,
      timezone: hasExplicitStart ? item.timezone : undefined,
      location: item.location?.label ?? item.location?.address,
      notes: String(form.get("notes") ?? "").trim() || undefined,
      bookedViaName: String(form.get("bookedViaName") ?? "").trim() || undefined,
      bookedViaUrl: String(form.get("bookedViaUrl") ?? "").trim() || undefined,
      contactName: String(form.get("contactName") ?? "").trim() || undefined,
      contactPhone: String(form.get("contactPhone") ?? "").trim() || undefined,
      travelerIds
    });
  };

  const defaultTravelerIds = item.applies_to_all_travelers ? undefined : eventTravelerIds;
  if (!canAddEventBooking(item)) return <ModalSheet eyebrow={item.title} title="Add booking details" onClose={onClose}>
    <div className="mt-6 rounded-2xl bg-warning/10 p-4 text-sm leading-6 text-warning">
      <p className="font-extrabold">A new booking cannot be added here</p>
      <p className="mt-1">This event already has a booking or uses specialized travel booking details.</p>
    </div>
  </ModalSheet>;
  const timingLabel = eventTimeLabel(item, itinerary) ?? formatEventTime(item.starts_at, item.timezone);
  const locationLabel = item.location?.label ?? item.location?.address;
  return <ModalSheet eyebrow={item.title} title="Add booking details" onClose={onClose}>
    <form className="mt-6 space-y-4" onSubmit={submit}>
      <div className="rounded-2xl bg-elevated p-4 text-sm">
        <p className="font-extrabold">Uses this event's plan</p>
        <p className="mt-1 text-xs leading-5 text-muted">{timingLabel}{locationLabel ? ` · ${locationLabel}` : ""}. Change the event itself if its timing, order, or place needs updating.</p>
        {!hasExplicitStart && <p className="mt-2 text-xs leading-5 text-muted">The booking will stay untimed while this event has no explicit start time.</p>}
      </div>
      <p className="rounded-2xl bg-warning/10 p-3 text-xs leading-5 text-warning">Adding booking details needs a connection for now. If attaching the booking fails, the new booking is archived and this event stays unchanged.</p>
      <label className="form-label">{providerCopy.label}<input autoFocus className="form-input" name="provider" placeholder={providerCopy.placeholder} /></label>
      <label className="form-label">Booking reference (optional)<input className="form-input" name="referenceCode" placeholder="Enter the confirmation number or reservation reference" /></label>
      <div className="form-label"><span>Booked via (optional)</span><VendorPicker onWebsite={setBookedViaUrl} /></div>
      <label className="form-label">Booking website (optional)<input className="form-input" name="bookedViaUrl" type="url" value={bookedViaUrl} onChange={(event) => setBookedViaUrl(event.target.value)} placeholder="Paste the page used to view or manage this booking" /></label>
      <div className="grid gap-4 sm:grid-cols-2"><label className="form-label">Contact name (optional)<input className="form-input" name="contactName" placeholder="Enter the guide, venue, or support contact" /></label><label className="form-label">Phone number (optional)<input className="form-input" name="contactPhone" type="tel" placeholder="Include the country code for call and WhatsApp" /></label></div>
      <label className="form-label">Booking notes (optional)<textarea className="form-input min-h-24 resize-y" name="notes" placeholder="Add entry instructions, meeting point, or booking conditions" /></label>
      <ParticipantSelector travelers={travelers} explicitAll selectedTravelerIds={defaultTravelerIds} />
      {(message || mutation.error) && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm font-bold text-danger">{message || getErrorMessage(mutation.error)}</p>}
      <button type="submit" className="primary-button w-full" disabled={!online || mutation.isPending}>{mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <TicketCheck className="size-4" />} Save booking details</button>
    </form>
  </ModalSheet>;
}
