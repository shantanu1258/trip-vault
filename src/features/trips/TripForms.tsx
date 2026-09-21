import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  CalendarPlus,
  Loader2,
  ReceiptIndianRupee,
  Save,
  TicketCheck,
  Trash2
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { CurrencySelect } from "../../components/CurrencySelect";
import { ModalSheet } from "../../components/ModalSheet";
import { useConfirmDialog } from "../../components/ConfirmDialogProvider";
import { RequiredMark } from "../../components/RequiredMark";
import {
  addItineraryItem,
  addTripCost,
  archiveTrip,
  deleteTripRecoverably,
  updateItineraryItem,
  updateTrip,
  updateTripCost
} from "./api";
import { getErrorMessage } from "./presentation";
import {
  isJourneyEventType,
  timelineEventTypes,
  type CreateCostInput,
  type CreateItineraryInput,
  type ItineraryItem,
  type Trip,
  type TripCost
} from "./types";
import {
  amountStringToMinor,
  costFormSchema,
  currencyFractionDigits,
  firstValidationMessage,
  itineraryFormSchema,
  tripFormSchema
} from "./validation";
import type { Booking, Traveler } from "../workspace/types";
import { ParticipantSelector } from "../workspace/ParticipantSelector";
import { listItineraryParticipantIds, listVaultDocuments } from "../workspace/api";
import { UploadDocumentForm } from "../workspace/WorkspaceForms";
import { listItinerary } from "./api";
import { useFormDraft } from "../../lib/forms/useFormDraft";
import { furthestEventTimezone, readEventTiming, TimingFields } from "../timeline/TimingFields";

