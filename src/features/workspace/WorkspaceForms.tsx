import { FormSection } from "../../components/FormSection";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarPlus,
  Check,
  Clipboard,
  FileUp,
  Loader2,
  NotebookPen,
  RefreshCw,
  TicketCheck,
  Trash2,
  UserPlus,
  UsersRound
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { z } from "zod";
import { ModalSheet } from "../../components/ModalSheet";
import { FileDropzone } from "../../components/FileDropzone";
import { LocalQrCode } from "../../components/LocalQrCode";
import { getErrorMessage } from "../trips/presentation";
import type { Trip } from "../trips/types";
import {
  firstValidationMessage,
  isoToLocalDateTime,
  localDateTimeToIso
} from "../trips/validation";
import { listItinerary } from "../trips/api";
import {
  addRequirement,
  addTraveler,
  createTripMembershipOffer,
  createInvitation,
  listAssociatedAccounts,
  listInvitations,
  listRequirementAssigneeIds,
  revokeInvitation,
  saveHotelStay,
  updateBooking,
  updateNote,
  updateRequirement,
  updateTraveler,
  DuplicateDocumentError,
  uploadDocument
} from "./api";
import { addNote } from "./api";
import {
  bookingTypes,
  type Booking,
  type DocumentAssignmentMode,
  type DocumentVisibility,
  type Requirement,
  type RequirementInput,
  type ReservationState,
  type Traveler,
  type TripMember,
  type TripNote,
  type UpdateBookingInput
} from "./types";
import {
  documentKind,
  documentKinds,
  suggestedDocumentTitle,
  type DocumentKind
} from "./documentModel";
import { ParticipantSelector } from "./ParticipantSelector";
import { useFormDraft } from "../../lib/forms/useFormDraft";
import { AddEventForm } from "../timeline/AddEventForm";
import { VendorPicker } from "../metadata/VendorPicker";
import { suppressRealtimeRefresh } from "../sync/RealtimeRefresh";
import { upsertById } from "../queries/cache";
import type { VaultDocument } from "./types";
import { EventTimeZoneField, furthestEventTimezone } from "../timeline/TimingFields";

const requiredText = (message: string, max = 160) => z.string().trim().min(1, message).max(max);

const bookingSchema = z
  .object({
    type: z.enum(bookingTypes),
    title: requiredText("Name this booking."),
    provider: z.string().trim().max(160).optional(),
    referenceCode: z.string().trim().max(160).optional(),
    startsAt: z.string().optional(),
    endsAt: z.string().optional(),
    timezone: z.string().trim().optional(),
    location: z.string().trim().max(220).optional(),
    mapUrl: z
      .string()
      .trim()
      .url("Use a complete Google Maps address.")
      .refine((value) => value.startsWith("https://"), "Use a secure Google Maps address.")
      .or(z.literal(""))
      .optional(),
    notes: z.string().trim().max(2000).optional(),
    journeyScope: z.enum(["domestic", "international"]).optional(),
    bookedViaName: z.string().trim().max(160).optional(),
    bookedViaUrl: z
      .string()
      .trim()
      .url("Use a complete booking website address.")
      .or(z.literal(""))
      .optional(),
    contactName: z.string().trim().max(160).optional(),
    contactPhone: z.string().trim().max(40).optional(),
    reservationState: z.enum(["planned", "walk_up", "booked"]),
    participantScope: z.enum(["everyone", "selected"])
  })
  .superRefine((value, context) => {
    if (value.type === "flight" && !value.referenceCode)
      context.addIssue({
        code: "custom",
        path: ["referenceCode"],
        message: "Add the flight booking reference / PNR."
      });
    if (
      value.startsAt &&
      value.endsAt &&
      (value.endsAt < value.startsAt || (value.type === "hotel" && value.endsAt === value.startsAt))
    )
      context.addIssue({
        code: "custom",
        path: ["endsAt"],
        message:
          value.type === "hotel"
            ? "Hotel checkout must be after check-in."
            : "End time cannot be before start time."
      });
  });

type BookingEditMutationInput = UpdateBookingInput & {
  mapUrl?: string;
  hotelCheckInHasTime?: boolean;
  hotelCheckoutHasTime?: boolean;
};

function BookingMapUrlField({ booking }: { booking: Booking }) {
  const legacyDetailsMapUrl =
    typeof booking.details.map_url === "string" ? booking.details.map_url : "";
  return (
    <label className="form-label">
      Google Maps link (optional)
      <input
        className="form-input"
        name="mapUrl"
        type="url"
        defaultValue={booking.location?.map_url ?? legacyDetailsMapUrl}
        placeholder="Paste the Google Maps place or directions link"
      />
    </label>
  );
}

function hasPrintedHotelTime(item: import("../trips/types").ItineraryItem | undefined) {
  if (!item) return true;
  return item.has_explicit_start_time ?? item.timing_mode !== "date_only";
}

function HotelStayEditFields({
  trip,
  booking,
  milestones,
  timezone,
  localDefaultTimezone
}: {
  trip: Trip;
  booking: Booking;
  milestones: import("../trips/types").ItineraryItem[];
  timezone: string;
  localDefaultTimezone: string;
}) {
  const checkIn = milestones.find((item) => item.event_type === "hotel_check_in");
  const checkout = milestones.find((item) => item.event_type === "hotel_check_out");
  const checkInLocal =
    isoToLocalDateTime(checkIn?.starts_at ?? booking.start_at, timezone) ||
    `${trip.start_date}T12:00`;
  const checkoutLocal =
    isoToLocalDateTime(checkout?.starts_at ?? booking.end_at, timezone) || `${trip.end_date}T12:00`;
  const [checkInDate, setCheckInDate] = useState(
    checkIn?.scheduled_date ?? checkInLocal.slice(0, 10)
  );
  const [checkInTime, setCheckInTime] = useState(
    hasPrintedHotelTime(checkIn) ? checkInLocal.slice(11, 16) : ""
  );
  const [checkoutDate, setCheckoutDate] = useState(
    checkout?.scheduled_date ?? checkoutLocal.slice(0, 10)
  );
  const [checkoutTime, setCheckoutTime] = useState(
    hasPrintedHotelTime(checkout) ? checkoutLocal.slice(11, 16) : ""
  );

  return (
    <fieldset className="rounded-2xl border border-line p-4">
      <legend className="px-1 text-sm font-extrabold">Stay</legend>
      <div className="mt-2 grid gap-4 sm:grid-cols-2">
        <label className="form-label">
          Check-in date
          <input
            className="form-input"
            name="checkInDate"
            type="date"
            min={trip.start_date}
            max={trip.end_date}
            value={checkInDate}
            onChange={(event) => {
              const next = event.target.value;
              setCheckInDate(next);
              if (checkoutDate < next) setCheckoutDate(next);
            }}
            required
          />
        </label>
        <label className="form-label">
          Printed check-in time (optional)
          <input
            className="form-input"
            name="checkInTime"
            type="time"
            value={checkInTime}
            onChange={(event) => setCheckInTime(event.target.value)}
          />
        </label>
        <label className="form-label">
          Checkout date
          <input
            className="form-input"
            name="checkoutDate"
            type="date"
            min={checkInDate || trip.start_date}
            max={trip.end_date}
            value={checkoutDate}
            onChange={(event) => setCheckoutDate(event.target.value)}
            required
          />
        </label>
        <label className="form-label">
          Printed checkout time (optional)
          <input
            className="form-input"
            name="checkoutTime"
            type="time"
            value={checkoutTime}
            onChange={(event) => setCheckoutTime(event.target.value)}
          />
        </label>
      </div>
      <p className="mt-3 text-xs leading-5 text-muted">
        Leave a printed time empty when the confirmation only gives a date. Trip Vault keeps a
        neutral local time for ordering without presenting it as a confirmed time.
      </p>
      <div className="mt-4">
        <EventTimeZoneField
          value={timezone}
          localDefaultValue={localDefaultTimezone}
          label="Stay time zone"
          hint="Changing this keeps the entered check-in and checkout clocks and recalculates their exact instants together."
        />
      </div>
      <input type="hidden" name="startsAt" value={`${checkInDate}T${checkInTime || "12:00"}`} />
      <input type="hidden" name="endsAt" value={`${checkoutDate}T${checkoutTime || "12:00"}`} />
      <input type="hidden" name="checkInHasTime" value={checkInTime ? "yes" : "no"} />
      <input type="hidden" name="checkoutHasTime" value={checkoutTime ? "yes" : "no"} />
    </fieldset>
  );
}

