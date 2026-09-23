import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { FileDropzone } from "../components/FileDropzone";
import { PageHeader } from "../components/TripUi";
import { localProfileId } from "../features/sync/localSync";
import { listItinerary, listReminders, listTrips } from "../features/trips/api";
import { getErrorMessage } from "../features/trips/presentation";
import {
  attachDocumentsToEvent,
  listFlightLegsForTrip,
  listJourneyLegsForTrip,
  listMembers,
  listRequirements,
  listTravelers,
  stageAccountDocument
} from "../features/workspace/api";
import { tripActivitySpan } from "../features/workspace/activeTrip";
import { documentKinds, type DocumentKind } from "../features/workspace/documentModel";
import type { ItineraryItem } from "../features/trips/types";
import { personalDocumentKinds } from "../features/workspace/PersonalDocuments";
import { UploadDocumentForm } from "../features/workspace/WorkspaceForms";
import type { AccountDocumentUpload } from "../features/workspace/types";
import { discardIncomingShare, readIncomingShare } from "../lib/pwa/incomingShare";

const shareErrors: Record<string, string> = {
  size: "Choose a non-empty PDF or image smaller than 5 MB.",
  count: "Share one document at a time. No files were saved.",
  no_file:
    "Android opened Trip Vault without sending an attachment. In Files, select the downloaded PDF or image and use Share, or choose the file below.",
  text_only:
    "The sending app shared text or a link, not the file itself. Download the PDF or image first, then share it from Files, or choose it below.",
  type: "Use a PDF, JPEG, PNG, or WebP file.",
  busy: "There are several unfinished shares. Finish one or try again in 15 minutes.",
  unavailable: "The shared file could not be received. Choose it below or try sharing again."
};

function suggestedKind(event?: ItineraryItem): DocumentKind {
  switch (event?.event_type) {
    case "flight":
      return "boarding_pass";
    case "hotel_check_in":
    case "hotel_check_out":
      return "hotel_confirmation";
    case "train":
    case "bus":
    case "ferry":
    case "cab":
    case "transport":
      return "journey_ticket";
    case "activity":
      return "activity_confirmation";
    default:
      return "other";
  }
}