export function AddItineraryForm({
  trip,
  travelers,
  bookings = [],
  item,
  preferredTravelerId,
  onAddBooking,
  onClose
}: {
  trip: Trip;
  travelers: Traveler[];
  bookings?: Booking[];
  item?: ItineraryItem;
  preferredTravelerId?: string;
  onAddBooking?: () => void;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const draft = useFormDraft(`itinerary:${item?.id ?? "new"}:${trip.id}`);
  const itinerary = useQuery({
    queryKey: ["itinerary", trip.id],
    queryFn: () => listItinerary(trip.id)
  });
  const participants = useQuery({
    queryKey: ["itinerary-participant-ids", item?.id],
    queryFn: () => listItineraryParticipantIds(item!.id, trip.id),
    enabled: Boolean(item)
  });
  const initialParticipantScope = item
    ? item.applies_to_all_travelers
      ? "everyone"
      : "selected"
    : preferredTravelerId
      ? "selected"
      : "everyone";
  const mutation = useMutation({
    mutationFn: (input: CreateItineraryInput) =>
      item
        ? updateItineraryItem({ ...input, id: item.id, version: item.version })
        : addItineraryItem(input),
    onSuccess: async () => {
      draft.clearDraft();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["itinerary", trip.id] }),
        queryClient.invalidateQueries({ queryKey: ["itinerary-participant-ids", item?.id] }),
        queryClient.invalidateQueries({ queryKey: ["itinerary-participants", trip.id] }),
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
    try {
      const timing = readEventTiming(form, trip, itinerary.data ?? []);
      const parsed = itineraryFormSchema.safeParse({
        title: form.get("title"),
        startsAt: timing.startsAt,
        endsAt: timing.endsAt || undefined,
        location: form.get("location") || undefined,
        notes: form.get("notes") || undefined
      });
      if (!parsed.success) {
        setMessage(firstValidationMessage(parsed.error));
        return;
      }
      mutation.mutate({
        tripId: trip.id,
        bookingId: String(form.get("bookingId") ?? "") || undefined,
        eventType: String(form.get("eventType") ?? "custom") as CreateItineraryInput["eventType"],
        title: parsed.data.title,
        ...timing,
        location: parsed.data.location,
        mapUrl: String(form.get("mapUrl") ?? "").trim() || undefined,
        notes: parsed.data.notes,
        participantScope: form.get("participantScope") === "selected" ? "selected" : "everyone",
        travelerIds: form.getAll("travelerIds").map(String),
        isAllDay: timing.isAllDay
      });
    } catch (error) {
      setMessage(getErrorMessage(error));
    }
  };

  const submitJourneyName = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!item) return;
    setMessage("");
    if (!item.applies_to_all_travelers && !participants.isSuccess) {
      setMessage("Wait for the journey travelers to load before saving its name.");
      return;
    }
    const form = new FormData(event.currentTarget);
    const parsed = itineraryFormSchema.safeParse({
      title: form.get("title"),
      startsAt: item.starts_at,
      endsAt: item.ends_at ?? undefined,
      location: item.location?.label ?? item.location?.address,
      notes: item.notes ?? undefined
    });
    if (!parsed.success) {
      setMessage(firstValidationMessage(parsed.error));
      return;
    }
    mutation.mutate({
      tripId: trip.id,
      bookingId: item.booking_id ?? undefined,
      eventType: item.event_type ?? "custom",
      title: parsed.data.title,
      startsAt: item.starts_at,
      endsAt: item.ends_at ?? undefined,
      timezone: item.timezone,
      location: item.location?.label ?? item.location?.address,
      mapUrl: item.location?.map_url,
      notes: item.notes ?? undefined,
      participantScope: item.applies_to_all_travelers ? "everyone" : "selected",
      travelerIds: item.applies_to_all_travelers ? [] : (participants.data ?? []),
      isAllDay: item.is_all_day,
      completedAt: item.completed_at,
      timingMode: item.timing_mode,
      scheduledDate: item.scheduled_date ?? undefined,
      anchorItineraryItemId: item.anchor_itinerary_item_id ?? undefined,
      relativePosition: item.relative_position ?? undefined,
      hasExplicitStartTime: item.has_explicit_start_time,
      durationMinutes: item.duration_minutes ?? undefined,
      eventStatus: item.event_status,
      sortKey: item.sort_key
    });
  };

  if (item?.booking_id && ["hotel_check_in", "hotel_check_out"].includes(item.event_type ?? "")) {
    return (
      <ModalSheet eyebrow={trip.title} title="Edit hotel stay" onClose={onClose}>
        <p className="mt-6 rounded-2xl bg-warning/10 p-4 text-sm leading-6 text-warning">
          Check-in and checkout stay together. Open the hotel booking to edit both milestones
          safely.
        </p>
      </ModalSheet>
    );
  }

  if (item?.booking_id && isJourneyEventType(item.event_type)) {
    const bookingLabel = item.event_type === "flight" ? "flight" : item.event_type;
    return (
      <ModalSheet eyebrow={trip.title} title={`Edit ${bookingLabel} journey`} onClose={onClose}>
        <form className="mt-6 space-y-4" onSubmit={submitJourneyName}>
          <label className="form-label">
            Event name
            <RequiredMark />
            <input
              autoFocus
              className="form-input"
              name="title"
              defaultValue={item.title}
              placeholder="Name this journey on the timeline"
            />
            <span className="mt-1 block text-xs font-normal leading-5 text-muted">
              This changes the name shown on the timeline without changing the route or booking.
            </span>
          </label>
          {(message || mutation.error || participants.error) && (
            <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm font-bold text-danger">
              {message || getErrorMessage(mutation.error || participants.error)}
            </p>
          )}
          <button
            className="primary-button w-full"
            type="submit"
            disabled={
              mutation.isPending || (!item.applies_to_all_travelers && participants.isLoading)
            }
          >
            {mutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}{" "}
            Save event name
          </button>
        </form>
        <div className="mt-6 rounded-2xl bg-brand-soft p-4 text-sm leading-6 text-muted">
          <p>
            Pickup, drop-off, route, local times, and traveler seats belong to the journey booking,
            not to a separate timeline location.
          </p>
          <Link
            className="primary-button mt-4 w-full"
            to={`/trips/${trip.id}/bookings/${item.booking_id}?editJourney=true`}
          >
            <TicketCheck className="size-4" /> Edit {bookingLabel} route &amp; times
          </Link>
        </div>
      </ModalSheet>
    );
  }

  return (
    <ModalSheet
      eyebrow={trip.title}
      title={item ? "Edit itinerary item" : "Add itinerary item"}
      onClose={onClose}
    >
      <form ref={draft.formRef} className="mt-6 space-y-4" onSubmit={submit}>
        <label className="form-label">
          Event type
          <RequiredMark />
          <select
            className="form-input capitalize"
            name="eventType"
            defaultValue={item?.event_type ?? "activity"}
          >
            {timelineEventTypes
              .filter(
                (type) =>
                  ![
                    "flight",
                    "train",
                    "bus",
                    "ferry",
                    "cab",
                    "hotel_check_in",
                    "hotel_check_out"
                  ].includes(type) || type === item?.event_type
              )
              .map((type) => (
                <option key={type} value={type}>
                  {type.replaceAll("_", " ")}
                </option>
              ))}
          </select>
        </label>
        <label className="form-label">
          Title
          <RequiredMark />
          <input
            className="form-input"
            name="title"
            placeholder="Name this item so it is easy to find on the timeline"
            defaultValue={item?.title}
            autoFocus
          />
        </label>
        <TimingFields
          trip={trip}
          itinerary={itinerary.data ?? []}
          item={item}
          defaultTimezone={furthestEventTimezone(itinerary.data ?? [], trip.primary_timezone)}
        />
        <label className="form-label">
          Location (optional)
          <input
            className="form-input"
            name="location"
            placeholder="Enter the place name or full address"
            defaultValue={item?.location?.label ?? ""}
          />
        </label>
        <label className="form-label">
          Google Maps link (optional)
          <input
            className="form-input"
            name="mapUrl"
            type="url"
            placeholder="Paste a Google Maps place or directions link"
            defaultValue={item?.location?.map_url ?? ""}
          />
        </label>
        {bookings.length > 0 && (
          <label className="form-label">
            Link an existing booking (optional)
            <select className="form-input" name="bookingId" defaultValue={item?.booking_id ?? ""}>
              <option value="">No related booking</option>
              {bookings.map((booking) => (
                <option key={booking.id} value={booking.id}>
                  {booking.type.replaceAll("_", " ")} · {booking.title}
                </option>
              ))}
            </select>
          </label>
        )}
        {onAddBooking && (
          <div className="rounded-2xl border border-line bg-elevated p-4">
            <p className="text-sm font-extrabold">No booking yet?</p>
            <p className="mt-1 text-xs leading-5 text-muted">
              Create booking details later without changing this event's place in the timeline.
            </p>
            <button className="secondary-button mt-3" type="button" onClick={onAddBooking}>
              <TicketCheck className="size-4" /> Add new booking
            </button>
          </div>
        )}
        <label className="form-label">
          Notes (optional)
          <textarea
            className="form-input min-h-24 resize-y"
            name="notes"
            placeholder="Add information you may need at this point in the trip"
            defaultValue={item?.notes ?? ""}
          />
        </label>
        <ParticipantSelector
          travelers={travelers}
          selectedTravelerIds={
            item
              ? (participants.data ?? [])
              : preferredTravelerId
                ? [preferredTravelerId]
                : undefined
          }
          initialScope={initialParticipantScope}
          scopeName="participantScope"
        />
        {(message || mutation.error) && (
          <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm font-bold text-danger">
            {message || getErrorMessage(mutation.error)}
          </p>
        )}
        <button disabled={mutation.isPending} className="primary-button w-full" type="submit">
          {mutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <CalendarPlus className="size-4" />
          )}{" "}
          {item ? "Save changes" : "Save itinerary item"}
        </button>
      </form>
    </ModalSheet>
  );
}