type ReservationStateOption = { value: ReservationState; label: string };

function bookingStatusOptions(
  type: Booking["type"],
  current: ReservationState
): ReservationStateOption[] {
  let options: ReservationStateOption[];
  if (["train", "bus", "ferry"].includes(type)) {
    options = [
      { value: "planned", label: "Plan only — ticket not booked" },
      { value: "walk_up", label: "Buy when needed / walk-up" },
      { value: "booked", label: "Ticket booked" }
    ];
  } else if (type === "cab") {
    options = [
      { value: "planned", label: "Need a cab" },
      { value: "booked", label: "Booked in advance" },
      { value: "walk_up", label: "Already took this ride" }
    ];
  } else {
    options =
      type === "hotel"
        ? [
            { value: "planned", label: "Planning only" },
            { value: "booked", label: "Hotel booked" }
          ]
        : type === "restaurant"
          ? [
              { value: "planned", label: "Planning only" },
              { value: "booked", label: "Table reserved" }
            ]
          : [
              { value: "planned", label: "Planning only" },
              { value: "booked", label: "Booking confirmed" }
            ];
  }
  if (!options.some((option) => option.value === current))
    options.push({ value: current, label: `Keep current status — ${current.replace("_", " ")}` });
  return options;
}

export function AddBookingForm({
  trip,
  travelers,
  preferredTravelerId,
  onClose
}: {
  trip: Trip;
  travelers: Traveler[];
  preferredTravelerId?: string;
  onClose: () => void;
}) {
  return (
    <AddEventForm
      trip={trip}
      travelers={travelers}
      preferredTravelerId={preferredTravelerId}
      onClose={onClose}
    />
  );
}