export function AddDocumentPage() {
  const [params] = useSearchParams();
  const shareId = params.get("id");
  const isShareRoute = useLocation().pathname === "/receive-share";
  const shareError = params.get("error");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<NonNullable<AccountDocumentUpload["personal_kind"]>>("other");
  const [label, setLabel] = useState("");
  const [destination, setDestination] = useState("personal");
  const [tripId, setTripId] = useState("");
  const [eventId, setEventId] = useState("");
  const [tripKind, setTripKind] = useState<DocumentKind>("other");
  const [travelerId, setTravelerId] = useState("");
  const userChoseDestination = useRef(params.get("section") === "personal");
  const [defaultsChecked, setDefaultsChecked] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<{
    documentId: string;
    event: ItineraryItem;
  } | null>(null);
  const [reviewTrip, setReviewTrip] = useState(false);
  const [message, setMessage] = useState("");
  const [receiveError, setReceiveError] = useState("");
  const [loadingShare, setLoadingShare] = useState(Boolean(isShareRoute && shareId));
  const trips = useQuery({
    queryKey: ["trips"],
    queryFn: () => listTrips()
  });
  const availableTrips = (trips.data ?? []).filter(
    (trip) => !trip.deleted_at && trip.status !== "archived"
  );
  const itineraries = useQueries({
    queries: availableTrips.map((trip) => ({
      queryKey: ["itinerary", trip.id],
      queryFn: () => listItinerary(trip.id),
      enabled: !defaultsChecked || trip.id === tripId
    }))
  });
  const requirements = useQueries({
    queries: availableTrips.map((trip) => ({
      queryKey: ["requirements", trip.id],
      queryFn: () => listRequirements(trip.id),
      enabled: !defaultsChecked
    }))
  });
  const reminders = useQuery({
    queryKey: ["reminders", "including-completed"],
    queryFn: () => listReminders(true),
    enabled: !defaultsChecked
  });
  const checkingDefaults =
    trips.isPending ||
    reminders.isPending ||
    [...itineraries, ...requirements].some((query) => query.isPending);
  const now = Date.now();
  const activeTrips = availableTrips
    .map((trip, index) => ({
      trip,
      span: tripActivitySpan({
        tripId: trip.id,
        events: itineraries[index]?.data ?? [],
        requirements: requirements[index]?.data ?? [],
        reminders: reminders.data ?? [],
        timezone: trip.primary_timezone
      })
    }))
    .filter((entry) => entry.span && now >= entry.span.start && now <= entry.span.end)
    .sort(
      (a, b) =>
        b.span!.start - a.span!.start ||
        (b.trip.created_at ?? "").localeCompare(a.trip.created_at ?? "") ||
        a.trip.id.localeCompare(b.trip.id)
    )
    .map((entry) => entry.trip);
  useEffect(() => {
    if (defaultsChecked || checkingDefaults) return;
    if (
      !userChoseDestination.current &&
      !trips.error &&
      !reminders.error &&
      ![...itineraries, ...requirements].some((query) => query.error)
    ) {
      if (activeTrips.length) setDestination("trip");
      if (activeTrips.length) setTripId(activeTrips[0].id);
    }
    setDefaultsChecked(true);
  }, [
    defaultsChecked,
    checkingDefaults,
    activeTrips,
    trips.error,
    itineraries,
    requirements,
    reminders.error
  ]);
  const eventsQuery = itineraries[availableTrips.findIndex((trip) => trip.id === tripId)];
  const events = (eventsQuery?.data ?? [])
    .filter(
      (event) => !event.deleted_at && !["cancelled", "skipped"].includes(event.event_status ?? "")
    )
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const selectedEvent = events.find((event) => event.id === eventId);
  const flights = useQuery({
    queryKey: ["flight-legs", tripId],
    queryFn: () => listFlightLegsForTrip(tripId),
    enabled: !!tripId && selectedEvent?.event_type === "flight"
  });
  const journeys = useQuery({
    queryKey: ["journey-legs", tripId],
    queryFn: () => listJourneyLegsForTrip(tripId),
    enabled:
      !!tripId &&
      !!selectedEvent &&
      ["train", "bus", "ferry", "cab"].includes(selectedEvent.event_type ?? "")
  });
  const eventFlights = (flights.data ?? []).filter(
    (leg) => leg.booking_id === selectedEvent?.booking_id
  );
  const eventJourneys = (journeys.data ?? []).filter(
    (leg) => leg.booking_id === selectedEvent?.booking_id
  );
  const loadingEventLegs =
    !!selectedEvent &&
    (selectedEvent.event_type === "flight"
      ? flights.isPending
      : ["train", "bus", "ferry", "cab"].includes(selectedEvent.event_type ?? "") &&
        journeys.isPending);
  const travelers = useQuery({
    queryKey: ["travelers", tripId],
    queryFn: () => listTravelers(tripId),
    enabled: Boolean(tripId)
  });
  const members = useQuery({
    queryKey: ["members", tripId],
    queryFn: () => listMembers(tripId),
    enabled: Boolean(tripId)
  });
  const profile = useQuery({ queryKey: ["local-profile-id"], queryFn: localProfileId });
  const role = members.data?.find((member) => member.user_id === profile.data)?.role;
  const selectedTrip = trips.data?.find((trip) => trip.id === tripId);
  useEffect(() => {
    if (!isShareRoute) return;
    setFile(null);
    setTitle("");
    setReviewTrip(false);
    setReceiveError("");
    if (!shareId) {
      setLoadingShare(false);
      setReceiveError(
        shareErrors[shareError ?? ""] ??
          "The app opened without an attached file. Share the PDF itself from Files, not a link, or choose it below."
      );
      return;
    }
    let active = true;
    setLoadingShare(true);
    void readIncomingShare(shareId)
      .then((received) => {
        if (active) {
          setFile(received);
          setTitle(received.name);
        }
      })
      .catch((error) => {
        if (active) setReceiveError(getErrorMessage(error));
      })
      .finally(() => {
        if (active) setLoadingShare(false);
      });
    return () => {
      active = false;
    };
  }, [isShareRoute, shareId, shareError]);
  const finish = async (personal: boolean) => {
    if (shareId) await discardIncomingShare(shareId);
    await queryClient.invalidateQueries({ queryKey: ["account-document-uploads"] });
    navigate(personal ? "/vault?section=personal" : "/vault", { replace: true });
  };
  const attach = useMutation({
    mutationFn: async ({ documentId, event }: { documentId: string; event: ItineraryItem }) => {
      await attachDocumentsToEvent(event, [documentId]);
      await queryClient.invalidateQueries({ queryKey: ["event-documents", event.id] });
      await finish(false);
    }
  });
  const finishTripUpload = async (documentId: string) => {
    if (!selectedEvent || (role !== "owner" && role !== "editor")) return finish(false);
    const attachment = { documentId, event: selectedEvent };
    setPendingAttachment(attachment);
    setReviewTrip(false);
    // A failed link retries the existing upload; never uploads a duplicate file.
    attach.mutate(attachment);
  };
  const save = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Choose a file first.");
      return stageAccountDocument(file, undefined, { title, kind, label });
    },
    onSuccess: () => finish(true)
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    if (!file) {
      setMessage("Choose a PDF or image first.");
      return;
    }
    if (destination === "personal") save.mutate();
    else if (selectedTrip) setReviewTrip(true);
    else setMessage("Choose a trip.");
  };
  const cancel = async () => {
    if (shareId) await discardIncomingShare(shareId);
    navigate("/vault");
  };
  return (
    <AppShell>
      <div className="mx-auto max-w-2xl">
        <PageHeader
          eyebrow="Document Vault"
          title={isShareRoute ? "Save shared document" : "Add document"}
        />
        <p className="mt-3 text-sm text-muted">
          Keep a personal file private, or choose a trip and review its document fields. Nothing is
          uploaded until you save.
        </p>
        {pendingAttachment ? (
          <section className="surface-card mt-4 space-y-3 p-4">
            <p role="status">
              {attach.isPending
                ? "Attaching document to event…"
                : "Your document is saved in Vault, but its event link could not be saved."}
            </p>
            {attach.error && (
              <p role="alert" className="text-sm text-danger">
                {getErrorMessage(attach.error)}
              </p>
            )}
            <button
              className="primary-button"
              disabled={attach.isPending}
              onClick={() => attach.mutate(pendingAttachment)}
            >
              Retry event link
            </button>
            <button
              className="secondary-button"
              disabled={attach.isPending}
              onClick={() => void finish(false)}
            >
              Keep in Vault
            </button>
          </section>
        ) : (
          <form className="surface-card mt-4 space-y-4 p-4" onSubmit={submit}>
            {loadingShare && <p role="status">Opening shared file…</p>}
            {receiveError && (
              <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm text-danger">
                {receiveError}
              </p>
            )}
            <FileDropzone
              name="document"
              label="PDF or image under 5 MB"
              file={file}
              onFileChange={(next) => {
                setFile(next);
                if (next) setReceiveError("");
                if (!title) setTitle(next?.name ?? "");
              }}
              busy={save.isPending || loadingShare}
            />
            <label className="form-label">
              Save to
              <select
                className="form-input"
                value={destination}
                onChange={(e) => {
                  userChoseDestination.current = true;
                  setDestination(e.target.value);
                }}
                disabled={save.isPending}
              >
                <option value="personal">Personal documents · Only me</option>
                <option value="trip">A trip</option>
              </select>
            </label>
            {destination === "personal" ? (
              <>
                <label className="form-label">
                  Document type
                  <select
                    className="form-input"
                    value={kind}
                    disabled={save.isPending}
                    onChange={(e) => {
                      userChoseDestination.current = true;
                      setKind(e.target.value as typeof kind);
                    }}
                  >
                    {personalDocumentKinds.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-label">
                  Document name
                  <input
                    className="form-input"
                    value={title}
                    onChange={(e) => {
                      userChoseDestination.current = true;
                      setTitle(e.target.value);
                    }}
                    maxLength={200}
                    required
                    disabled={save.isPending}
                  />
                </label>
                <label className="form-label">
                  Label (optional)
                  <input
                    className="form-input"
                    value={label}
                    onChange={(e) => {
                      userChoseDestination.current = true;
                      setLabel(e.target.value);
                    }}
                    maxLength={200}
                    placeholder="For example: My passport"
                    disabled={save.isPending}
                  />
                </label>
                <p className="rounded-xl bg-brand-soft p-3 text-sm">
                  Only your account can access this file. Trip members cannot see it. No identity
                  number is required.
                </p>
              </>
            ) : (
              <>
                <label className="form-label">
                  Trip
                  <select
                    className="form-input"
                    value={tripId}
                    onChange={(e) => {
                      userChoseDestination.current = true;
                      setTripId(e.target.value);
                      setEventId("");
                      setTripKind("other");
                      setTravelerId("");
                    }}
                    required
                  >
                    <option value="">Choose a trip</option>
                    {trips.data?.map((trip) => (
                      <option value={trip.id} key={trip.id}>
                        {trip.title}
                      </option>
                    ))}
                  </select>
                </label>
                {tripId && (
                  <label className="form-label">
                    Event (optional)
                    <select
                      className="form-input"
                      value={eventId}
                      onChange={(event) => {
                        setEventId(event.target.value);
                        setTripKind(
                          suggestedKind(events.find((item) => item.id === event.target.value))
                        );
                        setTravelerId("");
                      }}
                      disabled={eventsQuery?.isPending || (role !== "owner" && role !== "editor")}
                    >
                      <option value="">Trip documents only</option>
                      {events.map((event) => (
                        <option key={event.id} value={event.id}>
                          {event.title}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {tripId && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="form-label">
                      Document type
                      <select
                        className="form-input"
                        value={tripKind}
                        onChange={(event) => setTripKind(event.target.value as DocumentKind)}
                      >
                        {documentKinds.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="form-label">
                      Traveller
                      <select
                        className="form-input"
                        value={travelerId}
                        onChange={(event) => setTravelerId(event.target.value)}
                        disabled={travelers.isPending || !!travelers.error}
                      >
                        <option value="">Everyone</option>
                        {(travelers.data ?? []).map((traveler) => (
                          <option key={traveler.id} value={traveler.id}>
                            {traveler.display_name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
                {eventsQuery?.error && (
                  <p role="alert" className="text-sm text-danger">
                    Events could not be loaded. You can still save to this trip.{" "}
                    <button
                      type="button"
                      className="underline"
                      onClick={() => void eventsQuery.refetch()}
                    >
                      Retry
                    </button>
                  </p>
                )}
                {trips.isPending && <p role="status">Loading trips…</p>}
                {trips.data?.length === 0 && (
                  <p className="text-sm">
                    No trips yet. Save privately, or{" "}
                    <Link className="text-brand underline" to="/trips/new">
                      create a trip
                    </Link>
                    .
                  </p>
                )}
              </>
            )}
            {(message ||
              save.error ||
              trips.error ||
              travelers.error ||
              members.error ||
              flights.error ||
              journeys.error) && (
              <p role="alert" className="text-sm text-danger">
                {message ||
                  getErrorMessage(
                    save.error ||
                      trips.error ||
                      travelers.error ||
                      members.error ||
                      flights.error ||
                      journeys.error
                  )}
              </p>
            )}
            <div className="flex gap-2">
              <button
                className="primary-button flex-1"
                disabled={
                  save.isPending ||
                  loadingShare ||
                  (!defaultsChecked && !userChoseDestination.current) ||
                  (destination === "trip" &&
                    (!tripId ||
                      loadingEventLegs ||
                      travelers.isPending ||
                      members.isPending ||
                      profile.isPending ||
                      !!travelers.error ||
                      !!members.error))
                }
              >
                {save.isPending
                  ? "Saving…"
                  : destination === "personal"
                    ? "Save privately"
                    : "Review trip document"}
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={save.isPending}
                onClick={() => void cancel()}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
        {reviewTrip && selectedTrip && file && (
          <UploadDocumentForm
            trip={selectedTrip}
            travelers={travelers.data ?? []}
            members={members.data ?? []}
            privateOnly={role !== "owner" && role !== "editor"}
            initialFile={file}
            initialFileContext="shared"
            initialVisibility={isShareRoute ? "private" : "trip"}
            bookingId={selectedEvent?.booking_id ?? undefined}
            flightLegId={
              selectedEvent?.event_type === "flight" && eventFlights.length === 1
                ? eventFlights[0].id
                : undefined
            }
            journeyLegId={
              selectedEvent?.event_type !== "flight" && eventJourneys.length === 1
                ? eventJourneys[0].id
                : undefined
            }
            contextTitle={selectedEvent?.title}
            initialKind={tripKind}
            assignmentPreset={
              travelerId
                ? { mode: "selected", travelerIds: [travelerId] }
                : { mode: "shared", travelerIds: [] }
            }
            onClose={() => setReviewTrip(false)}
            onUploaded={finishTripUpload}
          />
        )}
      </div>
    </AppShell>
  );
}