export function AddCostForm({
  trip,
  travelers,
  cost,
  bookingId,
  itineraryItemId,
  sourceTitle,
  onClose
}: {
  trip: Trip;
  travelers: Traveler[];
  cost?: TripCost;
  bookingId?: string;
  itineraryItemId?: string;
  sourceTitle?: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const lockedAssociation = Boolean(
    bookingId ||
    itineraryItemId ||
    cost?.booking_id ||
    cost?.itinerary_item_id ||
    cost?.cab_stop_id ||
    cost?.activity_moment_id
  );
  const [association, setAssociation] = useState(cost?.document_id ? "document" : "none");
  const [selectedEventId, setSelectedEventId] = useState("");
  const [documentId, setDocumentId] = useState(cost?.document_id ?? "");
  const [uploading, setUploading] = useState(false);
  const eventsQuery = useQuery({
    queryKey: ["itinerary", trip.id],
    queryFn: () => listItinerary(trip.id),
    enabled: !lockedAssociation && association === "event"
  });
  const documentsQuery = useQuery({
    queryKey: ["documents", trip.id],
    queryFn: () => listVaultDocuments(trip.id),
    enabled: !lockedAssociation && association === "document"
  });
  const selectedEvent =
    association === "event"
      ? eventsQuery.data?.find((item) => item.id === selectedEventId && !item.deleted_at)
      : undefined;
  const eventParticipants = useQuery({
    queryKey: ["itinerary-participant-ids", selectedEventId, trip.id],
    queryFn: () => listItineraryParticipantIds(selectedEventId, trip.id),
    enabled: !cost && Boolean(selectedEvent && !selectedEvent.applies_to_all_travelers)
  });
  const needsEventParticipants = !cost && selectedEvent && !selectedEvent.applies_to_all_travelers;
  const associationLoading = Boolean(needsEventParticipants && !eventParticipants.isSuccess);
  const initialParticipantIds = cost?.participants?.length
    ? cost.participants.map((participant) => participant.traveler_id)
    : needsEventParticipants
      ? eventParticipants.data
      : undefined;
  const draft = useFormDraft(`cost:${cost?.id ?? "new"}:${trip.id}`);
  const canChooseParticipants = Boolean(
    trip.expense_splitting_enabled || cost?.participants?.length || selectedEvent
  );
  const mutation = useMutation({
    mutationFn: (input: CreateCostInput) =>
      cost ? updateTripCost({ ...input, id: cost.id, version: cost.version }) : addTripCost(input),
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
    if (!parsed.success) {
      setMessage(firstValidationMessage(parsed.error));
      return;
    }
    if (!lockedAssociation && association === "event" && (!selectedEvent || associationLoading)) {
      setMessage("Choose an available event and wait for its travelers to load.");
      return;
    }
    if (!lockedAssociation && association === "document" && !documentId) {
      setMessage("Choose or upload a document, or select No link.");
      return;
    }
    const participantTravelerIds = canChooseParticipants
      ? form.getAll("travelerIds").map(String)
      : cost?.participants?.length
        ? cost.participants.map((participant) => participant.traveler_id)
        : travelers.map((traveler) => traveler.id);
    if (travelers.length > 0 && participantTravelerIds.length === 0) {
      setMessage("Choose at least one traveler to share this cost.");
      return;
    }
    mutation.mutate({
      tripId: trip.id,
      bookingId: bookingId ?? cost?.booking_id ?? selectedEvent?.booking_id ?? undefined,
      itineraryItemId: itineraryItemId ?? cost?.itinerary_item_id ?? selectedEvent?.id,
      ...(!lockedAssociation && (association === "document" || cost?.document_id)
        ? { documentId: association === "document" ? documentId : null }
        : {}),
      title: parsed.data.title,
      category: parsed.data.category,
      amountMinor: amountStringToMinor(parsed.data.amount, parsed.data.currencyCode),
      currencyCode: parsed.data.currencyCode,
      paymentStatus: parsed.data.paymentStatus,
      paidByTravelerId: String(form.get("paidByTravelerId") ?? "") || undefined,
      participantTravelerIds,
      notes: parsed.data.notes
    });
  };

  return (
    <>
      <div hidden={uploading}>
        <ModalSheet
          eyebrow={trip.title}
          title={cost ? "Edit trip cost" : "Add a trip cost"}
          onClose={() => {
            if (!uploading && !mutation.isPending) onClose();
          }}
        >
          <form ref={draft.formRef} className="mt-6 space-y-4" onSubmit={submit}>
            <label className="form-label">
              What was it for?
              <RequiredMark />
              <input
                className="form-input"
                name="title"
                placeholder="Name the expense so travelers can recognize it"
                defaultValue={cost?.title ?? sourceTitle}
                autoFocus
              />
              <span className="mt-1 block text-xs font-normal text-muted">
                {sourceTitle && !cost
                  ? `This cost stays attached to the ${itineraryItemId ? "timeline event" : "booking"}; you may adjust its label.`
                  : "Use a short name such as Airport cab or Museum tickets."}
              </span>
            </label>
            <div>
              <label className="form-label">
                Category
                <select
                  className="form-input capitalize"
                  name="category"
                  defaultValue={cost?.category ?? "other"}
                >
                  {[
                    "flight",
                    "hotel",
                    "transport",
                    "activity",
                    "food",
                    "visa",
                    "insurance",
                    "other"
                  ].map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(9rem,12rem)] gap-4">
              <label className="form-label">
                Amount
                <RequiredMark />
                <input
                  className="form-input"
                  name="amount"
                  inputMode="decimal"
                  placeholder="Enter 0 if this item was free"
                  defaultValue={
                    cost
                      ? (
                          cost.amount_minor /
                          10 ** currencyFractionDigits(cost.currency_code)
                        ).toFixed(currencyFractionDigits(cost.currency_code))
                      : ""
                  }
                />
              </label>
              <label className="form-label">
                Currency
                <RequiredMark />
                <CurrencySelect
                  name="currencyCode"
                  defaultValue={cost?.currency_code ?? trip.base_currency}
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="form-label min-w-0">
                Payment status
                <select
                  className="form-input"
                  name="paymentStatus"
                  defaultValue={cost?.payment_status ?? "planned"}
                >
                  <option value="planned">Planned</option>
                  <option value="paid">Paid</option>
                  <option value="refunded">Refunded</option>
                </select>
              </label>
              <label className="form-label min-w-0">
                Paid by
                <select
                  className="form-input"
                  name="paidByTravelerId"
                  defaultValue={cost?.paid_by_traveler_id ?? ""}
                >
                  <option value="">Not recorded yet</option>
                  {travelers.map((traveler) => (
                    <option key={traveler.id} value={traveler.id}>
                      {traveler.display_name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {!lockedAssociation && (
              <fieldset
                disabled={mutation.isPending}
                className="space-y-3 rounded-xl border border-line p-3"
              >
                <legend className="px-1 text-sm font-bold">Connection (optional)</legend>
                <label className="form-label">
                  Connect cost to
                  <select
                    className="form-input"
                    value={association}
                    onChange={(event) => setAssociation(event.target.value)}
                  >
                    <option value="none">No link</option>
                    <option value="event">Event</option>
                    <option value="document">Document</option>
                  </select>
                </label>
                {association === "event" && (
                  <>
                    <label className="form-label">
                      Event
                      <select
                        className="form-input"
                        value={selectedEventId}
                        onChange={(event) => setSelectedEventId(event.target.value)}
                      >
                        <option value="">Select an event</option>
                        {(eventsQuery.data ?? [])
                          .filter((item) => !item.deleted_at)
                          .map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.title}
                            </option>
                          ))}
                      </select>
                    </label>
                    {eventsQuery.isLoading && <p className="text-xs text-muted">Loading events…</p>}
                    {(eventsQuery.isError || eventParticipants.isError) && (
                      <p role="alert" className="text-sm text-danger">
                        Could not load the event or its travelers. Please reopen this form to retry.
                      </p>
                    )}
                    {!cost && selectedEvent && (
                      <p className="text-xs text-muted">
                        Included travelers start with this event’s travelers. You can adjust the
                        cost split below.
                      </p>
                    )}
                  </>
                )}
                {association === "document" && (
                  <>
                    <label className="form-label">
                      Document
                      <select
                        className="form-input"
                        value={documentId}
                        onChange={(event) => setDocumentId(event.target.value)}
                      >
                        <option value="">Select a document</option>
                        {documentId &&
                          !(documentsQuery.data ?? []).some(
                            (document) => document.id === documentId
                          ) && <option value={documentId}>Linked document (unavailable)</option>}
                        {(documentsQuery.data ?? [])
                          .filter((document) => !document.deleted_at)
                          .map((document) => (
                            <option key={document.id} value={document.id}>
                              {document.title}
                            </option>
                          ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="secondary-button w-full"
                      onClick={() => setUploading(true)}
                    >
                      Upload a document
                    </button>
                    {documentsQuery.isError && (
                      <p role="alert" className="text-sm text-danger">
                        Could not load documents. Please reopen this form to retry.
                      </p>
                    )}
                    <p className="text-xs leading-5 text-muted">
                      Uploads are saved to your Vault, even if you cancel this cost. Their
                      visibility settings stay unchanged.
                    </p>
                  </>
                )}
                <p className="text-xs text-muted">Choose an event or a document—not both.</p>
              </fieldset>
            )}
            {travelers.length > 0 && (
              <>
                {canChooseParticipants && (
                  <>
                    {!associationLoading && (
                      <ParticipantSelector
                        key={cost?.id ?? selectedEvent?.id ?? "standalone"}
                        travelers={travelers}
                        explicitAll
                        selectedTravelerIds={initialParticipantIds}
                      />
                    )}
                    <p className="-mt-2 text-xs leading-5 text-muted">
                      The amount is split equally among the selected travelers. Balances are
                      calculated separately for each currency.
                    </p>
                  </>
                )}
              </>
            )}
            <label className="form-label">
              Notes (optional)
              <textarea
                className="form-input min-h-20 resize-y"
                name="notes"
                defaultValue={cost?.notes ?? ""}
              />
            </label>
            {(message || mutation.error) && (
              <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm font-bold text-danger">
                {message || getErrorMessage(mutation.error)}
              </p>
            )}
            <button
              disabled={mutation.isPending || associationLoading}
              className="primary-button w-full"
              type="submit"
            >
              {mutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ReceiptIndianRupee className="size-4" />
              )}{" "}
              {cost ? "Save changes" : "Save cost"}
            </button>
          </form>
        </ModalSheet>
      </div>
      {uploading && (
        <UploadDocumentForm
          trip={trip}
          travelers={travelers}
          initialKind="receipt"
          onClose={() => setUploading(false)}
          onUploaded={(id) => {
            setDocumentId(id);
            setUploading(false);
          }}
        />
      )}
    </>
  );
}

export function TripSettingsForm({
  trip,
  onClose,
  onArchived
}: {
  trip: Trip;
  onClose: () => void;
  onArchived: () => void;
}) {
  const confirm = useConfirmDialog();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const update = useMutation({
    mutationFn: updateTrip,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["trip", trip.id] }),
        queryClient.invalidateQueries({ queryKey: ["trips"] })
      ]);
      onClose();
    }
  });
  const archive = useMutation({
    mutationFn: () => archiveTrip(trip),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["trips"] });
      onArchived();
    }
  });
  const remove = useMutation({
    mutationFn: () => deleteTripRecoverably(trip),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["trips"] });
      onArchived();
    }
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    const parsed = tripFormSchema.safeParse(Object.fromEntries(new FormData(event.currentTarget)));
    if (!parsed.success) {
      setMessage(firstValidationMessage(parsed.error));
      return;
    }
    update.mutate({ ...parsed.data, id: trip.id, status: trip.status, version: trip.version });
  };
  return (
    <ModalSheet eyebrow={trip.title} title="Trip settings" onClose={onClose}>
      <form className="mt-6 space-y-4" onSubmit={submit}>
        <label className="form-label">
          Trip name
          <input className="form-input" name="title" defaultValue={trip.title} />
        </label>
        <label className="form-label">
          Destination
          <input
            className="form-input"
            name="destination"
            defaultValue={trip.destination_summary}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="form-label">
            Start date
            <input
              className="form-input"
              name="startDate"
              type="date"
              defaultValue={trip.start_date}
            />
          </label>
          <label className="form-label">
            End date
            <input className="form-input" name="endDate" type="date" defaultValue={trip.end_date} />
          </label>
        </div>
        <input type="hidden" name="timezone" value={trip.primary_timezone} />
        <label className="form-label sm:max-w-64">
          Currency
          <CurrencySelect name="baseCurrency" defaultValue={trip.base_currency} />
        </label>
        <p className="text-xs leading-5 text-muted">
          <span className="block font-semibold">Fallback time zone: {trip.primary_timezone}</span>
          Journey time zones live on each departure and arrival, so changing general trip details
          cannot shift ticket times.
        </p>
        {(message || update.error || archive.error || remove.error) && (
          <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm font-bold text-danger">
            {message || getErrorMessage(update.error || archive.error || remove.error)}
          </p>
        )}
        <button className="primary-button w-full" disabled={update.isPending}>
          <Save className="size-4" /> Save trip
        </button>
        <div className="border-t border-line pt-4">
          <p className="text-xs leading-5 text-muted">
            Archiving removes the trip from Home and keeps its cloud and local records recoverable.
          </p>
          <button
            type="button"
            className="secondary-button mt-3 text-danger"
            disabled={archive.isPending}
            onClick={async () => {
              if (
                await confirm({
                  title: "Archive trip?",
                  message: `Archive ${trip.title}?`,
                  confirmLabel: "Archive",
                  tone: "danger"
                })
              )
                archive.mutate();
            }}
          >
            <Archive className="size-4" /> Archive trip
          </button>
          <p className="mt-5 text-xs leading-5 text-muted">
            Recently deleted trips can be restored for 30 days. This action requires a connection.
          </p>
          <button
            type="button"
            className="secondary-button mt-3 text-danger"
            disabled={remove.isPending || !navigator.onLine}
            onClick={async () => {
              if (
                await confirm({
                  title: "Move trip to Recently deleted?",
                  message: `Move ${trip.title} to Recently deleted?`,
                  confirmLabel: "Move trip",
                  tone: "danger"
                })
              )
                remove.mutate();
            }}
          >
            <Trash2 className="size-4" /> Move to Recently deleted
          </button>
        </div>
      </form>
    </ModalSheet>
  );
}