export function EditBookingForm({
  trip,
  booking,
  travelers,
  selectedTravelerIds,
  onClose
}: {
  trip: Trip;
  booking: Booking;
  travelers: Traveler[];
  selectedTravelerIds: string[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [bookedViaUrl, setBookedViaUrl] = useState(booking.booked_via_url ?? "");
  const isHotel = booking.type === "hotel";
  const itinerary = useQuery({
    queryKey: ["itinerary", trip.id],
    queryFn: () => listItinerary(trip.id),
    enabled: isHotel
  });
  const hotelMilestones = (itinerary.data ?? []).filter(
    (item) =>
      item.booking_id === booking.id &&
      (item.event_type === "hotel_check_in" || item.event_type === "hotel_check_out")
  );
  const mutation = useMutation({
    mutationFn: async (input: BookingEditMutationInput) => {
      if (input.type !== "hotel") return updateBooking(input);
      const { id, ...stay } = input;
      return (await saveHotelStay({ ...stay, bookingId: id, eventType: "hotel_check_in" })).booking;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["booking", booking.id] }),
        queryClient.invalidateQueries({ queryKey: ["bookings", trip.id] }),
        queryClient.invalidateQueries({ queryKey: ["booking-traveler-ids", booking.id] }),
        queryClient.invalidateQueries({ queryKey: ["booking-travelers", trip.id] }),
        queryClient.invalidateQueries({ queryKey: ["itinerary-participants", trip.id] }),
        queryClient.invalidateQueries({ queryKey: ["itinerary", trip.id] })
      ]);
      onClose();
    }
  });
  const timezone = booking.source_timezone ?? trip.primary_timezone;
  const isJourney = ["flight", "train", "bus", "ferry", "cab"].includes(booking.type);
  const providerIsDerived = isJourney || isHotel;
  const showContactName = booking.type !== "flight" && booking.type !== "train";
  const initialReservationState: ReservationState =
    booking.type === "flight" ? "booked" : (booking.reservation_state ?? "booked");
  const initialParticipantScope =
    booking.participant_scope ??
    (selectedTravelerIds.length === 0 || selectedTravelerIds.length === travelers.length
      ? "everyone"
      : "selected");
  const statusOptions = bookingStatusOptions(booking.type, initialReservationState);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    const form = new FormData(event.currentTarget);
    const parsed = bookingSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success) {
      setMessage(firstValidationMessage(parsed.error));
      return;
    }
    const travelerIds = form.getAll("travelerIds").map(String);
    if (parsed.data.participantScope === "selected" && !travelerIds.length) {
      setMessage("Choose at least one traveler, or select Everyone.");
      return;
    }
    const zone = parsed.data.timezone || timezone;
    try {
      const preservedBookingDetails = { ...booking.details };
      delete preservedBookingDetails.notes;
      if (isHotel) {
        const roomCount = String(form.get("roomCount") ?? "").trim();
        if (roomCount && (!Number.isSafeInteger(Number(roomCount)) || Number(roomCount) < 1)) {
          setMessage("Number of rooms must be a whole number of at least 1.");
          return;
        }
        for (const key of ["room_type", "room_count", "lead_guest"]) {
          delete preservedBookingDetails[key];
        }
        const roomType = String(form.get("roomType") ?? "").trim();
        const leadGuest = String(form.get("leadGuest") ?? "").trim();
        if (roomType) preservedBookingDetails.room_type = roomType;
        if (roomCount) preservedBookingDetails.room_count = Number(roomCount);
        if (leadGuest) preservedBookingDetails.lead_guest = leadGuest;
      }
      mutation.mutate({
        ...parsed.data,
        provider: isHotel ? parsed.data.title : parsed.data.provider,
        id: booking.id,
        tripId: trip.id,
        version: booking.version,
        startsAt: parsed.data.startsAt ? localDateTimeToIso(parsed.data.startsAt, zone) : undefined,
        endsAt: parsed.data.endsAt ? localDateTimeToIso(parsed.data.endsAt, zone) : undefined,
        timezone: zone,
        travelerIds: parsed.data.participantScope === "everyone" ? [] : travelerIds,
        ...(isHotel
          ? {
              bookingDetails: preservedBookingDetails,
              mapUrl: parsed.data.mapUrl || undefined,
              hotelCheckInHasTime: form.get("checkInHasTime") === "yes",
              hotelCheckoutHasTime: form.get("checkoutHasTime") === "yes"
            }
          : {})
      });
    } catch (error) {
      setMessage(getErrorMessage(error));
    }
  };

  return (
    <ModalSheet eyebrow={trip.title} title="Edit booking" onClose={onClose}>
      <form className="mt-6 space-y-4" onSubmit={submit}>
        <input type="hidden" name="type" value={booking.type} />
        {!isHotel && <input type="hidden" name="timezone" value={timezone} />}
        {booking.type === "flight" ? (
          <input type="hidden" name="reservationState" value="booked" />
        ) : (
          <label className="form-label">
            Booking status
            <select
              className="form-input"
              name="reservationState"
              defaultValue={initialReservationState}
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="form-label">
          Type
          <input className="form-input capitalize opacity-70" value={booking.type} readOnly />
        </label>
        <label className="form-label">
          {isHotel ? "Hotel / property name" : "Booking title"}
          <input autoFocus className="form-input" name="title" defaultValue={booking.title} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          {providerIsDerived ? (
            <>
              <input type="hidden" name="provider" value={booking.provider ?? ""} />
              <div className="rounded-xl bg-elevated p-3 text-sm">
                <strong className="block">{isHotel ? "Property" : "Airline / operator"}</strong>
                <span className="mt-1 block text-xs text-muted">
                  {isHotel
                    ? "Uses the hotel / property name above"
                    : booking.provider || "Derived from the journey connections"}
                </span>
              </div>
            </>
          ) : (
            <label className="form-label">
              Service provider
              <input
                className="form-input"
                name="provider"
                defaultValue={booking.provider ?? ""}
                placeholder="Name the business providing this booking"
              />
            </label>
          )}
          <label className="form-label">
            {booking.type === "flight" ? "Booking reference / PNR" : "Booking reference"}
            {booking.type === "ferry" && " (optional)"}
            <input
              className="form-input uppercase"
              name="referenceCode"
              defaultValue={booking.reference_code ?? ""}
              placeholder="Enter the reference shown on the confirmation"
            />
          </label>
        </div>
        {booking.journey_scope && (
          <>
            <input type="hidden" name="journeyScope" value={booking.journey_scope} />
            <div className="rounded-xl bg-elevated p-3 text-sm">
              <strong className="capitalize">{booking.journey_scope} journey</strong>
              <span className="mt-1 block text-xs text-muted">
                Edit route times, airports, stations, and connections in the journey details.
              </span>
            </div>
          </>
        )}
        {isHotel ? (
          <>
            {itinerary.isLoading && (
              <p className="rounded-xl bg-elevated p-4 text-sm text-muted">
                Loading the paired check-in and checkout…
              </p>
            )}
            {itinerary.isError && (
              <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm font-bold text-danger">
                The paired hotel timeline items could not be loaded. Refresh before editing this
                stay.
              </p>
            )}
            {itinerary.isSuccess && (
              <HotelStayEditFields
                key={hotelMilestones.map((item) => `${item.id}:${item.version ?? ""}`).join("|")}
                trip={trip}
                booking={booking}
                milestones={hotelMilestones}
                timezone={timezone}
                localDefaultTimezone={furthestEventTimezone(
                  itinerary.data ?? [],
                  trip.primary_timezone
                )}
              />
            )}
            <label className="form-label">
              Hotel address
              <input
                className="form-input"
                name="location"
                defaultValue={booking.location?.address ?? booking.location?.label ?? ""}
                placeholder="Enter the property name or full address"
              />
            </label>
            <BookingMapUrlField booking={booking} />
            <FormSection>
              <summary>Room & guest details (optional)</summary>
              <p className="text-xs text-muted">You can add or update these details later.</p>
              <label className="form-label">
                Room type (optional)
                <input
                  className="form-input"
                  name="roomType"
                  defaultValue={
                    typeof booking.details.room_type === "string" ? booking.details.room_type : ""
                  }
                  placeholder="Room type shown on the confirmation"
                />
              </label>
              <label className="form-label">
                Number of rooms (optional)
                <input
                  className="form-input"
                  name="roomCount"
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  defaultValue={
                    typeof booking.details.room_count === "number" ? booking.details.room_count : ""
                  }
                  placeholder="How many rooms are reserved"
                />
              </label>
              <label className="form-label">
                Lead guest (optional)
                <input
                  className="form-input"
                  name="leadGuest"
                  defaultValue={
                    typeof booking.details.lead_guest === "string" ? booking.details.lead_guest : ""
                  }
                  placeholder="Lead guest shown on the booking"
                />
              </label>
            </FormSection>
          </>
        ) : isJourney ? (
          <>
            <input
              type="hidden"
              name="startsAt"
              value={isoToLocalDateTime(booking.start_at, timezone)}
            />
            <input
              type="hidden"
              name="endsAt"
              value={isoToLocalDateTime(booking.end_at, timezone)}
            />
            <input type="hidden" name="location" value="" />
            <BookingMapUrlField booking={booking} />
          </>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="form-label">
                Starts
                <input
                  className="form-input"
                  name="startsAt"
                  type="datetime-local"
                  defaultValue={isoToLocalDateTime(booking.start_at, timezone)}
                />
              </label>
              <label className="form-label">
                Ends
                <input
                  className="form-input"
                  name="endsAt"
                  type="datetime-local"
                  defaultValue={isoToLocalDateTime(booking.end_at, timezone)}
                />
              </label>
            </div>
            <label className="form-label">
              Location
              <input
                className="form-input"
                name="location"
                defaultValue={booking.location?.address ?? booking.location?.label ?? ""}
                placeholder="Enter the place name or full address"
              />
            </label>
            <BookingMapUrlField booking={booking} />
          </>
        )}
        <FormSection>
          <summary>Booking contact & notes</summary>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="form-label">
              Booked via
              <VendorPicker
                defaultValue={booking.booked_via_name ?? ""}
                onWebsite={setBookedViaUrl}
              />
            </label>
            <label className="form-label">
              Booking website
              <input
                className="form-input"
                type="url"
                name="bookedViaUrl"
                value={bookedViaUrl}
                onChange={(event) => setBookedViaUrl(event.target.value)}
                placeholder="Paste the reservation or confirmation link"
              />
            </label>
            {showContactName && (
              <label className="form-label">
                Contact name
                <input
                  className="form-input"
                  name="contactName"
                  defaultValue={booking.contact_name ?? ""}
                  placeholder="Name the property, activity, or transport contact"
                />
              </label>
            )}
            {!showContactName && (
              <input type="hidden" name="contactName" value={booking.contact_name ?? ""} />
            )}
            <label className="form-label">
              Phone
              <input
                className="form-input"
                type="tel"
                name="contactPhone"
                defaultValue={booking.contact_phone ?? ""}
                placeholder="Include country code for Call and WhatsApp"
              />
            </label>
          </div>
          <label className="form-label">
            Notes
            <textarea
              className="form-input min-h-24"
              name="notes"
              defaultValue={typeof booking.details.notes === "string" ? booking.details.notes : ""}
            />
          </label>
        </FormSection>
        <ParticipantSelector
          travelers={travelers}
          selectedTravelerIds={
            initialParticipantScope === "everyone" ? undefined : selectedTravelerIds
          }
          initialScope={initialParticipantScope}
          scopeName="participantScope"
        />
        {isHotel && (
          <p className="text-xs leading-5 text-muted">
            Hotel details, traveler scope, check-in, and checkout are saved together. Editing this
            stay requires a connection so the paired timeline items cannot drift apart.
          </p>
        )}
        {(message || mutation.error) && (
          <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm font-bold text-danger">
            {message || getErrorMessage(mutation.error)}
          </p>
        )}
        <button
          className="primary-button w-full"
          disabled={mutation.isPending || (isHotel && (!itinerary.isSuccess || !navigator.onLine))}
        >
          {mutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <TicketCheck className="size-4" />
          )}{" "}
          Save changes
        </button>
      </form>
    </ModalSheet>
  );
}

