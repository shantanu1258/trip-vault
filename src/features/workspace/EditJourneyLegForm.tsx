import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save } from "lucide-react";
import { useState, type FormEvent } from "react";
import { ModalSheet } from "../../components/ModalSheet";
import { TimeZoneAutocomplete } from "../../components/TimeZoneAutocomplete";
import { JourneyOperatorPicker } from "../metadata/JourneyOperatorPicker";
import type { ItineraryItem, Trip } from "../trips/types";
import {
  firstValidationMessage,
  isoToLocalDateTime,
  localDateTimeToIso
} from "../trips/validation";
import { getErrorMessage } from "../trips/presentation";
import {
  EventTimeZoneField,
  furthestEventTimezone,
  JourneyTimelinePlacementFields
} from "../timeline/TimingFields";
import { normalizeJourneyLegDetails, suggestCatalogValue, updateJourneyLeg } from "./api";
import type {
  Booking,
  CabJourneyDetails,
  JourneyLeg,
  JourneyLegDetails,
  TrainJourneyDetails,
  BusJourneyDetails
} from "./types";
import { z } from "zod";

function optionalCountryCode(label: string) {
  return z
    .string()
    .trim()
    .refine(
      (value) => !value || /^[A-Za-z]{2}$/.test(value),
      `Use a 2-letter ${label} country code.`
    )
    .optional();
}

const legSchema = z.object({
  operatorName: z.string().trim().max(160).optional(),
  serviceNumber: z.string().trim().max(80).optional(),
  originName: z.string().trim().min(1, "Add the departure place.").max(220),
  originCode: z.string().trim().max(16).optional(),
  originCountryCode: optionalCountryCode("departure"),
  originTimezone: z.string().trim().min(1, "Choose the departure time zone."),
  destinationName: z.string().trim().min(1, "Add the destination place.").max(220),
  destinationCode: z.string().trim().max(16).optional(),
  destinationCountryCode: optionalCountryCode("destination"),
  destinationTimezone: z.string().trim().min(1, "Choose the destination time zone."),
  departureLocal: z.string().min(1, "Add the local departure time."),
  arrivalLocal: z.string().optional(),
  boardingLocal: z.string().optional(),
  departureOccurrence: z.enum(["automatic", "earlier", "later"]),
  arrivalOccurrence: z.enum(["automatic", "earlier", "later"]),
  boardingOccurrence: z.enum(["automatic", "earlier", "later"]),
  boardingLeadMinutes: z.string().optional(),
  departurePlatform: z.string().trim().max(80).optional(),
  arrivalPlatform: z.string().trim().max(80).optional()
});

function text(form: FormData, name: string) {
  return String(form.get(name) ?? "").trim();
}