export function AddTravelerForm({ trip, onClose }: { trip: Trip; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const draft = useFormDraft(`traveler:new:${trip.id}`);
  const mutation = useMutation({
    mutationFn: addTraveler,
    onSuccess: async () => {
      draft.clearDraft();
      await queryClient.invalidateQueries({ queryKey: ["travelers", trip.id] });
      onClose();
    }
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const displayName = String(form.get("displayName") ?? "").trim();
    if (!displayName) {
      setMessage("Enter the traveler's name.");
      return;
    }
    mutation.mutate({ tripId: trip.id, displayName, isMinor: form.get("isMinor") === "on" });
  };
  return (
    <ModalSheet eyebrow={trip.title} title="Add a traveler" onClose={onClose}>
      <form ref={draft.formRef} onSubmit={submit} className="mt-6 space-y-4">
        <label className="form-label">
          Traveler name
          <input autoFocus className="form-input" name="displayName" />
        </label>
        <label className="flex items-start gap-3 rounded-2xl border border-line p-4 text-sm">
          <input className="mt-1 size-4" type="checkbox" name="isMinor" />
          <span>
            <strong className="block">This traveler is a child</strong>
            <span className="mt-1 block text-muted">
              This is a workflow label only and does not infer legal authority.
            </span>
          </span>
        </label>
        {(message || mutation.error) && (
          <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm font-bold text-danger">
            {message || getErrorMessage(mutation.error)}
          </p>
        )}
        <button className="primary-button w-full" disabled={mutation.isPending}>
          {mutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <UserPlus className="size-4" />
          )}{" "}
          Add traveler
        </button>
      </form>
    </ModalSheet>
  );
}

export function EditTravelerForm({
  trip,
  traveler,
  onClose
}: {
  trip: Trip;
  traveler: Traveler;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const mutation = useMutation({
    mutationFn: updateTraveler,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["travelers", trip.id] });
      onClose();
    }
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const displayName = String(form.get("displayName") ?? "").trim();
    if (!displayName) {
      setMessage("Enter the traveler's name.");
      return;
    }
    mutation.mutate({ traveler, displayName, isMinor: form.get("isMinor") === "on" });
  };
  return (
    <ModalSheet eyebrow={trip.title} title="Edit traveler" onClose={onClose}>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <label className="form-label">
          Traveler name
          <input
            autoFocus
            className="form-input"
            name="displayName"
            defaultValue={traveler.display_name}
          />
        </label>
        <label className="flex items-start gap-3 rounded-2xl border border-line p-4 text-sm">
          <input
            className="mt-1 size-4"
            type="checkbox"
            name="isMinor"
            defaultChecked={traveler.is_minor}
          />
          <span>
            <strong className="block">This traveler is a child</strong>
            <span className="mt-1 block text-muted">
              A workflow label only; it does not infer legal authority.
            </span>
          </span>
        </label>
        {(message || mutation.error) && (
          <p role="alert" className="text-sm font-bold text-danger">
            {message || getErrorMessage(mutation.error)}
          </p>
        )}
        <button className="primary-button w-full" disabled={mutation.isPending}>
          <UserPlus className="size-4" /> Save traveler
        </button>
      </form>
    </ModalSheet>
  );
}

export function ShareTripForm({
  trip,
  travelers,
  onClose
}: {
  trip: Trip;
  travelers: Traveler[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [method, setMethod] = useState<"code" | "known">("code");
  const [targetType, setTargetType] = useState<"traveler" | "collaborator">("traveler");
  const [message, setMessage] = useState("");
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [offerSent, setOfferSent] = useState("");
  const invitations = useQuery({
    queryKey: ["invitations", trip.id],
    queryFn: () => listInvitations(trip.id),
    enabled: navigator.onLine
  });
  const associated = useQuery({
    queryKey: ["associated-accounts"],
    queryFn: listAssociatedAccounts,
    enabled: navigator.onLine
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["invitations", trip.id] });
  const mutation = useMutation({
    mutationFn: createInvitation,
    onSuccess: async (createdCode) => {
      setCode(createdCode);
      await refresh();
    }
  });
  const offer = useMutation({
    mutationFn: createTripMembershipOffer,
    onSuccess: (_, input) => {
      const account = associated.data?.find((item) => item.user_id === input.userId);
      setOfferSent(
        `${account?.display_name ?? "This account"} can now accept ${trip.title} from Trips.`
      );
    }
  });
  const revoke = useMutation({ mutationFn: revokeInvitation, onSuccess: refresh });
  const replace = useMutation({
    mutationFn: async (invitation: NonNullable<typeof invitations.data>[number]) => {
      await revokeInvitation(invitation.id);
      return createInvitation({
        tripId: trip.id,
        targetType: invitation.target_type,
        travelerId: invitation.traveler_id ?? undefined,
        role: invitation.role
      });
    },
    onSuccess: async (createdCode) => {
      setCode(createdCode);
      await refresh();
    }
  });
  const submitCode = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    const form = new FormData(event.currentTarget);
    const travelerId = String(form.get("travelerId") ?? "");
    if (targetType === "traveler" && !travelerId) {
      setMessage("Select the person this code belongs to.");
      return;
    }
    mutation.mutate({
      tripId: trip.id,
      targetType,
      travelerId: targetType === "traveler" ? travelerId : undefined,
      role: String(form.get("role")) as "editor" | "viewer"
    });
  };
  const submitKnown = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    setOfferSent("");
    const form = new FormData(event.currentTarget);
    const userId = String(form.get("userId") ?? "");
    const travelerId = String(form.get("knownTravelerId") ?? "");
    if (!userId) {
      setMessage("Choose a previously associated account.");
      return;
    }
    if (targetType === "traveler" && !travelerId) {
      setMessage("Choose which traveler profile this account belongs to.");
      return;
    }
    offer.mutate({
      tripId: trip.id,
      userId,
      targetType,
      travelerId: targetType === "traveler" ? travelerId : undefined,
      role: String(form.get("knownRole")) as "editor" | "viewer"
    });
  };
  const joinUrl = code ? `${window.location.origin}/join?code=${encodeURIComponent(code)}` : "";
  const copy = async (value = code) => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
  };
  const TargetType = () => (
    <div className="grid grid-cols-2 rounded-2xl bg-elevated p-1">
      <button
        type="button"
        onClick={() => setTargetType("traveler")}
        className={`tap-target rounded-xl text-sm font-bold ${targetType === "traveler" ? "bg-surface shadow-soft" : "text-muted"}`}
      >
        Traveler
      </button>
      <button
        type="button"
        onClick={() => setTargetType("collaborator")}
        className={`tap-target rounded-xl text-sm font-bold ${targetType === "collaborator" ? "bg-surface shadow-soft" : "text-muted"}`}
      >
        Non-traveling helper
      </button>
    </div>
  );

  return (
    <ModalSheet eyebrow={trip.title} title="Share this trip" onClose={onClose}>
      {!code && (
        <div className="mt-6 grid grid-cols-2 rounded-2xl border border-line p-1">
          <button
            type="button"
            onClick={() => {
              setMethod("code");
              setMessage("");
            }}
            className={`tap-target rounded-xl text-sm font-bold ${method === "code" ? "bg-brand text-surface" : "text-muted"}`}
          >
            Private code / QR
          </button>
          <button
            type="button"
            onClick={() => {
              setMethod("known");
              setMessage("");
            }}
            className={`tap-target rounded-xl text-sm font-bold ${method === "known" ? "bg-brand text-surface" : "text-muted"}`}
          >
            Known account
          </button>
        </div>
      )}
      {code ? (
        <div className="mt-7 text-center">
          <LocalQrCode value={joinUrl} />
          <p className="mt-5 text-sm text-muted">
            The recipient signs in, scans this QR, and confirms the prefilled one-time code. It
            expires after 14 days and cannot be reused.
          </p>
          <button
            onClick={() => copy(code)}
            type="button"
            className="mt-5 inline-flex items-center gap-3 rounded-2xl bg-brand px-5 py-4 font-mono text-xl font-black tracking-[0.12em] text-surface"
          >
            {code} {copied ? <Check className="size-5" /> : <Clipboard className="size-5" />}
          </button>
          <button
            type="button"
            className="secondary-button mx-auto mt-3"
            onClick={() => copy(joinUrl)}
          >
            <Clipboard className="size-4" /> Copy private link
          </button>
          <button
            type="button"
            className="secondary-button mx-auto mt-3"
            onClick={() => {
              setCode("");
              setCopied(false);
            }}
          >
            Create another code
          </button>
        </div>
      ) : method === "known" ? (
        <form onSubmit={submitKnown} className="mt-5 space-y-4">
          <TargetType />
          <label className="form-label">
            Previously associated account
            <select className="form-input" name="userId" defaultValue="">
              <option value="" disabled>
                Choose an account
              </option>
              {associated.data?.map((account) => (
                <option key={account.user_id} value={account.user_id}>
                  {account.display_name}
                </option>
              ))}
            </select>
          </label>
          {targetType === "traveler" && (
            <label className="form-label">
              Which traveler are they?
              <select className="form-input" name="knownTravelerId" defaultValue="">
                <option value="" disabled>
                  Select traveler
                </option>
                {travelers.map((traveler) => (
                  <option key={traveler.id} value={traveler.id}>
                    {traveler.display_name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="form-label">
            App access
            <select className="form-input" name="knownRole" defaultValue="viewer">
              <option value="viewer">Viewer — use their relevant trip information</option>
              <option value="editor">Editor — also edit the shared trip</option>
            </select>
          </label>
          <p className="rounded-2xl bg-brand-soft p-4 text-sm leading-6 text-muted">
            No code is needed. The account receives a pending invitation on Home and must accept
            before the trip appears.
          </p>
          {associated.data?.length === 0 && (
            <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">
              No reusable accounts yet. After someone joins one of your trips with a code, they will
              appear here for future trips.
            </p>
          )}
          {(message || offer.error) && (
            <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm font-bold text-danger">
              {message || getErrorMessage(offer.error)}
            </p>
          )}
          {offerSent && (
            <p
              role="status"
              className="rounded-xl bg-success/10 p-3 text-sm font-bold text-success"
            >
              {offerSent}
            </p>
          )}
          <button
            className="primary-button w-full"
            disabled={offer.isPending || !navigator.onLine || !associated.data?.length}
          >
            {offer.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <UsersRound className="size-4" />
            )}{" "}
            Send invitation
          </button>
        </form>
      ) : (
        <form onSubmit={submitCode} className="mt-5 space-y-4">
          <TargetType />
          {targetType === "traveler" && (
            <label className="form-label">
              Who is this code for?
              <select className="form-input" name="travelerId" defaultValue="">
                <option value="" disabled>
                  Select traveler
                </option>
                {travelers.map((traveler) => (
                  <option key={traveler.id} value={traveler.id}>
                    {traveler.display_name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="form-label">
            App access
            <select className="form-input" name="role" defaultValue="viewer">
              <option value="viewer">Viewer — can view and manage own documents</option>
              <option value="editor">Editor — can also edit the shared trip</option>
            </select>
          </label>
          <p className="rounded-2xl bg-brand-soft p-4 text-sm leading-6 text-muted">
            The recipient must sign in before the one-time code can reveal or join the trip.
          </p>
          {(message || mutation.error) && (
            <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm font-bold text-danger">
              {message || getErrorMessage(mutation.error)}
            </p>
          )}
          <button
            className="primary-button w-full"
            disabled={mutation.isPending || !navigator.onLine}
          >
            {mutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <UsersRound className="size-4" />
            )}{" "}
            Generate one-time code
          </button>
        </form>
      )}
      {method === "code" && (
        <section className="mt-7 border-t border-line pt-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="eyebrow">Invitation history</p>
              <p className="mt-1 text-sm text-muted">
                Codes themselves are intentionally never stored in readable form.
              </p>
            </div>
            {invitations.isFetching && <Loader2 className="size-4 animate-spin text-muted" />}
          </div>
          <div className="mt-3 space-y-2">
            {invitations.data?.slice(0, 10).map((invitation) => {
              const traveler = travelers.find((item) => item.id === invitation.traveler_id);
              const status = invitation.redeemed_at
                ? "used"
                : invitation.revoked_at
                  ? "revoked"
                  : new Date(invitation.expires_at) <= new Date()
                    ? "expired"
                    : "active";
              return (
                <div key={invitation.id} className="rounded-2xl border border-line bg-elevated p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold">
                        {invitation.target_type === "collaborator"
                          ? "Non-traveling helper"
                          : (traveler?.display_name ?? "Traveler")}{" "}
                        · {invitation.role}
                      </p>
                      <p className="mt-1 text-xs capitalize text-muted">
                        {status} · expires {new Date(invitation.expires_at).toLocaleDateString()}
                      </p>
                    </div>
                    {status === "active" && (
                      <div className="flex">
                        <button
                          type="button"
                          disabled={replace.isPending}
                          onClick={() => replace.mutate(invitation)}
                          className="tap-target grid size-9 place-items-center text-brand"
                          aria-label="Replace invitation code"
                        >
                          <RefreshCw className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={revoke.isPending}
                          onClick={() => revoke.mutate(invitation.id)}
                          className="tap-target grid size-9 place-items-center text-danger"
                          aria-label="Revoke invitation"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {invitations.data?.length === 0 && (
              <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">
                No invitations yet.
              </p>
            )}
            {!navigator.onLine && (
              <p className="text-sm text-warning">
                Invitation history and changes require a connection.
              </p>
            )}
          </div>
        </section>
      )}
    </ModalSheet>
  );
}

export function AddRequirementForm({
  trip,
  travelers = [],
  requirement,
  preferredTravelerId,
  onClose
}: {
  trip: Trip;
  travelers?: Traveler[];
  requirement?: Requirement;
  preferredTravelerId?: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const initialTimingMode =
    requirement?.timing_mode ?? (requirement?.due_date ? "date_only" : "unscheduled");
  const initialOffsetMinutes = requirement?.offset_minutes ?? 0;
  const initialOffsetUnit =
    initialOffsetMinutes > 0 && initialOffsetMinutes % 10_080 === 0
      ? "weeks"
      : initialOffsetMinutes > 0 && initialOffsetMinutes % 1_440 === 0
        ? "days"
        : initialOffsetMinutes > 0 && initialOffsetMinutes % 60 === 0
          ? "hours"
          : "minutes";
  const initialOffsetValue =
    initialOffsetUnit === "weeks"
      ? initialOffsetMinutes / 10_080
      : initialOffsetUnit === "days"
        ? initialOffsetMinutes / 1_440
        : initialOffsetUnit === "hours"
          ? initialOffsetMinutes / 60
          : initialOffsetMinutes;
  const [timingMode, setTimingMode] = useState(initialTimingMode);
  const draft = useFormDraft(`requirement:${requirement?.id ?? "new"}:${trip.id}`);
  const assignees = useQuery({
    queryKey: ["requirement-assignee-ids", requirement?.id],
    queryFn: () => listRequirementAssigneeIds(requirement!.id, trip.id),
    enabled: Boolean(requirement)
  });
  const itinerary = useQuery({
    queryKey: ["itinerary", trip.id],
    queryFn: () => listItinerary(trip.id),
    enabled: timingMode === "relative"
  });
  const anchorOptions = (itinerary.data ?? []).filter(
    (item) => item.timing_mode !== "unscheduled" && item.timing_mode !== "relative"
  );
  const mutation = useMutation({
    mutationFn: (input: RequirementInput) =>
      requirement
        ? updateRequirement({ ...input, id: requirement.id, version: requirement.version })
        : addRequirement(input),
    onSuccess: async () => {
      draft.clearDraft();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["requirements", trip.id] }),
        queryClient.invalidateQueries({ queryKey: ["requirement-assignee-ids", requirement?.id] }),
        queryClient.invalidateQueries({ queryKey: ["alerts"] })
      ]);
      onClose();
    }
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") ?? "").trim();
    const dueDate =
      timingMode === "date_only"
        ? String(form.get("dueDate") ?? "").trim() || undefined
        : undefined;
    const notes = String(form.get("notes") ?? "").trim() || undefined;
    if (!title) {
      setMessage("Enter the task that needs to be done.");
      return;
    }
    if (timingMode === "date_only" && !dueDate) {
      setMessage("Choose the date when this task should appear.");
      return;
    }
    const anchorItineraryItemId =
      timingMode === "relative" ? String(form.get("anchorItineraryItemId") ?? "") : undefined;
    if (timingMode === "relative" && !anchorItineraryItemId) {
      setMessage("Choose the event this task belongs before or after.");
      return;
    }
    const offsetValue = Number(form.get("offsetValue") ?? 0);
    const offsetUnit = String(form.get("offsetUnit") ?? "days");
    if (timingMode === "relative" && (!Number.isFinite(offsetValue) || offsetValue < 0)) {
      setMessage("Enter a valid non-negative offset.");
      return;
    }
    const offsetMultiplier =
      offsetUnit === "weeks"
        ? 10_080
        : offsetUnit === "days"
          ? 1_440
          : offsetUnit === "hours"
            ? 60
            : 1;
    if (requirement && !assignees.isSuccess) {
      setMessage("Wait for this task to finish loading, then try again.");
      return;
    }
    const participantScope = String(form.get("participantScope") ?? "everyone");
    const travelerIds =
      participantScope === "selected" ? form.getAll("travelerIds").map(String) : [];
    if (participantScope === "selected" && travelerIds.length === 0) {
      setMessage("Select at least one traveler for this task.");
      return;
    }
    mutation.mutate({
      tripId: trip.id,
      type: requirement?.type ?? "custom",
      title,
      status: requirement?.status ?? "to_check",
      destinationCountryCode: requirement?.destination_country_code ?? undefined,
      visaType: requirement?.visa_type ?? undefined,
      dueDate,
      timingMode,
      anchorItineraryItemId,
      relativePosition:
        timingMode === "relative"
          ? (String(form.get("relativePosition") ?? "before") as "before" | "after")
          : undefined,
      offsetMinutes:
        timingMode === "relative" ? Math.round(offsetValue * offsetMultiplier) : undefined,
      issuedOn: requirement?.issued_on ?? undefined,
      expiresOn: requirement?.expires_on ?? undefined,
      validityBufferDays: requirement?.validity_buffer_days ?? undefined,
      officialGuidanceUrl: requirement?.official_guidance_url ?? undefined,
      linkedDocumentId: requirement?.linked_document_id ?? undefined,
      notes,
      travelerIds
    });
  };
  return (
    <ModalSheet
      eyebrow={trip.title}
      title={requirement ? "Edit task" : "Add task"}
      onClose={onClose}
    >
      <form ref={draft.formRef} onSubmit={submit} className="mt-6 space-y-4">
        <label className="form-label">
          Task
          <input
            autoFocus
            className="form-input"
            name="title"
            placeholder="What needs to be done?"
            defaultValue={requirement?.title ?? ""}
          />
        </label>
        <label className="form-label">
          When should it appear?
          <select
            className="form-input"
            name="timingMode"
            value={timingMode}
            onChange={(event) => setTimingMode(event.target.value as typeof timingMode)}
          >
            <option value="unscheduled">Checklist only</option>
            <option value="date_only">On a date</option>
            <option value="relative">Before or after an event</option>
          </select>
        </label>
        {timingMode === "date_only" && (
          <label className="form-label">
            Date
            <input
              className="form-input"
              type="date"
              name="dueDate"
              defaultValue={requirement?.due_date ?? ""}
            />
          </label>
        )}
        {timingMode === "relative" && (
          <fieldset className="rounded-2xl border border-line p-4">
            <legend className="px-1 text-sm font-extrabold">Timeline position</legend>
            <div className="mt-2 grid gap-4 sm:grid-cols-2">
              <label className="form-label">
                Position
                <select
                  className="form-input"
                  name="relativePosition"
                  defaultValue={requirement?.relative_position ?? "before"}
                >
                  <option value="before">Before</option>
                  <option value="after">After</option>
                </select>
              </label>
              <label className="form-label">
                Event
                <select
                  className="form-input"
                  name="anchorItineraryItemId"
                  defaultValue={requirement?.anchor_itinerary_item_id ?? ""}
                >
                  <option value="">Select an event</option>
                  {anchorOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-label">
                How long?
                <input
                  className="form-input"
                  type="number"
                  name="offsetValue"
                  min="0"
                  step="1"
                  defaultValue={initialOffsetValue}
                />
              </label>
              <label className="form-label">
                Unit
                <select className="form-input" name="offsetUnit" defaultValue={initialOffsetUnit}>
                  <option value="minutes">Minutes</option>
                  <option value="hours">Hours</option>
                  <option value="days">Days</option>
                  <option value="weeks">Weeks</option>
                </select>
              </label>
            </div>
            {itinerary.isLoading && <p className="mt-3 text-xs text-muted">Loading trip events…</p>}
            {itinerary.isSuccess && !anchorOptions.length && (
              <p className="mt-3 text-xs font-bold text-warning">
                Add a dated trip event before linking this task.
              </p>
            )}
          </fieldset>
        )}
        {requirement && !assignees.isSuccess ? (
          <p className="rounded-2xl bg-elevated p-4 text-sm text-muted">
            Loading who this task is for…
          </p>
        ) : (
          <ParticipantSelector
            key={
              requirement
                ? `requirement:${assignees.data?.slice().sort().join(":") || "everyone"}`
                : `new:${preferredTravelerId ?? "everyone"}`
            }
            travelers={travelers}
            scopeName="participantScope"
            initialScope={
              requirement ? (assignees.data?.length ? "selected" : "everyone") : "everyone"
            }
            selectedTravelerIds={
              requirement
                ? (assignees.data ?? [])
                : preferredTravelerId
                  ? [preferredTravelerId]
                  : undefined
            }
          />
        )}
        <label className="form-label">
          Notes (optional)
          <textarea
            className="form-input min-h-20 resize-y"
            name="notes"
            placeholder="Add a useful detail or reminder"
            defaultValue={requirement?.notes ?? ""}
          />
        </label>
        {(message || mutation.error) && (
          <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm font-bold text-danger">
            {message || getErrorMessage(mutation.error)}
          </p>
        )}
        <button
          className="primary-button w-full"
          disabled={mutation.isPending || Boolean(requirement && !assignees.isSuccess)}
        >
          {mutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Check className="size-4" />
          )}{" "}
          {requirement ? "Save task" : "Add task"}
        </button>
      </form>
    </ModalSheet>
  );
}

export type DocumentAssignmentPreset = {
  mode: Extract<DocumentAssignmentMode, "shared" | "selected">;
  travelerIds: string[];
};

export function UploadDocumentForm({
  trip,
  travelers,
  preferredTravelerId,
  onClose,
  onUploaded,
  onCreateEvent,
  bookingId,
  flightLegId,
  journeyLegId,
  contextTitle,
  members = [],
  privateOnly = false,
  initialFile = null,
  initialKind,
  assignmentPreset
}: {
  trip: Trip;
  travelers: Traveler[];
  preferredTravelerId?: string;
  onClose: () => void;
  onUploaded?: (documentId: string) => void | Promise<void>;
  onCreateEvent?: (document: Pick<VaultDocument, "id" | "title">) => void | Promise<void>;
  bookingId?: string;
  flightLegId?: string;
  journeyLegId?: string;
  contextTitle?: string;
  members?: TripMember[];
  privateOnly?: boolean;
  initialFile?: File | null;
  initialKind?: DocumentKind;
  assignmentPreset?: DocumentAssignmentPreset;
}) {
  const resolvedInitialKind: DocumentKind =
    initialKind ??
    (flightLegId
      ? "flight_ticket"
      : journeyLegId
        ? "journey_ticket"
        : bookingId
          ? "booking_confirmation"
          : "other");
  const initialAssignment =
    assignmentPreset?.mode ??
    (initialKind || flightLegId || journeyLegId || bookingId
      ? documentKind(resolvedInitialKind).defaultAssignment
      : "shared");
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<DocumentKind>(resolvedInitialKind);
  const [assignmentMode, setAssignmentMode] = useState<DocumentAssignmentMode>(initialAssignment);
  const [selectedTravelerIds, setSelectedTravelerIds] = useState<string[]>(
    assignmentPreset?.mode === "selected"
      ? assignmentPreset.travelerIds
      : preferredTravelerId
        ? [preferredTravelerId]
        : []
  );
  const [visibility, setVisibility] = useState<DocumentVisibility>(
    privateOnly ? "private" : "trip"
  );
  const [selectedFile, setSelectedFile] = useState<File | null>(initialFile);
  const [customTitle, setCustomTitle] = useState("");
  const [message, setMessage] = useState("");
  const [queuedMessage, setQueuedMessage] = useState("");
  const [createEventAfterUpload, setCreateEventAfterUpload] = useState(false);
  const defaultTitle = suggestedDocumentTitle(
    kind,
    assignmentMode,
    selectedTravelerIds,
    travelers,
    contextTitle
  );
  const title = customTitle.trim() || defaultTitle;
  const draft = useFormDraft(
    `document:new:${trip.id}:${flightLegId ?? journeyLegId ?? bookingId ?? "trip"}`
  );
  const mutation = useMutation({
    mutationFn: uploadDocument,
    onMutate: () => suppressRealtimeRefresh(["documents", "account-document-uploads"], 15_000),
    onSuccess: async (document) => {
      draft.clearDraft();
      queryClient.setQueryData<VaultDocument[]>(["documents", trip.id], (items) =>
        upsertById(items, [document])
      );
      queryClient.setQueryData<VaultDocument[]>(["documents"], (items) =>
        upsertById(items, [document])
      );
      await queryClient.invalidateQueries({ queryKey: ["account-document-uploads"] });
      await onUploaded?.(document.id);
      if (createEventAfterUpload && onCreateEvent) {
        await onCreateEvent({ id: document.id, title: document.title });
        return;
      }
      if (document.sync_state === "queued")
        setQueuedMessage(
          document.sync_error === "permission" || document.sync_error === "schema"
            ? "The file is safe in Profile → Private document inbox, but Supabase refused its cloud action. Run the latest document-inbox migration, then retry it there."
            : document.sync_error === "authentication"
              ? "The file is safe in your private inbox on this device. Sign in again, then retry it from Profile."
              : "The file is safe in Profile → Private document inbox and on this device. Its cloud upload or trip association will retry when synchronization succeeds."
        );
      else onClose();
    }
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    setQueuedMessage("");
    const form = new FormData(event.currentTarget);
    const file = selectedFile;
    const travelerIds = assignmentMode === "selected" ? selectedTravelerIds : [];
    const selectedUserIds = form.getAll("selectedUserIds").map(String);
    const effectiveVisibility: DocumentVisibility = privateOnly ? "private" : visibility;
    if (!file) {
      setMessage("Choose a PDF or image.");
      return;
    }
    if (assignmentMode === "selected" && !travelerIds.length) {
      setMessage("Choose at least one traveler, or select Assign later.");
      return;
    }
    if (effectiveVisibility === "selected_members" && !selectedUserIds.length) {
      setMessage("Choose at least one signed-in member.");
      return;
    }
    const selectedKind = documentKind(kind);
    mutation.mutate({
      tripId: trip.id,
      title,
      category: selectedKind.category,
      purpose: selectedKind.purpose,
      assignmentMode,
      visibility: effectiveVisibility,
      travelerIds,
      bookingId,
      flightLegId,
      journeyLegId,
      selectedUserIds,
      shortLabel: String(form.get("shortLabel") ?? "").trim() || undefined,
      file
    });
  };
  const duplicate = mutation.error instanceof DuplicateDocumentError ? mutation.error : null;
  return (
    <ModalSheet
      eyebrow={trip.title}
      title={initialFile ? "Finish attaching flight document" : "Upload a document"}
      onClose={onClose}
    >
      <form ref={draft.formRef} className="mt-6 space-y-4" onSubmit={submit}>
        {initialFile && (
          <p className="rounded-2xl bg-success/10 p-4 text-sm leading-6 text-muted">
            <strong className="block text-success">Flight saved safely</strong>The flight is already
            on the timeline. Confirm this file's type and visibility; its travelers are copied from
            the flight. If cloud upload fails, the attempted upload stays in your private document
            inbox on this device.
          </p>
        )}
        <FileDropzone
          name="file"
          label="File"
          prompt="Choose the PDF or image"
          file={selectedFile}
          onFileChange={setSelectedFile}
          disabled={Boolean(queuedMessage)}
          busy={mutation.isPending}
          description="PDF, JPEG, PNG, or WebP under 5 MB. The original stays unchanged and is cached offline"
        />
        <label className="form-label">
          Document type
          <select
            className="form-input"
            name="kind"
            value={kind}
            disabled={Boolean(queuedMessage)}
            onChange={(event) => {
              const next = event.target.value as DocumentKind;
              setKind(next);
              if (!assignmentPreset) {
                const mode = documentKind(next).defaultAssignment;
                setAssignmentMode(mode);
                setSelectedTravelerIds(
                  mode === "selected" && preferredTravelerId ? [preferredTravelerId] : []
                );
              }
            }}
          >
            {documentKinds.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} — {option.hint}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="rounded-2xl border border-line p-4">
          <legend className="px-1 text-sm font-bold">Who is it for?</legend>
          {assignmentPreset && (
            <p className="mb-3 text-xs leading-5 text-muted">
              Started from this event's travelers. Change it here when this file belongs to only one
              person, such as a visa, boarding pass, or individual ticket.
            </p>
          )}
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {(
              [
                { value: "shared", label: "Everyone", hint: "One file used together" },
                { value: "selected", label: "Traveler(s)", hint: "Choose one or more people" },
                {
                  value: "unassigned",
                  label: "Assign later",
                  hint: "Use when the owner is unknown"
                }
              ] as const
            ).map((option) => (
              <label
                key={option.value}
                className={`cursor-pointer rounded-xl border p-3 text-sm ${assignmentMode === option.value ? "border-brand bg-brand-soft" : "border-line"}`}
              >
                <input
                  className="sr-only"
                  type="radio"
                  name="assignmentMode"
                  value={option.value}
                  checked={assignmentMode === option.value}
                  onChange={() => {
                    setAssignmentMode(option.value);
                    if (option.value !== "selected") setSelectedTravelerIds([]);
                    else if (!selectedTravelerIds.length && preferredTravelerId)
                      setSelectedTravelerIds([preferredTravelerId]);
                  }}
                />
                <strong className="block">{option.label}</strong>
                <span className="mt-1 block text-xs text-muted">{option.hint}</span>
              </label>
            ))}
          </div>
          {assignmentMode === "selected" && (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {travelers.map((traveler) => (
                <label
                  key={traveler.id}
                  className="flex items-center gap-3 rounded-xl bg-elevated p-3 text-sm"
                >
                  <input
                    type="checkbox"
                    name="travelerIds"
                    value={traveler.id}
                    checked={selectedTravelerIds.includes(traveler.id)}
                    onChange={(event) =>
                      setSelectedTravelerIds((ids) =>
                        event.target.checked
                          ? [...new Set([...ids, traveler.id])]
                          : ids.filter((id) => id !== traveler.id)
                      )
                    }
                    className="size-4"
                  />
                  <span className="font-bold">{traveler.display_name}</span>
                </label>
              ))}
              {!travelers.length && (
                <p className="text-xs font-bold text-warning">
                  Add a traveler first, or choose Assign later.
                </p>
              )}
            </div>
          )}
        </fieldset>
        <label className="form-label">
          Document name (optional)
          <input
            className="form-input"
            name="customTitle"
            value={customTitle}
            onChange={(event) => setCustomTitle(event.target.value)}
            placeholder="Leave empty to name it from its type, traveler, and event"
            disabled={Boolean(queuedMessage)}
          />
        </label>
        <div className="rounded-2xl bg-elevated p-4">
          <p className="text-xs font-bold text-muted">Saved Vault name</p>
          <p className="mt-1 font-display text-lg font-black">{title}</p>
          {customTitle.trim() && (
            <p className="mt-2 text-xs text-muted">Trip context: {defaultTitle}</p>
          )}
          <p className="mt-2 text-xs text-muted">
            Original device file: {selectedFile?.name ?? "Choose a file above"}
          </p>
        </div>
        <p className="-mt-2 text-xs leading-5 text-muted">
          Traveler assignment controls where this appears in the trip. It does not grant anyone
          access.
        </p>
        <label className="form-label">
          Short label (optional)
          <input
            className="form-input"
            name="shortLabel"
            placeholder="Add a seat, bag, or ticket detail shown on cards"
            disabled={Boolean(queuedMessage)}
          />
        </label>
        {privateOnly ? (
          <>
            <input type="hidden" name="visibility" value="private" />
            <p className="rounded-2xl bg-brand-soft p-4 text-sm text-muted">
              Only you can open this upload. Its traveler assignment is still visible only within
              your permitted view.
            </p>
          </>
        ) : (
          <>
            <label className="form-label">
              Who can open it?
              <select
                className="form-input"
                name="visibility"
                value={visibility}
                onChange={(event) => setVisibility(event.target.value as DocumentVisibility)}
                disabled={Boolean(queuedMessage)}
              >
                <option value="private">Only me</option>
                <option value="trip">Everyone signed in to this trip</option>
                <option value="selected_members">Selected signed-in members</option>
              </select>
            </label>
            {visibility === "selected_members" && (
              <fieldset className="rounded-2xl border border-line p-4">
                <legend className="px-1 text-sm font-bold">Selected signed-in members</legend>
                <div className="mt-2 space-y-2">
                  {members.map((member) => (
                    <label key={member.user_id} className="flex items-center gap-3 text-sm">
                      <input
                        type="checkbox"
                        name="selectedUserIds"
                        value={member.user_id}
                        className="size-4"
                      />
                      {member.display_name}
                    </label>
                  ))}
                  {!members.length && (
                    <p className="text-xs text-muted">No signed-in trip members are available.</p>
                  )}
                </div>
              </fieldset>
            )}
          </>
        )}
        {onCreateEvent && (
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 ${createEventAfterUpload ? "border-brand bg-brand-soft" : "border-line bg-elevated"}`}
          >
            <input
              type="checkbox"
              className="mt-1 size-4 accent-brand"
              checked={createEventAfterUpload}
              onChange={(event) => setCreateEventAfterUpload(event.target.checked)}
            />
            <span>
              <strong className="flex items-center gap-2">
                <CalendarPlus className="size-4" /> Add a timeline event after upload
              </strong>
              <span className="mt-1 block text-xs leading-5 text-muted">
                The file is saved first, then the event form opens and links this document
                automatically.
              </span>
            </span>
          </label>
        )}
        {queuedMessage && (
          <p role="status" className="rounded-xl bg-warning/10 p-3 text-sm font-bold text-warning">
            {queuedMessage}
          </p>
        )}
        {(message || mutation.error) && (
          <div role="alert" className="rounded-xl bg-danger/10 p-3 text-sm font-bold text-danger">
            <p>{message || getErrorMessage(mutation.error)}</p>
            {duplicate &&
              (onUploaded ? (
                <button
                  type="button"
                  className="secondary-button mt-3"
                  onClick={async () => {
                    await onUploaded(duplicate.existingDocumentId);
                    onClose();
                  }}
                >
                  Attach existing document
                </button>
              ) : (
                <Link
                  className="secondary-button mt-3"
                  to={`/trips/${trip.id}/documents/${duplicate.existingDocumentId}`}
                >
                  Open existing document
                </Link>
              ))}
          </div>
        )}
        {queuedMessage ? (
          <button className="primary-button w-full" type="button" onClick={onClose}>
            Done
          </button>
        ) : (
          <button className="primary-button w-full" disabled={mutation.isPending}>
            {mutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <FileUp className="size-4" />
            )}{" "}
            Save to Vault
          </button>
        )}
      </form>
    </ModalSheet>
  );
}

export function AddNoteForm({
  trip,
  note,
  onClose
}: {
  trip: Trip;
  note?: TripNote;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const draft = useFormDraft(`note:${note?.id ?? "new"}:${trip.id}`);
  const mutation = useMutation({
    mutationFn: (input: { tripId: string; title?: string; body: string }) =>
      note ? updateNote({ note, title: input.title, body: input.body }) : addNote(input),
    onSuccess: async () => {
      draft.clearDraft();
      await queryClient.invalidateQueries({ queryKey: ["notes", trip.id] });
      onClose();
    }
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = String(form.get("body") ?? "").trim();
    if (!body) {
      setMessage("Write something before saving.");
      return;
    }
    mutation.mutate({
      tripId: trip.id,
      title: String(form.get("title") ?? "").trim() || undefined,
      body
    });
  };
  return (
    <ModalSheet
      eyebrow={trip.title}
      title={note ? "Edit trip note" : "Add a trip note"}
      onClose={onClose}
    >
      <form ref={draft.formRef} onSubmit={submit} className="mt-6 space-y-4">
        <label className="form-label">
          Title (optional)
          <input
            className="form-input"
            name="title"
            placeholder="Name this note so it is easy to find"
            defaultValue={note?.title ?? ""}
          />
        </label>
        <label className="form-label">
          Note
          <textarea
            autoFocus
            className="form-input min-h-40 resize-y"
            name="body"
            placeholder="Write the information you want available during the trip"
            defaultValue={note?.body ?? ""}
          />
        </label>
        {(message || mutation.error) && (
          <p role="alert" className="text-sm font-bold text-danger">
            {message || getErrorMessage(mutation.error)}
          </p>
        )}
        <button className="primary-button w-full">
          <NotebookPen className="size-4" /> {note ? "Save changes" : "Save note"}
        </button>
      </form>
    </ModalSheet>
  );
}