function optionalNumber(form: FormData, name: string) {
  const value = text(form, name);
  if (!value) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${name} must be zero or more.`);
  return number;
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && item !== "")
  ) as T;
}

function detailsForForm(form: FormData, leg: JourneyLeg): JourneyLegDetails {
  if (leg.mode === "train")
    return compact<TrainJourneyDetails>({
      kind: "train",
      train_name: text(form, "trainName") || undefined,
      booked_from_name: text(form, "bookedFromName") || undefined,
      booked_from_code: text(form, "bookedFromCode").toUpperCase() || undefined,
      travel_class: text(form, "travelClass") || undefined,
      quota: text(form, "quota") || undefined,
      booking_status: text(form, "bookingStatus") || undefined,
      current_status: text(form, "currentStatus") || undefined
    });
  if (leg.mode === "bus")
    return compact<BusJourneyDetails>({
      kind: "bus",
      bus_class_or_layout: text(form, "busClass") || undefined,
      shared_ticket_number: text(form, "sharedTicketNumber") || undefined,
      boarding_point_details: text(form, "boardingPointDetails") || undefined,
      dropoff_point_details: text(form, "dropoffPointDetails") || undefined
    });
  if (leg.mode === "ferry") {
    return leg.details?.kind === "ferry" ? leg.details : { kind: "ferry" };
  }
  const current = leg.details?.kind === "cab" ? leg.details : undefined;
  return compact<CabJourneyDetails>({
    kind: "cab",
    ride_type: (text(form, "rideType") || "local") as CabJourneyDetails["ride_type"],
    cross_border: form.get("crossBorder") === "on" || undefined,
    linked_flight_leg_id: current?.linked_flight_leg_id,
    pickup_buffer_minutes: optionalNumber(form, "pickupBufferMinutes"),
    luggage_count: optionalNumber(form, "luggageCount"),
    pickup_instructions: text(form, "pickupInstructions") || undefined,
    vehicle_class: text(form, "vehicleClass") || undefined,
    driver_name: text(form, "driverName") || undefined,
    driver_phone: text(form, "driverPhone") || undefined,
    vehicle_registration: text(form, "vehicleRegistration") || undefined,
    trip_shape: text(form, "tripShape") as CabJourneyDetails["trip_shape"],
    return_at: text(form, "returnAt")
      ? localDateTimeToIso(text(form, "returnAt"), text(form, "destinationTimezone"))
      : undefined,
    package_duration_minutes: optionalNumber(form, "packageDurationMinutes"),
    final_dropoff: text(form, "finalDropoff") || undefined
  });
}

function OccurrenceSelect({ name }: { name: string }) {
  return (
    <select className="form-input" name={name} defaultValue="automatic">
      <option value="automatic">Automatic (usual)</option>
      <option value="earlier">Earlier occurrence</option>
      <option value="later">Later occurrence</option>
    </select>
  );
}

function value<T extends object, K extends keyof T>(
  details: object | undefined,
  kind: string,
  key: K
) {
  return (
    (details && "kind" in details && details.kind === kind ? (details as T)[key] : undefined) ?? ""
  );
}

function TrainDetailsFields({ details }: { details: JourneyLeg["details"] }) {
  return (
    <fieldset className="rounded-2xl border border-line p-4">
      <legend className="px-1 text-sm font-extrabold">Train ticket details</legend>
      <div className="mt-2 grid gap-4 sm:grid-cols-2">
        <label className="form-label">
          Train name
          <input
            className="form-input"
            name="trainName"
            defaultValue={value<TrainJourneyDetails, "train_name">(details, "train", "train_name")}
            placeholder="Enter the train name printed on the ticket"
          />
        </label>
        <label className="form-label">
          Booked from station
          <input
            className="form-input"
            name="bookedFromName"
            defaultValue={value<TrainJourneyDetails, "booked_from_name">(
              details,
              "train",
              "booked_from_name"
            )}
            placeholder="Only add this if it differs from the boarding station"
          />
        </label>
        <label className="form-label">
          Booked from code
          <input
            className="form-input uppercase"
            name="bookedFromCode"
            defaultValue={value<TrainJourneyDetails, "booked_from_code">(
              details,
              "train",
              "booked_from_code"
            )}
            placeholder="Enter the code printed under Booked From"
          />
        </label>
        <label className="form-label">
          Travel class
          <input
            className="form-input"
            name="travelClass"
            defaultValue={value<TrainJourneyDetails, "travel_class">(
              details,
              "train",
              "travel_class"
            )}
            placeholder="Enter the class printed on the ticket"
          />
        </label>
        <label className="form-label">
          Quota
          <input
            className="form-input"
            name="quota"
            defaultValue={value<TrainJourneyDetails, "quota">(details, "train", "quota")}
            placeholder="Enter the quota printed on the ticket"
          />
        </label>
        <label className="form-label">
          Booking status
          <input
            className="form-input"
            name="bookingStatus"
            defaultValue={value<TrainJourneyDetails, "booking_status">(
              details,
              "train",
              "booking_status"
            )}
            placeholder="Enter the original confirmed or waitlist status"
          />
        </label>
        <label className="form-label">
          Current status
          <input
            className="form-input"
            name="currentStatus"
            defaultValue={value<TrainJourneyDetails, "current_status">(
              details,
              "train",
              "current_status"
            )}
            placeholder="Enter the latest status from the operator"
          />
        </label>
      </div>
    </fieldset>
  );
}

function BusDetailsFields({ details }: { details: JourneyLeg["details"] }) {
  return (
    <fieldset className="rounded-2xl border border-line p-4">
      <legend className="px-1 text-sm font-extrabold">Bus ticket details</legend>
      <div className="mt-2 grid gap-4 sm:grid-cols-2">
        <label className="form-label">
          Bus class or layout
          <input
            className="form-input"
            name="busClass"
            defaultValue={value<BusJourneyDetails, "bus_class_or_layout">(
              details,
              "bus",
              "bus_class_or_layout"
            )}
            placeholder="Enter the bus class or seating layout shown on the ticket"
          />
        </label>
        <label className="form-label">
          Shared ticket number
          <input
            className="form-input"
            name="sharedTicketNumber"
            defaultValue={value<BusJourneyDetails, "shared_ticket_number">(
              details,
              "bus",
              "shared_ticket_number"
            )}
            placeholder="Enter the ticket number shared by the group"
          />
        </label>
        <label className="form-label">
          Boarding point details
          <textarea
            className="form-input min-h-20"
            name="boardingPointDetails"
            defaultValue={value<BusJourneyDetails, "boarding_point_details">(
              details,
              "bus",
              "boarding_point_details"
            )}
            placeholder="Add the landmark or pickup instructions from the ticket"
          />
        </label>
        <label className="form-label">
          Drop-off point details
          <textarea
            className="form-input min-h-20"
            name="dropoffPointDetails"
            defaultValue={value<BusJourneyDetails, "dropoff_point_details">(
              details,
              "bus",
              "dropoff_point_details"
            )}
            placeholder="Add the drop-off landmark or instructions"
          />
        </label>
      </div>
    </fieldset>
  );
}

function CabDetailsFields({
  details,
  destinationTimezone,
  crossBorder,
  onCrossBorder
}: {
  details: JourneyLeg["details"];
  destinationTimezone: string;
  crossBorder: boolean;
  onCrossBorder: (value: boolean) => void;
}) {
  const cab = details?.kind === "cab" ? details : undefined;
  return (
    <fieldset className="rounded-2xl border border-line p-4">
      <legend className="px-1 text-sm font-extrabold">Ride details</legend>
      <div className="mt-2 grid gap-4 sm:grid-cols-2">
        <label className="form-label">
          Ride type
          <select className="form-input" name="rideType" defaultValue={cab?.ride_type ?? "local"}>
            <option value="local">Local ride</option>
            <option value="airport_transfer">Airport transfer</option>
            <option value="outstation">Long-distance / outstation</option>
            <option value="hourly">Hire by hour or day</option>
          </select>
        </label>
        <label className="form-label">
          Vehicle or service class
          <input
            className="form-input"
            name="vehicleClass"
            defaultValue={cab?.vehicle_class ?? ""}
            placeholder="Enter the booked vehicle or service class"
          />
        </label>
        <label className="form-label sm:col-span-2">
          Pickup instructions
          <textarea
            className="form-input min-h-20"
            name="pickupInstructions"
            defaultValue={cab?.pickup_instructions ?? ""}
            placeholder="Add the pickup zone, door, landmark, or meet-and-greet note"
          />
        </label>
        <label className="form-label">
          Driver name
          <input
            className="form-input"
            name="driverName"
            defaultValue={cab?.driver_name ?? ""}
            placeholder="Add it when a driver is assigned"
          />
        </label>
        <label className="form-label">
          Driver phone
          <input
            className="form-input"
            type="tel"
            name="driverPhone"
            defaultValue={cab?.driver_phone ?? ""}
            placeholder="Include the country code for calling"
          />
        </label>
        <label className="form-label">
          Vehicle registration
          <input
            className="form-input uppercase"
            name="vehicleRegistration"
            defaultValue={cab?.vehicle_registration ?? ""}
            placeholder="Add it when the vehicle is assigned"
          />
        </label>
        <label className="form-label">
          Luggage count
          <input
            className="form-input"
            type="number"
            min="0"
            name="luggageCount"
            defaultValue={cab?.luggage_count ?? ""}
            placeholder="Enter the number of bags"
          />
        </label>
        <label className="form-label">
          Pickup buffer (minutes)
          <input
            className="form-input"
            type="number"
            min="0"
            name="pickupBufferMinutes"
            defaultValue={cab?.pickup_buffer_minutes ?? ""}
            placeholder="For example, minutes after flight arrival"
          />
        </label>
        <label className="form-label">
          Trip shape
          <select
            className="form-input"
            name="tripShape"
            defaultValue={cab?.trip_shape ?? "one_way"}
          >
            <option value="one_way">One-way</option>
            <option value="round_trip">Round trip</option>
          </select>
        </label>
        <label className="form-label">
          Return date and time
          <input
            className="form-input"
            type="datetime-local"
            name="returnAt"
            defaultValue={isoToLocalDateTime(cab?.return_at, destinationTimezone)}
          />
        </label>
        <label className="form-label">
          Package duration (minutes)
          <input
            className="form-input"
            type="number"
            min="0"
            name="packageDurationMinutes"
            defaultValue={cab?.package_duration_minutes ?? ""}
            placeholder="For an hourly or day hire"
          />
        </label>
        <label className="form-label">
          Final drop-off
          <input
            className="form-input"
            name="finalDropoff"
            defaultValue={cab?.final_dropoff ?? ""}
            placeholder="Add when an hourly ride has a known final stop"
          />
        </label>
        <label className="flex items-center gap-3 rounded-xl bg-elevated p-3 text-sm font-extrabold sm:col-span-2">
          <input
            type="checkbox"
            name="crossBorder"
            checked={crossBorder}
            onChange={(event) => onCrossBorder(event.target.checked)}
          />{" "}
          Cross-border ride
        </label>
      </div>
    </fieldset>
  );
}

const routeLabels = {
  train: {
    origin: "Boarding station",
    destination: "Destination station",
    service: "Train number"
  },
  bus: { origin: "Boarding point", destination: "Drop-off point", service: "Service number" },
  ferry: {
    origin: "Departure terminal or pier",
    destination: "Arrival terminal or pier",
    service: "Vessel or service number"
  },
  cab: { origin: "Pickup", destination: "Drop-off", service: "Ride or dispatch reference" }
} as const;

export function EditJourneyLegForm({
  trip,
  booking,
  leg,
  legNumber,
  legCount = 1,
  itinerary = [],
  itineraryItem,
  onClose
}: {
  trip: Trip;
  booking: Booking;
  leg: JourneyLeg;
  legNumber: number;
  legCount?: number;
  itinerary?: ItineraryItem[];
  itineraryItem?: ItineraryItem;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const cabDetails = leg.details?.kind === "cab" ? leg.details : undefined;
  const [crossBorder, setCrossBorder] = useState(Boolean(cabDetails?.cross_border));
  const [message, setMessage] = useState("");
  const international =
    booking.journey_scope === "international" || (leg.mode === "cab" && crossBorder);
  const labels = routeLabels[leg.mode];
  const mutation = useMutation({
    mutationFn: updateJourneyLeg,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["booking", booking.id] }),
        queryClient.invalidateQueries({ queryKey: ["bookings", trip.id] }),
        queryClient.invalidateQueries({ queryKey: ["journey-legs", trip.id, booking.id] }),
        queryClient.invalidateQueries({ queryKey: ["journey-legs", trip.id] }),
        queryClient.invalidateQueries({ queryKey: ["itinerary", trip.id] })
      ]);
      onClose();
    }
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    if (!navigator.onLine) {
      setMessage(
        "Reconnect to edit this journey connection. It is saved together with the booking summary and timeline so they cannot drift apart."
      );
      return;
    }
    const form = new FormData(event.currentTarget);
    const eventTimezone =
      !international && leg.segment_order === 0
        ? text(form, "eventTimezone") || leg.origin_timezone || trip.primary_timezone
        : undefined;
    if (eventTimezone) {
      form.set("originTimezone", eventTimezone);
      form.set("destinationTimezone", eventTimezone);
    }
    const parsed = legSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success) {
      setMessage(firstValidationMessage(parsed.error));
      return;
    }
    try {
      const data = parsed.data;
      const departureAt = localDateTimeToIso(
        data.departureLocal,
        data.originTimezone,
        data.departureOccurrence
      );
      const arrivalAt = data.arrivalLocal
        ? localDateTimeToIso(data.arrivalLocal, data.destinationTimezone, data.arrivalOccurrence)
        : undefined;
      if (arrivalAt && Date.parse(arrivalAt) <= Date.parse(departureAt))
        throw new Error("Arrival must be after departure after converting both local times.");
      const lead =
        leg.mode === "ferry"
          ? (leg.boarding_lead_minutes ?? undefined)
          : data.boardingLeadMinutes
            ? Number(data.boardingLeadMinutes)
            : undefined;
      if (lead !== undefined && (!Number.isInteger(lead) || lead < 0 || lead > 360))
        throw new Error("Boarding reminder must be a whole number from 0 to 360 minutes.");
      const ferryDepartureShift = Date.parse(departureAt) - Date.parse(leg.scheduled_departure_at);
      const boardingAt =
        leg.mode === "ferry"
          ? leg.boarding_at
            ? new Date(Date.parse(leg.boarding_at) + ferryDepartureShift).toISOString()
            : undefined
          : leg.mode === "cab"
            ? undefined
            : data.boardingLocal
              ? localDateTimeToIso(data.boardingLocal, data.originTimezone, data.boardingOccurrence)
              : lead !== undefined
                ? new Date(Date.parse(departureAt) - lead * 60_000).toISOString()
                : undefined;
      if (boardingAt && Date.parse(boardingAt) > Date.parse(departureAt))
        throw new Error("Boarding cannot be after departure.");
      const details = normalizeJourneyLegDetails(leg.mode, detailsForForm(form, leg));
      const itineraryTiming =
        leg.mode !== "cab" && leg.segment_order === 0
          ? text(form, "journeyTimingMode") === "relative"
            ? {
                timingMode: "relative" as const,
                anchorItineraryItemId: text(form, "journeyAnchorItineraryItemId"),
                relativePosition:
                  text(form, "journeyRelativePosition") === "before"
                    ? ("before" as const)
                    : ("after" as const)
              }
            : { timingMode: "exact" as const }
          : undefined;
      if (itineraryTiming?.timingMode === "relative" && !itineraryTiming.anchorItineraryItemId)
        throw new Error("Choose a dated event to place this journey before or after.");
      mutation.mutate(
        {
          tripId: trip.id,
          legId: leg.id,
          version: leg.version,
          operatorName: data.operatorName || undefined,
          serviceNumber: data.serviceNumber || undefined,
          originName: data.originName,
          originCode: data.originCode?.toUpperCase() || undefined,
          originCountryCode: international
            ? data.originCountryCode?.toUpperCase() || undefined
            : undefined,
          originTimezone: data.originTimezone,
          destinationName: data.destinationName,
          destinationCode: data.destinationCode?.toUpperCase() || undefined,
          destinationCountryCode: international
            ? data.destinationCountryCode?.toUpperCase() || undefined
            : undefined,
          destinationTimezone: data.destinationTimezone,
          departureAt,
          arrivalAt,
          boardingAt,
          boardingLeadMinutes: lead,
          departurePlatform:
            leg.mode === "cab"
              ? undefined
              : leg.mode === "ferry"
                ? (leg.departure_platform ?? undefined)
                : data.departurePlatform || undefined,
          arrivalPlatform:
            leg.mode === "cab"
              ? undefined
              : leg.mode === "ferry"
                ? (leg.arrival_platform ?? undefined)
                : data.arrivalPlatform || undefined,
          details,
          itineraryTiming,
          eventTimezone
        },
        {
          onSuccess: () => {
            if (text(form, "operatorNameSource") === "other" && data.operatorName)
              void suggestCatalogValue({
                type: "service_provider",
                displayValue: data.operatorName
              });
          }
        }
      );
    } catch (error) {
      setMessage(getErrorMessage(error));
    }
  };

  return (
    <ModalSheet
      eyebrow={`${booking.title}${legCount > 1 ? ` · Connection ${legNumber}` : ""}`}
      title={`Edit ${leg.mode} details`}
      onClose={onClose}
    >
      <form className="mt-6 space-y-4" onSubmit={submit}>
        <p className="rounded-xl bg-brand-soft p-3 text-sm leading-6 text-muted">
          Change the route, local times, operator, and service here. Booking status, seller,
          contact, travelers, and the main booking reference stay under{" "}
          <strong>Edit booking</strong>.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="form-label">
            <span>{leg.mode === "cab" ? "Cab company or app" : `${leg.mode} operator`}</span>
            <JourneyOperatorPicker
              mode={leg.mode}
              name="operatorName"
              defaultValue={leg.operator_name ?? ""}
            />
          </div>
          <label className="form-label">
            {labels.service}
            <input
              className="form-input"
              name="serviceNumber"
              defaultValue={leg.service_number ?? ""}
              placeholder="Enter the service reference shown by the operator"
            />
          </label>
        </div>
        <fieldset className="rounded-2xl border border-line p-4">
          <legend className="px-1 text-sm font-extrabold">Route and local times</legend>
          <div className="mt-2 grid gap-4 sm:grid-cols-2">
            <label className="form-label">
              {labels.origin}
              <input
                autoFocus
                className="form-input"
                name="originName"
                defaultValue={leg.origin_name}
                placeholder={`Enter the ${labels.origin.toLocaleLowerCase()} shown on the ticket`}
                required
              />
            </label>
            <label className="form-label">
              {labels.origin} code
              <input
                className="form-input uppercase"
                name="originCode"
                defaultValue={leg.origin_code ?? ""}
                placeholder="Add a station or terminal code when used"
              />
            </label>
            <label className="form-label">
              {labels.destination}
              <input
                className="form-input"
                name="destinationName"
                defaultValue={leg.destination_name}
                placeholder={`Enter the ${labels.destination.toLocaleLowerCase()} shown on the ticket`}
                required
              />
            </label>
            <label className="form-label">
              {labels.destination} code
              <input
                className="form-input uppercase"
                name="destinationCode"
                defaultValue={leg.destination_code ?? ""}
                placeholder="Add a station or terminal code when used"
              />
            </label>
            {international ? (
              <>
                <label className="form-label">
                  Departure country code (optional)
                  <input
                    className="form-input uppercase"
                    name="originCountryCode"
                    minLength={2}
                    maxLength={2}
                    defaultValue={leg.origin_country_code ?? ""}
                    pattern="[A-Za-z]{2}"
                    placeholder="Enter the 2-letter country code"
                    title="Use a 2-letter country code"
                  />
                </label>
                <label className="form-label">
                  Destination country code (optional)
                  <input
                    className="form-input uppercase"
                    name="destinationCountryCode"
                    minLength={2}
                    maxLength={2}
                    defaultValue={leg.destination_country_code ?? ""}
                    pattern="[A-Za-z]{2}"
                    placeholder="Enter the 2-letter country code"
                    title="Use a 2-letter country code"
                  />
                </label>
                <label className="form-label">
                  Departure time zone
                  <TimeZoneAutocomplete
                    name="originTimezone"
                    defaultValue={leg.origin_timezone}
                    requireSelection
                    required
                  />
                </label>
                <label className="form-label">
                  Destination time zone
                  <TimeZoneAutocomplete
                    name="destinationTimezone"
                    defaultValue={leg.destination_timezone}
                    requireSelection
                    required
                  />
                </label>
              </>
            ) : (
              <>
                <input type="hidden" name="originCountryCode" value="" />
                <input type="hidden" name="destinationCountryCode" value="" />
                <input
                  type="hidden"
                  name="originTimezone"
                  value={leg.origin_timezone || trip.primary_timezone}
                />
                <input
                  type="hidden"
                  name="destinationTimezone"
                  value={leg.destination_timezone || trip.primary_timezone}
                />
              </>
            )}
            <label className="form-label">
              Departure (local time)
              <input
                className="form-input"
                type="datetime-local"
                name="departureLocal"
                min={`${trip.start_date}T00:00`}
                max={`${trip.end_date}T23:59`}
                defaultValue={isoToLocalDateTime(leg.scheduled_departure_at, leg.origin_timezone)}
                required
              />
            </label>
            <label className="form-label">
              Arrival (local time, optional)
              <input
                className="form-input"
                type="datetime-local"
                name="arrivalLocal"
                min={`${trip.start_date}T00:00`}
                max={`${trip.end_date}T23:59`}
                defaultValue={isoToLocalDateTime(
                  leg.scheduled_arrival_at,
                  leg.destination_timezone
                )}
              />
            </label>
            {international ? (
              <>
                <label className="form-label">
                  If the departure clock repeats
                  <OccurrenceSelect name="departureOccurrence" />
                </label>
                <label className="form-label">
                  If the arrival clock repeats
                  <OccurrenceSelect name="arrivalOccurrence" />
                </label>
              </>
            ) : (
              <>
                <input type="hidden" name="departureOccurrence" value="earlier" />
                <input type="hidden" name="arrivalOccurrence" value="earlier" />
              </>
            )}
          </div>
        </fieldset>
        {!international && leg.segment_order === 0 && (
          <fieldset className="rounded-2xl border border-line p-4">
            <div className="mt-2">
              <EventTimeZoneField
                name="eventTimezone"
                value={itineraryItem?.timezone ?? leg.origin_timezone ?? trip.primary_timezone}
                localDefaultValue={furthestEventTimezone(itinerary, trip.primary_timezone)}
                label="Journey time zone"
                hint="This applies to every connection in this journey while keeping each entered local clock time."
              />
            </div>
          </fieldset>
        )}
        {leg.mode !== "cab" && leg.segment_order === 0 && (
          <JourneyTimelinePlacementFields
            itinerary={itinerary}
            journeyLabel={leg.mode === "ferry" ? "ferry" : leg.mode}
            item={itineraryItem}
          />
        )}
        {leg.mode !== "cab" && leg.mode !== "ferry" && (
          <fieldset className="rounded-2xl border border-line p-4">
            <legend className="px-1 text-sm font-extrabold">Boarding and platform</legend>
            <div className="mt-2 grid gap-4 sm:grid-cols-2">
              <label className="form-label">
                Boarding reminder (minutes)
                <input
                  className="form-input"
                  type="number"
                  min="0"
                  max="360"
                  name="boardingLeadMinutes"
                  defaultValue={leg.boarding_lead_minutes ?? ""}
                  placeholder="Trip Vault calculates boarding time from departure"
                />
              </label>
              <label className="form-label">
                Exact boarding time
                <input
                  className="form-input"
                  type="datetime-local"
                  name="boardingLocal"
                  defaultValue={isoToLocalDateTime(leg.boarding_at, leg.origin_timezone)}
                />
              </label>
              <label className="form-label">
                Departure platform, bay, or gate
                <input
                  className="form-input"
                  name="departurePlatform"
                  defaultValue={leg.departure_platform ?? ""}
                  placeholder="Enter what is printed on the ticket"
                />
              </label>
              <label className="form-label">
                Arrival platform or bay
                <input
                  className="form-input"
                  name="arrivalPlatform"
                  defaultValue={leg.arrival_platform ?? ""}
                  placeholder="Enter it when known"
                />
              </label>
              {international ? (
                <label className="form-label">
                  If the boarding clock repeats
                  <OccurrenceSelect name="boardingOccurrence" />
                </label>
              ) : (
                <input type="hidden" name="boardingOccurrence" value="earlier" />
              )}
            </div>
          </fieldset>
        )}
        {(leg.mode === "cab" || leg.mode === "ferry") && (
          <input type="hidden" name="boardingOccurrence" value="earlier" />
        )}
        {leg.mode === "train" && <TrainDetailsFields details={leg.details} />}
        {leg.mode === "bus" && <BusDetailsFields details={leg.details} />}
        {leg.mode === "cab" && (
          <CabDetailsFields
            details={leg.details}
            destinationTimezone={leg.destination_timezone}
            crossBorder={crossBorder}
            onCrossBorder={setCrossBorder}
          />
        )}
        {!navigator.onLine && (
          <p role="status" className="rounded-xl bg-warning/10 p-3 text-sm font-bold text-warning">
            Reconnect before saving route or ticket changes. The connection, booking summary, and
            timeline are updated together.
          </p>
        )}
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
            <Save className="size-4" />
          )}{" "}
          Save journey changes
        </button>
      </form>
    </ModalSheet>
  );
}
