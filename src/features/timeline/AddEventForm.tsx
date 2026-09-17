import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Check, ChevronLeft, Loader2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { EventTypeIcon } from "../../components/EventTypeIcon";
import { FileDropzone } from "../../components/FileDropzone";
import { ModalSheet } from "../../components/ModalSheet";
import { suppressRealtimeRefresh } from "../sync/RealtimeRefresh";
import { addItineraryItem, listItinerary, setItineraryItemStatus } from "../trips/api";
import { getErrorMessage } from "../trips/presentation";
import {
  isJourneyEventType,
  type CostCategory,
  type ParticipantScope,
  type TimelineEventType,
  type Trip
} from "../trips/types";
import {
  amountStringToMinor,
  hotelStayInstants,
  isValidTimeZone,
  localDateTimeToIso
} from "../trips/validation";
import {
  addBookedTimelineEvent,
  addFlightBooking,
  addJourneyBooking,
  listFlightLegsForTrip,
  saveOptionalCostForCreatedEvent,
  suggestCatalogValue
} from "../workspace/api";
import { ParticipantSelector } from "../workspace/ParticipantSelector";
import { documentKind, documentKinds, type DocumentKind } from "../workspace/documentModel";
import type {
  Booking,
  FlightLeg,
  JourneyLegDetails,
  JourneyMode,
  JourneyScope,
  ReservationState,
  Traveler
} from "../workspace/types";
import {
  BookingFields,
  CostFields,
  EventTitleField,
  HotelStayFields,
  OtherTransportFields,
  PlaceAndNotesFields,
  ReservationStateFields,
  type OtherTransportSubtype
} from "./EventFormCommonFields";
import {
  AddConnectionButton,
  CabFields,
  FlightLegFields,
  GroundJourneyLegFields,
  JourneyScopeFields,
  RouteStructureFields,
  type FlightLegDraft,
  type GroundLegDraft,
  type RouteStructure
} from "./JourneyEventFields";
import {
  EventTimeZoneField,
  JourneyTimelinePlacementFields,
  furthestEventTimezone,
  readEventTiming,
  TimingFields
} from "./TimingFields";
import { upsertById } from "../queries/cache";

type Choice = { type: TimelineEventType; label: string; hint: string };
const choices: Choice[] = [
  { type: "flight", label: "Flight", hint: "Direct or connected flights" },
  {
    type: "hotel_check_in",
    label: "Hotel",
    hint: "A stay with check-in and checkout"
  },
  {
    type: "activity",
    label: "Activity",
    hint: "Visit, tour, ticket, or free time"
  },
  { type: "bus", label: "Bus", hint: "Coach, shuttle, or local bus" },
  { type: "cab", label: "Cab", hint: "Local ride, transfer, or outstation" },
  { type: "ferry", label: "Ferry / boat", hint: "Passenger or vehicle sailing" },
  { type: "train", label: "Train", hint: "Rail plan, ticket, or connection" },
  { type: "meal", label: "Meal", hint: "Lunch, dinner, or reservation" },
  {
    type: "preparation",
    label: "Preparation",
    hint: "A dated or flexible pre-trip task"
  },
  {
    type: "transport",
    label: "Other transport",
    hint: "Metro, rental, transfer, or walk"
  },
  { type: "custom", label: "Other", hint: "Anything else on the timeline" }
];

function text(form: FormData, name: string) {
  return String(form.get(name) ?? "").trim();
}
function optionalHttps(value: string, label: string) {
  if (!value) return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a complete web address.`);
  }
  if (url.protocol !== "https:") throw new Error(`${label} must start with https://.`);
  return url.toString();
}
function requiredInstant(
  form: FormData,
  dateName: string,
  zoneName: string,
  occurrenceName: string,
  label: string
) {
  const local = text(form, dateName);
  const zone = text(form, zoneName);
  if (!local) throw new Error(`Add the ${label}.`);
  if (!isValidTimeZone(zone)) throw new Error(`Choose a valid time zone for the ${label}.`);
  return localDateTimeToIso(
    local,
    zone,
    (text(form, occurrenceName) || "automatic") as "automatic" | "earlier" | "later"
  );
}
function optionalInstant(
  form: FormData,
  dateName: string,
  zoneName: string,
  occurrenceName: string,
  label: string
) {
  return text(form, dateName)
    ? requiredInstant(form, dateName, zoneName, occurrenceName, label)
    : undefined;
}
function optionalInteger(
  form: FormData,
  name: string,
  minimum = 0,
  maximum = Number.MAX_SAFE_INTEGER
) {
  const raw = text(form, name);
  if (!raw) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum)
    throw new Error(`Enter a whole number from ${minimum} to ${maximum}.`);
  return value;
}
function optionalBoardingLead(form: FormData, name: string, label: string) {
  try {
    return optionalInteger(form, name, 0, 360);
  } catch {
    throw new Error(`${label} boarding lead must be a whole number from 0 to 360 minutes.`);
  }
}
function optionalCost(form: FormData, trip: Trip, travelers: Traveler[]) {
  const raw = text(form, "costAmount");
  if (!raw) return undefined;
  const currency = text(form, "costCurrency").toUpperCase();
  if (!/^\d+(?:\.\d+)?$/.test(raw) || Number(raw) <= 0)
    throw new Error("Enter a cost amount greater than zero.");
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Choose a three-letter currency code.");
  const ids = trip.expense_splitting_enabled
    ? form.getAll("costTravelerIds").map(String)
    : travelers.map((traveler) => traveler.id);
  if (trip.expense_splitting_enabled && travelers.length && !ids.length)
    throw new Error("Choose at least one traveler to share this cost.");
  return {
    title: text(form, "costTitle") || text(form, "title") || "Event cost",
    amountMinor: amountStringToMinor(raw, currency),
    currencyCode: currency || trip.base_currency,
    paymentStatus: (text(form, "paymentStatus") || "planned") as "planned" | "paid",
    paidByTravelerId: text(form, "paidByTravelerId") || undefined,
    participantTravelerIds: ids
  };
}
function participantSelection(form: FormData, travelers: Traveler[]) {
  const participantScope = (
    text(form, "participantScope") === "selected" ? "selected" : "everyone"
  ) as ParticipantScope;
  const selected = form.getAll("travelerIds").map(String);
  const travelerIds = participantScope === "everyone" ? [] : selected;
  if (participantScope === "selected" && !travelerIds.length)
    throw new Error("Choose at least one traveler, or select Everyone.");
  return {
    participantScope,
    travelerIds,
    allowedIds: new Set(
      participantScope === "everyone" ? travelers.map((row) => row.id) : travelerIds
    )
  };
}
function flightAllocations(
  form: FormData,
  prefix: string,
  allowed: Set<string>,
  travelers: Traveler[]
) {
  return travelers
    .filter((row) => allowed.has(row.id))
    .flatMap((row) => {
      const seat = text(form, `${prefix}.traveler.${row.id}.seat`);
      const boardingGroup = text(form, `${prefix}.traveler.${row.id}.group`);
      const ticketNumber = text(form, `${prefix}.traveler.${row.id}.reference`);
      return seat || boardingGroup || ticketNumber
        ? [
            {
              travelerId: row.id,
              seat: seat || undefined,
              boardingGroup: boardingGroup || undefined,
              ticketNumber: ticketNumber || undefined
            }
          ]
        : [];
    });
}
function journeyAllocations(
  form: FormData,
  prefix: string,
  allowed: Set<string>,
  travelers: Traveler[]
) {
  return travelers
    .filter((row) => allowed.has(row.id))
    .flatMap((row) => {
      const seatOrBerth = text(form, `${prefix}.traveler.${row.id}.seat`);
      const coachOrCabin = text(form, `${prefix}.traveler.${row.id}.coach`);
      const passengerReference = text(form, `${prefix}.traveler.${row.id}.reference`);
      return seatOrBerth || coachOrCabin || passengerReference
        ? [
            {
              travelerId: row.id,
              seatOrBerth: seatOrBerth || undefined,
              coachOrCabin: coachOrCabin || undefined,
              passengerReference: passengerReference || undefined
            }
          ]
        : [];
    });
}
function normalizedEndpoint(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}
function assertConnectedRoute(
  legs: Array<{
    originCode?: string;
    originName: string;
    destinationCode?: string;
    destinationName: string;
  }>,
  noun: "flight" | "journey"
) {
  for (let index = 1; index < legs.length; index += 1) {
    const previous = legs[index - 1];
    const current = legs[index];
    const matches =
      previous.destinationCode && current.originCode
        ? normalizedEndpoint(previous.destinationCode) === normalizedEndpoint(current.originCode)
        : normalizedEndpoint(previous.destinationName) === normalizedEndpoint(current.originName);
    if (!matches)
      throw new Error(
        `Connection ${index + 1} must depart from where the previous ${noun} arrives.`
      );
  }
}
export function assertSequentialConnectionTimes(
  legs: Array<{ departureAt: string; arrivalAt?: string }>,
  noun: "flight" | "journey"
) {
  for (let index = 1; index < legs.length; index += 1) {
    const previousArrival = legs[index - 1].arrivalAt;
    if (previousArrival && legs[index].departureAt <= previousArrival)
      throw new Error(`Connection ${index + 1} must depart after the previous ${noun} arrives.`);
  }
}

function journeyTimelineTiming(
  form: FormData,
  itinerary: import("../trips/types").ItineraryItem[],
  firstLeg: { departureAt: string; originTimezone: string },
  lastLeg: { arrivalAt?: string }
) {
  if (text(form, "journeyTimingMode") !== "relative") return undefined;
  const anchorItineraryItemId = text(form, "journeyAnchorItineraryItemId");
  const anchor = itinerary.find((item) => item.id === anchorItineraryItemId);
  if (!anchor || ["relative", "unscheduled"].includes(anchor.timing_mode ?? "exact"))
    throw new Error("Choose a dated event to place this journey before or after.");
  const elapsedMinutes = lastLeg.arrivalAt
    ? Math.round(
        (new Date(lastLeg.arrivalAt).getTime() - new Date(firstLeg.departureAt).getTime()) / 60_000
      )
    : undefined;
  return {
    startsAt: firstLeg.departureAt,
    endsAt: lastLeg.arrivalAt,
    timezone: firstLeg.originTimezone,
    timingMode: "relative" as const,
    scheduledDate: text(form, "journey.0.departureAt").slice(0, 10),
    anchorItineraryItemId,
    relativePosition:
      text(form, "journeyRelativePosition") === "before" ? ("before" as const) : ("after" as const),
    isAllDay: false,
    hasExplicitStartTime: true,
    durationMinutes: elapsedMinutes
  };
}

function detailsForJourney(
  form: FormData,
  prefix: string,
  mode: Exclude<JourneyMode, "cab">
): JourneyLegDetails {
  if (mode === "train")
    return {
      kind: "train",
      train_name: text(form, `${prefix}.trainName`) || undefined,
      booked_from_name: text(form, `${prefix}.bookedFromName`) || undefined,
      booked_from_code: text(form, `${prefix}.bookedFromCode`).toUpperCase() || undefined,
      travel_class: text(form, `${prefix}.travelClass`) || undefined,
      quota: text(form, `${prefix}.quota`) || undefined,
      booking_status: text(form, `${prefix}.bookingStatus`) || undefined,
      current_status: text(form, `${prefix}.currentStatus`) || undefined
    };
  if (mode === "bus")
    return {
      kind: "bus",
      bus_class_or_layout: text(form, `${prefix}.busClass`) || undefined,
      shared_ticket_number: text(form, `${prefix}.sharedTicketNumber`) || undefined,
      boarding_point_details: text(form, `${prefix}.boardingPointDetails`) || undefined,
      dropoff_point_details: text(form, `${prefix}.dropoffPointDetails`) || undefined
    };
  const vehicle =
    text(form, `${prefix}.vehicleType`) || text(form, `${prefix}.vehicleRegistration`)
      ? {
          type: text(form, `${prefix}.vehicleType`) || undefined,
          registration: text(form, `${prefix}.vehicleRegistration`) || undefined,
          length_cm: optionalInteger(form, `${prefix}.vehicleLength`, 1),
          height_cm: optionalInteger(form, `${prefix}.vehicleHeight`, 1)
        }
      : undefined;
  return {
    kind: "ferry",
    direction: (text(form, `${prefix}.direction`) || "one_way") as
      | "one_way"
      | "outbound"
      | "return",
    ticket_timing: (text(form, `${prefix}.ticketTiming`) || "fixed") as
      | "fixed"
      | "open_date"
      | "open_return",
    seating: (text(form, `${prefix}.seating`) || "unknown") as "free" | "assigned" | "unknown",
    seller_reference: text(form, `${prefix}.sellerReference`) || undefined,
    operator_reference: text(form, `${prefix}.operatorReference`) || undefined,
    accommodation: text(form, `${prefix}.accommodation`) || undefined,
    vessel_name: text(form, `${prefix}.vesselName`) || undefined,
    departure_gate: text(form, `${prefix}.departureGate`) || undefined,
    baggage_allowance: text(form, `${prefix}.baggageAllowance`) || undefined,
    vehicle
  };
}
function bookingTypeFor(type: TimelineEventType) {
  if (type === "meal") return "restaurant" as const;
  if (type === "activity") return "activity" as const;
  if (type === "transport") return "transport" as const;
  return "other" as const;
}
function costCategoryFor(type: TimelineEventType): CostCategory {
  if (type === "flight") return "flight";
  if (["train", "bus", "ferry", "cab", "transport"].includes(type)) return "transport";
  if (type === "meal") return "food";
  if (type === "activity") return "activity";
  if (type === "hotel_check_in") return "hotel";
  return "other";
}
function defaultDocumentKindFor(type: TimelineEventType): DocumentKind {
  if (type === "flight") return "flight_ticket";
  if (type === "hotel_check_in") return "hotel_confirmation";
  if (["train", "bus", "ferry", "cab", "transport"].includes(type)) return "journey_ticket";
  if (type === "activity") return "activity_confirmation";
  if (type === "meal") return "meal_voucher";
  if (type === "preparation") return "other";
  return "booking_confirmation";
}
type SavedEvent = {
  title: string;
  itineraryItemId: string;
  bookingId?: string;
  participantScope: ParticipantScope;
  travelerIds: string[];
};
type DocumentHandoff = { file?: File; kind?: DocumentKind; documentId?: string };
type SavedCompletion = SavedEvent & {
  warnings: string[];
  flightCache?: {
    booking: Booking;
    flights: FlightLeg[];
    itinerary: import("../trips/types").ItineraryItem;
  };
  refreshCosts?: boolean;
};
const FERRY_CONFIRMATION_WARNING =
  "This ferry is saved, but it still needs an official confirmation or ticket, or a booking reference, before you rely on it during travel.";
function completionWarnings(...warnings: Array<string | undefined | false>) {
  return warnings.filter((warning): warning is string => Boolean(warning));
}

export function AddEventForm({
  trip,
  travelers,
  preferredTravelerId,
  documentToAttach,
  initialType,
  routeBacked = false,
  onClose,
  onTypeChange,
  onAddDocument
}: {
  trip: Trip;
  travelers: Traveler[];
  preferredTravelerId?: string;
  documentToAttach?: { id: string; title: string };
  initialType?: TimelineEventType | null;
  routeBacked?: boolean;
  onClose: () => void;
  onTypeChange?: (type: TimelineEventType | null) => void;
  onAddDocument?: (event: SavedEvent, handoff?: DocumentHandoff) => void | Promise<void>;
}) {
  const queryClient = useQueryClient();
  const itineraryQuery = useQuery({
    queryKey: ["itinerary", trip.id],
    queryFn: () => listItinerary(trip.id)
  });
  const defaultTimezone = furthestEventTimezone(itineraryQuery.data ?? [], trip.primary_timezone);
  const [type, setType] = useState<TimelineEventType | null>(initialType ?? null);
  const flightsQuery = useQuery({
    queryKey: ["flights", trip.id],
    queryFn: () => listFlightLegsForTrip(trip.id),
    enabled: type === "cab"
  });
  const [legKeys, setLegKeys] = useState([crypto.randomUUID()]);
  const [journeyScope, setJourneyScope] = useState<JourneyScope>("domestic");
  const [journeyStructure, setJourneyStructure] = useState<RouteStructure>("direct");
  const [reservationState, setReservationState] = useState<ReservationState>("planned");
  const [transportSubtype, setTransportSubtype] = useState<OtherTransportSubtype>("metro");
  const [participantChoice, setParticipantChoice] = useState<{
    scope: ParticipantScope;
    travelerIds: string[];
  }>(() =>
    preferredTravelerId
      ? { scope: "selected", travelerIds: [preferredTravelerId] }
      : { scope: "everyone", travelerIds: [] }
  );
  const [officialDocumentFile, setOfficialDocumentFile] = useState<File | null>(null);
  const [officialDocumentKind, setOfficialDocumentKind] = useState<DocumentKind>("flight_ticket");
  const [flightLegDrafts, setFlightLegDrafts] = useState<Record<string, FlightLegDraft>>({});
  const [groundLegDrafts, setGroundLegDrafts] = useState<Record<string, GroundLegDraft>>({});
  const [saved, setSaved] = useState<SavedCompletion | null>(null);
  const [documentSaveState, setDocumentSaveState] = useState<{
    status: "idle" | "saving" | "saved" | "error";
    message?: string;
  }>({ status: "idle" });
  useEffect(() => setType(initialType ?? null), [initialType]);
  const allocationTravelers =
    participantChoice.scope === "everyone"
      ? travelers
      : travelers.filter((traveler) => participantChoice.travelerIds.includes(traveler.id));
  const chooseJourneyStructure = (next: RouteStructure) => {
    setJourneyStructure(next);
    setLegKeys((keys) =>
      next === "direct"
        ? keys.slice(0, 1)
        : keys.length >= 2
          ? keys
          : [...keys, crypto.randomUUID()]
    );
  };
  const mutation = useMutation({
    mutationFn: async (form: FormData): Promise<SavedCompletion> => {
      if (!type) throw new Error("Choose an event type.");
      const title = text(form, "title");
      if (!title) throw new Error("Name this event.");
      const participants = participantSelection(form, travelers);
      const cost = optionalCost(form, trip, travelers);
      const bookedViaUrl = optionalHttps(text(form, "bookedViaUrl"), "Manage booking link");
      if (type === "flight") {
        const scope = text(form, "journeyScope") === "international" ? "international" : "domestic";
        const eventTimezone =
          scope === "domestic" ? text(form, "journeyEventTimezone") || defaultTimezone : undefined;
        const legs = legKeys.map((_, index) => {
          const prefix = `flight.${index}`;
          if (eventTimezone) {
            form.set(`${prefix}.departureTimezone`, eventTimezone);
            form.set(`${prefix}.arrivalTimezone`, eventTimezone);
          }
          const departureAt = requiredInstant(
            form,
            `${prefix}.departureAt`,
            `${prefix}.departureTimezone`,
            `${prefix}.departureOccurrence`,
            `departure for flight ${index + 1}`
          );
          const arrivalAt = requiredInstant(
            form,
            `${prefix}.arrivalAt`,
            `${prefix}.arrivalTimezone`,
            `${prefix}.arrivalOccurrence`,
            `arrival for flight ${index + 1}`
          );
          if (arrivalAt <= departureAt)
            throw new Error(
              `Flight connection ${index + 1} must arrive after it departs, after converting both local times.`
            );
          const boardingAt = optionalInstant(
            form,
            `${prefix}.boardingAt`,
            `${prefix}.departureTimezone`,
            `${prefix}.boardingOccurrence`,
            `boarding time for flight ${index + 1}`
          );
          if (boardingAt && boardingAt > departureAt)
            throw new Error(`Flight connection ${index + 1} cannot board after departure.`);
          return {
            airlineName: text(form, `${prefix}.airline`),
            flightNumber: text(form, `${prefix}.number`).toUpperCase(),
            departureCode: text(form, `${prefix}.departureCode`).toUpperCase(),
            departureName: text(form, `${prefix}.departureName`),
            departureCountryCode: text(form, `${prefix}.departureCountry`).toUpperCase(),
            arrivalCode: text(form, `${prefix}.arrivalCode`).toUpperCase(),
            arrivalName: text(form, `${prefix}.arrivalName`),
            arrivalCountryCode: text(form, `${prefix}.arrivalCountry`).toUpperCase(),
            departureTimezone: text(form, `${prefix}.departureTimezone`),
            arrivalTimezone: text(form, `${prefix}.arrivalTimezone`),
            departureAt,
            arrivalAt,
            boardingAt,
            boardingLeadMinutes: optionalBoardingLead(
              form,
              `${prefix}.boardingLead`,
              `Flight connection ${index + 1}`
            ),
            departureTerminal: text(form, `${prefix}.departureTerminal`) || undefined,
            departureGate: text(form, `${prefix}.departureGate`) || undefined,
            arrivalTerminal: text(form, `${prefix}.arrivalTerminal`) || undefined,
            travelerAllocations: flightAllocations(
              form,
              prefix,
              participants.allowedIds,
              travelers
            ),
            airlineSource: text(form, `${prefix}.airlineSource`),
            departureSource: text(form, `${prefix}.departureNameSource`),
            arrivalSource: text(form, `${prefix}.arrivalNameSource`)
          };
        });
        if (
          legs.some(
            (leg) =>
              !leg.airlineName ||
              !leg.flightNumber ||
              !leg.departureName ||
              !leg.departureCode ||
              !leg.arrivalName ||
              !leg.arrivalCode
          )
        )
          throw new Error(
            "Complete the airline, flight number, and both airports for every flight."
          );
        if (
          scope === "domestic" &&
          legs.some(
            (leg) =>
              leg.departureCountryCode &&
              leg.arrivalCountryCode &&
              leg.departureCountryCode !== leg.arrivalCountryCode
          )
        )
          throw new Error("A domestic flight must depart and arrive in the same country.");
        assertConnectedRoute(
          legs.map((leg) => ({
            originCode: leg.departureCode,
            originName: leg.departureName,
            destinationCode: leg.arrivalCode,
            destinationName: leg.arrivalName
          })),
          "flight"
        );
        assertSequentialConnectionTimes(legs, "flight");
        const created = await addFlightBooking({
          tripId: trip.id,
          title,
          referenceCode: text(form, "referenceCode"),
          journeyScope: scope,
          reservationState: "booked",
          participantScope: participants.participantScope,
          bookedViaName: text(form, "bookedViaName"),
          bookedViaUrl,
          travelerIds: participants.travelerIds,
          legs,
          cost
        });
        await Promise.allSettled([
          ...legs
            .filter((leg) => leg.airlineSource === "other")
            .map((leg) => suggestCatalogValue({ type: "airline", displayValue: leg.airlineName })),
          ...legs.flatMap((leg) =>
            [
              leg.departureSource === "other"
                ? suggestCatalogValue({
                    type: "airport",
                    displayValue: leg.departureName,
                    proposedData: {
                      code: leg.departureCode,
                      country_code: leg.departureCountryCode,
                      timezone: leg.departureTimezone
                    }
                  })
                : null,
              leg.arrivalSource === "other"
                ? suggestCatalogValue({
                    type: "airport",
                    displayValue: leg.arrivalName,
                    proposedData: {
                      code: leg.arrivalCode,
                      country_code: leg.arrivalCountryCode,
                      timezone: leg.arrivalTimezone
                    }
                  })
                : null
            ].filter((value): value is Promise<void> => Boolean(value))
          ),
          ...(text(form, "bookedViaNameSource") === "other"
            ? [
                suggestCatalogValue({
                  type: "booking_vendor",
                  displayValue: text(form, "bookedViaName"),
                  proposedData: { website_url: bookedViaUrl }
                })
              ]
            : [])
        ]);
        return {
          title,
          bookingId: created.booking.id,
          itineraryItemId: created.itinerary.id,
          participantScope: participants.participantScope,
          travelerIds: participants.travelerIds,
          warnings: completionWarnings(created.costWarning),
          flightCache: created,
          refreshCosts: Boolean(cost)
        };
      }
      if (["train", "bus", "ferry"].includes(type)) {
        const mode = type as Exclude<JourneyMode, "cab">;
        const scope = text(form, "journeyScope") === "international" ? "international" : "domestic";
        const eventTimezone =
          scope === "domestic" ? text(form, "journeyEventTimezone") || defaultTimezone : undefined;
        const legs = legKeys.map((_, index) => {
          const prefix = `journey.${index}`;
          if (eventTimezone) {
            form.set(`${prefix}.originTimezone`, eventTimezone);
            form.set(`${prefix}.destinationTimezone`, eventTimezone);
          }
          const departureAt = requiredInstant(
            form,
            `${prefix}.departureAt`,
            `${prefix}.originTimezone`,
            `${prefix}.departureOccurrence`,
            `departure for ${mode} ${index + 1}`
          );
          const arrivalAt = optionalInstant(
            form,
            `${prefix}.arrivalAt`,
            `${prefix}.destinationTimezone`,
            `${prefix}.arrivalOccurrence`,
            `arrival for ${mode} ${index + 1}`
          );
          if (arrivalAt && arrivalAt <= departureAt)
            throw new Error(
              `${mode} ${index + 1} must arrive after it departs, after converting both local times.`
            );
          const boardingAt = optionalInstant(
            form,
            `${prefix}.boardingAt`,
            `${prefix}.originTimezone`,
            `${prefix}.boardingOccurrence`,
            `boarding time for ${mode} ${index + 1}`
          );
          if (boardingAt && boardingAt > departureAt)
            throw new Error(`${mode} ${index + 1} cannot board after departure.`);
          return {
            operatorName: text(form, `${prefix}.operator`) || undefined,
            serviceNumber: text(form, `${prefix}.service`) || undefined,
            originCode: text(form, `${prefix}.originCode`).toUpperCase() || undefined,
            originName: text(form, `${prefix}.originName`),
            originCountryCode:
              scope === "international"
                ? text(form, `${prefix}.originCountry`).toUpperCase() || undefined
                : undefined,
            originTimezone: text(form, `${prefix}.originTimezone`),
            destinationCode: text(form, `${prefix}.destinationCode`).toUpperCase() || undefined,
            destinationName: text(form, `${prefix}.destinationName`),
            destinationCountryCode:
              scope === "international"
                ? text(form, `${prefix}.destinationCountry`).toUpperCase() || undefined
                : undefined,
            destinationTimezone: text(form, `${prefix}.destinationTimezone`),
            departureAt,
            arrivalAt,
            boardingAt,
            boardingLeadMinutes: optionalBoardingLead(
              form,
              `${prefix}.boardingLead`,
              `${mode} ${index + 1}`
            ),
            departurePlatform: text(form, `${prefix}.departurePlatform`) || undefined,
            arrivalPlatform: text(form, `${prefix}.arrivalPlatform`) || undefined,
            details: detailsForJourney(form, prefix, mode),
            travelerAllocations: journeyAllocations(
              form,
              prefix,
              participants.allowedIds,
              travelers
            )
          };
        });
        if (legs.some((leg) => !leg.originName || !leg.destinationName))
          throw new Error(`Complete the ${mode} departure and destination for every service.`);
        if (reservationState === "booked" && legs.some((leg) => !leg.operatorName))
          throw new Error(`Add the ${mode} operator shown on the ticket.`);
        assertConnectedRoute(
          legs.map((leg) => ({
            originCode: leg.originCode,
            originName: leg.originName,
            destinationCode: leg.destinationCode,
            destinationName: leg.destinationName
          })),
          "journey"
        );
        assertSequentialConnectionTimes(legs, "journey");
        const itineraryTiming = journeyTimelineTiming(
          form,
          itineraryQuery.data ?? [],
          legs[0],
          legs[legs.length - 1]
        );
        const created = await addJourneyBooking({
          tripId: trip.id,
          title,
          mode,
          reservationState,
          participantScope: participants.participantScope,
          referenceCode: text(form, "referenceCode") || undefined,
          journeyScope: scope,
          bookedViaName: text(form, "bookedViaName") || undefined,
          bookedViaUrl,
          contactPhone: text(form, "contactPhone") || undefined,
          travelerIds: participants.travelerIds,
          itineraryTiming,
          legs,
          cost
        });
        const customOperators = legKeys.flatMap((_, index) =>
          text(form, `journey.${index}.operatorSource`) === "other" &&
          text(form, `journey.${index}.operator`)
            ? [text(form, `journey.${index}.operator`)]
            : []
        );
        await Promise.allSettled([
          ...(text(form, "bookedViaNameSource") === "other"
            ? [
                suggestCatalogValue({
                  type: "booking_vendor",
                  displayValue: text(form, "bookedViaName"),
                  proposedData: { website_url: bookedViaUrl }
                })
              ]
            : []),
          ...customOperators.map((operator) =>
            suggestCatalogValue({ type: "service_provider", displayValue: operator })
          )
        ]);
        const hasFerryReference =
          mode !== "ferry" ||
          Boolean(text(form, "referenceCode")) ||
          legs.some(
            (leg) =>
              leg.details.kind === "ferry" &&
              Boolean(leg.details.seller_reference || leg.details.operator_reference)
          ) ||
          legs.some((leg) =>
            leg.travelerAllocations.some((allocation) => allocation.passengerReference)
          );
        return {
          title,
          bookingId: created.booking.id,
          itineraryItemId: created.itinerary.id,
          participantScope: participants.participantScope,
          travelerIds: participants.travelerIds,
          warnings: completionWarnings(
            created.costWarning,
            mode === "ferry" &&
              reservationState === "booked" &&
              !hasFerryReference &&
              FERRY_CONFIRMATION_WARNING
          ),
          refreshCosts: Boolean(cost)
        };
      }
      if (type === "cab") {
        const timing = readEventTiming(form, trip, itineraryQuery.data ?? []);
        const crossBorder = text(form, "cab.crossBorder") === "yes";
        const originTimezone = timing.timezone;
        const destinationTimezone = crossBorder
          ? text(form, "cab.destinationTimezone")
          : timing.timezone;
        if (!["exact", "relative"].includes(timing.timingMode))
          throw new Error(
            "Choose an exact pickup time or place this cab before or after another event."
          );
        if (reservationState === "booked" && !text(form, "cab.operator"))
          throw new Error("Choose the cab company or app, or select Other and enter it.");
        const details: JourneyLegDetails = {
          kind: "cab",
          ride_type: (text(form, "cabRideType") || "local") as
            | "local"
            | "airport_transfer"
            | "outstation"
            | "hourly",
          cross_border: crossBorder || undefined,
          linked_flight_leg_id: text(form, "cab.linkedFlightLegId") || undefined,
          pickup_buffer_minutes: optionalInteger(form, "cab.pickupBuffer", 0),
          luggage_count: optionalInteger(form, "cab.luggageCount", 0),
          pickup_instructions: text(form, "cab.pickupInstructions") || undefined,
          vehicle_class: text(form, "cab.vehicleClass") || undefined,
          driver_name: text(form, "cab.driverName") || undefined,
          driver_phone: text(form, "cab.driverPhone") || undefined,
          vehicle_registration: text(form, "cab.vehicleRegistration") || undefined,
          trip_shape: (text(form, "cab.tripShape") || "one_way") as "one_way" | "round_trip",
          return_at: text(form, "cab.returnAt")
            ? localDateTimeToIso(text(form, "cab.returnAt"), destinationTimezone)
            : undefined,
          final_dropoff: text(form, "cab.dropoff") || undefined
        };
        const created = await addJourneyBooking({
          tripId: trip.id,
          title,
          mode: "cab",
          reservationState,
          participantScope: participants.participantScope,
          referenceCode: text(form, "referenceCode") || undefined,
          bookedViaName: text(form, "bookedViaName") || undefined,
          bookedViaUrl,
          contactPhone: text(form, "contactPhone") || undefined,
          bookingDetails: {
            notes: text(form, "notes") || undefined,
            map_url: optionalHttps(text(form, "mapUrl"), "Pickup Google Maps link")
          },
          travelerIds: participants.travelerIds,
          itineraryTiming: timing,
          legs: [
            {
              operatorName: text(form, "cab.operator") || undefined,
              originName: text(form, "cab.pickup"),
              originCountryCode: crossBorder
                ? text(form, "cab.originCountry").toUpperCase()
                : undefined,
              originTimezone,
              destinationName: text(form, "cab.dropoff") || "Return to pickup",
              destinationCountryCode: crossBorder
                ? text(form, "cab.destinationCountry").toUpperCase()
                : undefined,
              destinationTimezone,
              departureAt: timing.startsAt,
              arrivalAt: timing.endsAt,
              details
            }
          ],
          cost
        });
        if (text(form, "cab.operatorSource") === "other" && text(form, "cab.operator"))
          await suggestCatalogValue({
            type: "service_provider",
            displayValue: text(form, "cab.operator")
          });
        if (text(form, "cabAlreadyHappened") === "yes")
          await setItineraryItemStatus(created.itinerary, "done");
        return {
          title,
          bookingId: created.booking.id,
          itineraryItemId: created.itinerary.id,
          participantScope: participants.participantScope,
          travelerIds: participants.travelerIds,
          warnings: completionWarnings(created.costWarning),
          refreshCosts: Boolean(cost)
        };
      }
      const timezone = text(form, "timezone") || trip.primary_timezone;
      const stay =
        type === "hotel_check_in"
          ? hotelStayInstants({
              checkInLocal: text(form, "startsAt"),
              checkoutLocal: text(form, "checkoutAt"),
              timeZone: timezone,
              checkInOccurrence: "earlier",
              checkoutOccurrence: "earlier"
            })
          : null;
      const timing = stay
        ? {
            startsAt: stay.checkInAt,
            endsAt: stay.checkoutAt,
            timezone,
            timingMode: "exact" as const,
            scheduledDate: text(form, "checkInDate"),
            isAllDay: false,
            hasExplicitStartTime: text(form, "checkInHasTime") === "yes"
          }
        : readEventTiming(form, trip, itineraryQuery.data ?? []);
      const rawNotes = text(form, "notes");
      const transportLabel: Record<OtherTransportSubtype, string> = {
        metro: "Metro / public transit",
        rental: "Rental vehicle",
        private_transfer: "Private transfer",
        walk: "Walk",
        other: "Other transport"
      };
      const plannedDetails =
        reservationState !== "booked"
          ? [
              type === "activity" && text(form, "meetingInstructions")
                ? `Entry / meeting: ${text(form, "meetingInstructions")}`
                : "",
              type === "meal" && text(form, "partySize")
                ? `Party size: ${text(form, "partySize")}`
                : "",
              type === "meal" && text(form, "dietaryNotes")
                ? `Dietary / arrival: ${text(form, "dietaryNotes")}`
                : "",
              type === "transport" && text(form, "transport.returnAt")
                ? `Return: ${text(form, "transport.returnAt").replace("T", " ")}`
                : ""
            ].filter(Boolean)
          : [];
      const notes =
        type === "transport"
          ? [transportLabel[transportSubtype], rawNotes, ...plannedDetails]
              .filter(Boolean)
              .join(" · ")
          : [rawNotes, ...plannedDetails].filter(Boolean).join(" · ");
      const common = {
        tripId: trip.id,
        eventType: type,
        title,
        ...timing,
        location: text(form, "location"),
        mapUrl: optionalHttps(text(form, "mapUrl"), "Google Maps link"),
        notes,
        travelerIds: participants.travelerIds
      };
      const preparationBooking =
        type === "preparation" && Boolean(text(form, "provider") || bookedViaUrl);
      if (type === "hotel_check_in" || reservationState === "booked" || preparationBooking) {
        const provider = type === "hotel_check_in" ? title : text(form, "provider");
        const bookingDetails = {
          room_type: text(form, "roomType") || undefined,
          room_count: optionalInteger(form, "roomCount", 1),
          lead_guest: text(form, "leadGuest") || undefined,
          meeting_instructions: text(form, "meetingInstructions") || undefined,
          party_size: optionalInteger(form, "partySize", 1),
          dietary_notes: text(form, "dietaryNotes") || undefined,
          transport_subtype: type === "transport" ? transportSubtype : undefined,
          transport_from: text(form, "transport.from") || undefined,
          transport_to: text(form, "transport.to") || undefined,
          transport_return_at: text(form, "transport.returnAt") || undefined
        };
        const created = await addBookedTimelineEvent({
          ...common,
          type: type === "hotel_check_in" ? "hotel" : bookingTypeFor(type),
          provider,
          referenceCode: text(form, "referenceCode"),
          reservationState,
          participantScope: participants.participantScope,
          bookedViaName: text(form, "bookedViaName"),
          bookedViaUrl,
          contactName: text(form, "contactName"),
          contactPhone: text(form, "contactPhone"),
          bookingDetails,
          hotelCheckInHasTime: text(form, "checkInHasTime") === "yes",
          hotelCheckoutHasTime: text(form, "checkoutHasTime") === "yes",
          cost: preparationBooking ? undefined : cost
        });
        const preparationCostWarning =
          preparationBooking && cost
            ? await saveOptionalCostForCreatedEvent({
                tripId: trip.id,
                bookingId: created.booking.id,
                itineraryItemId: created.itinerary[0].id,
                title: cost.title,
                category: "other",
                amountMinor: cost.amountMinor,
                currencyCode: cost.currencyCode,
                paymentStatus: cost.paymentStatus,
                paidByTravelerId: cost.paidByTravelerId,
                participantTravelerIds: cost.participantTravelerIds
              })
            : undefined;
        await Promise.allSettled([
          ...(provider
            ? [suggestCatalogValue({ type: "service_provider", displayValue: provider })]
            : []),
          ...(text(form, "bookedViaNameSource") === "other"
            ? [
                suggestCatalogValue({
                  type: "booking_vendor",
                  displayValue: text(form, "bookedViaName"),
                  proposedData: { website_url: bookedViaUrl }
                })
              ]
            : [])
        ]);
        return {
          title,
          bookingId: created.booking.id,
          itineraryItemId: created.itinerary[0].id,
          participantScope: participants.participantScope,
          travelerIds: participants.travelerIds,
          warnings: completionWarnings(created.costWarning, preparationCostWarning),
          refreshCosts: Boolean(cost)
        };
      }
      const item = await addItineraryItem(common);
      const costWarning = cost
        ? await saveOptionalCostForCreatedEvent({
            tripId: trip.id,
            itineraryItemId: item.id,
            title: cost.title,
            category: costCategoryFor(type),
            amountMinor: cost.amountMinor,
            currencyCode: cost.currencyCode,
            paymentStatus: cost.paymentStatus,
            paidByTravelerId: cost.paidByTravelerId,
            participantTravelerIds: cost.participantTravelerIds
          })
        : undefined;
      return {
        title,
        itineraryItemId: item.id,
        participantScope: participants.participantScope,
        travelerIds: participants.travelerIds,
        warnings: completionWarnings(costWarning),
        refreshCosts: Boolean(cost)
      };
    },
    onMutate: () =>
      suppressRealtimeRefresh(
        ["bookings", "flights", "journey-legs", "itinerary", "costs", "trip-airlines"],
        15_000
      ),
    onSuccess: async (created) => {
      if (created.flightCache) {
        suppressRealtimeRefresh(["bookings", "flights", "itinerary"]);
        queryClient.setQueryData<Booking[]>(["bookings", trip.id], (items) =>
          upsertById(items, [created.flightCache!.booking])
        );
        queryClient.setQueryData<FlightLeg[]>(["flights", trip.id], (items) =>
          upsertById(items, created.flightCache!.flights)
        );
        queryClient.setQueryData<import("../trips/types").ItineraryItem[]>(
          ["itinerary", trip.id],
          (items) => upsertById(items, [created.flightCache!.itinerary])
        );
        queryClient.invalidateQueries({
          queryKey: ["trip-airlines", trip.id],
          refetchType: "none"
        });
        if (created.refreshCosts)
          await queryClient.invalidateQueries({ queryKey: ["costs", trip.id] });
      } else {
        const roots = new Set<string>(["itinerary"]);
        if (
          isJourneyEventType(type ?? undefined) ||
          type === "hotel_check_in" ||
          reservationState === "booked" ||
          type === "preparation"
        )
          roots.add("bookings");
        if (type && ["train", "bus", "ferry", "cab"].includes(type)) roots.add("journey-legs");
        if (created.refreshCosts) roots.add("costs");
        await Promise.all(
          [...roots].map((key) => queryClient.invalidateQueries({ queryKey: [key, trip.id] }))
        );
      }
      setSaved(created);
      const documentHandoff = documentToAttach
        ? { documentId: documentToAttach.id }
        : officialDocumentFile
          ? { file: officialDocumentFile, kind: officialDocumentKind }
          : null;
      if (documentHandoff && onAddDocument) {
        setDocumentSaveState({ status: "saving" });
        try {
          await onAddDocument(
            {
              title: created.title,
              bookingId: created.bookingId,
              itineraryItemId: created.itineraryItemId,
              participantScope: created.participantScope,
              travelerIds: created.travelerIds
            },
            documentHandoff
          );
          setDocumentSaveState({ status: "saved" });
        } catch (error) {
          setDocumentSaveState({ status: "error", message: getErrorMessage(error) });
        }
      }
    }
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    mutation.mutate(new FormData(event.currentTarget));
  };
  const selectType = (next: TimelineEventType) => {
    setType(next);
    onTypeChange?.(next);
    setLegKeys([crypto.randomUUID()]);
    setJourneyScope("domestic");
    setJourneyStructure("direct");
    setReservationState(next === "flight" || next === "hotel_check_in" ? "booked" : "planned");
    setTransportSubtype("metro");
    setOfficialDocumentFile(null);
    setOfficialDocumentKind(defaultDocumentKindFor(next));
    setDocumentSaveState({ status: "idle" });
  };
  if (saved)
    return (
      <ModalSheet
        eyebrow={trip.title}
        title="Added to timeline"
        onClose={onClose}
        manageHistory={!routeBacked}
      >
        <div className="mt-6 rounded-[2rem] border border-success/30 bg-success/10 p-6 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-success text-white">
            <Check className="size-6" />
          </span>
          <h3 className="mt-4 font-display text-2xl font-black">{saved.title}</h3>
          <p className="mt-2 text-sm leading-6 text-muted">
            {documentSaveState.status === "saving"
              ? documentToAttach
                ? "The event is saved. Its document is being linked to the timeline."
                : "The event is saved. Its official document is being named and added to the Vault."
              : documentSaveState.status === "saved"
                ? documentToAttach
                  ? "The event is saved and the uploaded document is linked to it."
                  : "The event and its official document are saved. The document inherited this event's travelers and remains editable from Document Info."
                : "The event is saved. Add an official document now, or open the event later to add documents, seats, booking details, and cost."}
          </p>
          {documentSaveState.status === "saving" && (
            <p
              role="status"
              className="mt-4 rounded-2xl bg-brand-soft p-3 text-sm font-bold text-brand"
            >
              <Loader2 className="mr-2 inline size-4 animate-spin" />{" "}
              {documentToAttach ? "Linking document…" : "Saving official document…"}
            </p>
          )}
          {documentSaveState.status === "saved" && (
            <p
              role="status"
              className="mt-4 rounded-2xl bg-success/10 p-3 text-sm font-bold text-success"
            >
              {documentToAttach
                ? "Document linked to this event."
                : "Official document saved to the Vault."}
            </p>
          )}
          {documentSaveState.status === "error" && (
            <p
              role="alert"
              className="mt-4 rounded-2xl bg-danger/10 p-3 text-left text-sm font-bold text-danger"
            >
              The event is safe, but its document could not be added: {documentSaveState.message}
            </p>
          )}
          {saved.warnings.length > 0 && (
            <div
              role="status"
              className="mt-4 space-y-2 rounded-2xl border border-warning/30 bg-warning/10 p-4 text-left text-sm font-bold leading-6 text-ink"
            >
              {saved.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          )}
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {onAddDocument &&
              !documentToAttach &&
              documentSaveState.status !== "saving" &&
              documentSaveState.status !== "saved" && (
                <button
                  type="button"
                  className="primary-button w-full"
                  onClick={() =>
                    onAddDocument({
                      title: saved.title,
                      bookingId: saved.bookingId,
                      itineraryItemId: saved.itineraryItemId,
                      participantScope: saved.participantScope,
                      travelerIds: saved.travelerIds
                    })
                  }
                >
                  Add official document
                </button>
              )}
            <button
              type="button"
              className="secondary-button w-full"
              disabled={documentSaveState.status === "saving"}
              onClick={onClose}
            >
              Done
            </button>
          </div>
        </div>
      </ModalSheet>
    );
  const isJourney = isJourneyEventType(type ?? undefined);
  const groundMode =
    type && ["train", "bus", "ferry"].includes(type) ? (type as Exclude<JourneyMode, "cab">) : null;
  return (
    <ModalSheet
      eyebrow={trip.title}
      title={
        type ? `Add ${choices.find((choice) => choice.type === type)?.label}` : "Add to timeline"
      }
      onClose={onClose}
      manageHistory={!routeBacked}
    >
      {!type ? (
        <>
          {documentToAttach && (
            <p className="mt-5 rounded-2xl bg-brand-soft p-4 text-sm leading-6 text-muted">
              <strong className="block text-brand">Document saved</strong>Create the timeline event
              for “{documentToAttach.title}”. It will be linked automatically after the event is
              saved.
            </p>
          )}
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {choices.map(({ type: choiceType, label, hint }) => (
              <button
                key={choiceType}
                type="button"
                onClick={() => selectType(choiceType)}
                className="group flex min-h-24 items-center gap-4 rounded-2xl border border-line bg-elevated p-4 text-left transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-soft"
              >
                <EventTypeIcon
                  type={choiceType}
                  className="size-11 rounded-xl transition group-hover:scale-105"
                />
                <span>
                  <strong className="block font-display text-base font-black">{label}</strong>
                  <span className="mt-1 block text-xs leading-5 text-muted">{hint}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <form className="mt-5 space-y-5" onSubmit={submit}>
          <button
            type="button"
            onClick={() => {
              setType(null);
              onTypeChange?.(null);
            }}
            className="inline-flex items-center gap-1 text-sm font-extrabold text-brand"
          >
            <ChevronLeft className="size-4" /> Change event type
          </button>
          <EventTitleField type={type} />
          <ReservationStateFields
            type={type}
            value={reservationState}
            onChange={setReservationState}
            transportSubtype={type === "transport" ? transportSubtype : undefined}
          />
          <ParticipantSelector
            travelers={travelers}
            selectedTravelerIds={preferredTravelerId ? [preferredTravelerId] : undefined}
            initialScope={preferredTravelerId ? "selected" : "everyone"}
            scopeName="participantScope"
            onSelectionChange={(scope, travelerIds) => setParticipantChoice({ scope, travelerIds })}
          />
          {isJourney && type !== "cab" && (
            <JourneyScopeFields value={journeyScope} onChange={setJourneyScope} />
          )}
          {type === "flight" && (
            <RouteStructureFields
              mode="flight"
              value={journeyStructure}
              onChange={chooseJourneyStructure}
            />
          )}
          {groundMode && (
            <RouteStructureFields
              mode={groundMode}
              value={journeyStructure}
              onChange={chooseJourneyStructure}
            />
          )}
          {isJourney && type !== "cab" && journeyScope === "domestic" && (
            <fieldset className="rounded-2xl border border-line p-4">
              <legend className="px-1 text-sm font-extrabold">Journey time zone</legend>
              <div className="mt-2">
                <EventTimeZoneField
                  name="journeyEventTimezone"
                  value={defaultTimezone}
                  localDefaultValue={defaultTimezone}
                  label="Local time zone for this journey"
                />
              </div>
            </fieldset>
          )}
          {type === "flight" && (
            <>
              <BookingFields type="flight" referenceRequired hideProvider />
              {legKeys.map((key, index) => (
                <FlightLegFields
                  key={key}
                  index={index}
                  trip={trip}
                  defaultTimezone={defaultTimezone}
                  scope={journeyScope}
                  travelers={allocationTravelers}
                  direct={journeyStructure === "direct"}
                  removable={journeyStructure === "connecting" && legKeys.length > 2}
                  previousLeg={index > 0 ? flightLegDrafts[legKeys[index - 1]] : undefined}
                  onArrivalChange={(value) =>
                    setFlightLegDrafts((current) => {
                      const previous = current[key];
                      return previous?.arrivalAirport === value.arrivalAirport &&
                        previous?.arrivalLocal === value.arrivalLocal
                        ? current
                        : { ...current, [key]: value };
                    })
                  }
                  onRemove={() => setLegKeys((keys) => keys.filter((item) => item !== key))}
                />
              ))}
              {journeyStructure === "connecting" && (
                <AddConnectionButton
                  mode="flight"
                  onClick={() => setLegKeys((keys) => [...keys, crypto.randomUUID()])}
                />
              )}
            </>
          )}
          {groundMode && (
            <>
              {reservationState === "booked" && <BookingFields type={groundMode} hideProvider />}
              <JourneyTimelinePlacementFields
                itinerary={itineraryQuery.data ?? []}
                journeyLabel={groundMode === "ferry" ? "ferry" : groundMode}
              />
              {legKeys.map((key, index) => (
                <GroundJourneyLegFields
                  key={key}
                  index={index}
                  mode={groundMode}
                  trip={trip}
                  defaultTimezone={defaultTimezone}
                  scope={journeyScope}
                  travelers={allocationTravelers}
                  reservationState={reservationState}
                  direct={journeyStructure === "direct"}
                  removable={journeyStructure === "connecting" && legKeys.length > 2}
                  previousLeg={index > 0 ? groundLegDrafts[legKeys[index - 1]] : undefined}
                  onDestinationChange={(value) =>
                    setGroundLegDrafts((current) => {
                      const previous = current[key];
                      return previous?.destinationName === value.destinationName &&
                        previous?.destinationCode === value.destinationCode &&
                        previous?.arrivalLocal === value.arrivalLocal
                        ? current
                        : { ...current, [key]: value };
                    })
                  }
                  onRemove={() => setLegKeys((keys) => keys.filter((item) => item !== key))}
                />
              ))}
              {journeyStructure === "connecting" && (
                <AddConnectionButton
                  mode={groundMode}
                  onClick={() => setLegKeys((keys) => [...keys, crypto.randomUUID()])}
                />
              )}
            </>
          )}
          {type === "cab" && (
            <>
              {reservationState !== "planned" && <BookingFields type="cab" hideProvider />}
              <CabFields
                trip={trip}
                defaultTimezone={defaultTimezone}
                reservationState={reservationState}
                flightLegs={flightsQuery.data ?? []}
                renderItineraryTiming={(showTimezone) => (
                  <TimingFields
                    trip={trip}
                    itinerary={itineraryQuery.data ?? []}
                    defaultTimezone={defaultTimezone}
                    allowedModes={["exact", "relative"]}
                    showTimezone={showTimezone}
                  />
                )}
              />
            </>
          )}
          {type && !isJourney && (
            <>
              {type === "hotel_check_in" ? (
                <HotelStayFields trip={trip} defaultTimezone={defaultTimezone} />
              ) : (
                <TimingFields
                  trip={trip}
                  itinerary={itineraryQuery.data ?? []}
                  defaultTimezone={defaultTimezone}
                />
              )}
              {type !== "preparation" &&
                reservationState === "booked" &&
                !(type === "transport" && transportSubtype === "walk") && (
                  <BookingFields type={type} hideProvider={type === "hotel_check_in"} />
                )}
              {type === "transport" ? (
                <OtherTransportFields
                  subtype={transportSubtype}
                  onSubtypeChange={(next) => {
                    setTransportSubtype(next);
                    if (next === "walk") setReservationState("planned");
                  }}
                  trip={trip}
                />
              ) : (
                <PlaceAndNotesFields
                  type={type}
                  mealPartySize={
                    type === "meal" && reservationState === "booked"
                      ? allocationTravelers.length
                      : undefined
                  }
                />
              )}
            </>
          )}
          {onAddDocument && !documentToAttach && (
            <section className="rounded-2xl border border-line bg-surface/70 p-4">
              <p className="text-sm font-extrabold">Attach an official document (optional)</p>
              <p className="mt-1 text-xs leading-5 text-muted">
                Add a ticket, confirmation, voucher, or other supporting file now. It will inherit
                this event's travelers, remain visible to trip members by default, and can be
                changed later from Document Info.
              </p>
              <label className="form-label mt-4">
                Document type
                <select
                  className="form-input"
                  name="officialDocumentKind"
                  value={officialDocumentKind}
                  onChange={(event) => setOfficialDocumentKind(event.target.value as DocumentKind)}
                >
                  {documentKinds.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label} — {option.hint}
                    </option>
                  ))}
                </select>
              </label>
              <div className="mt-3">
                <FileDropzone
                  name="officialDocument"
                  label="Official document"
                  prompt={`Choose ${documentKind(officialDocumentKind).label.toLowerCase()}`}
                  file={officialDocumentFile}
                  onFileChange={setOfficialDocumentFile}
                />
              </div>
              <p className="mt-2 text-xs text-muted">
                If it is not available yet, save the event and attach one or more documents from its
                details later.
              </p>
            </section>
          )}
          <CostFields trip={trip} travelers={travelers} />
          {mutation.error && (
            <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm font-bold text-danger">
              {getErrorMessage(mutation.error)}
            </p>
          )}
          <button className="primary-button w-full" disabled={mutation.isPending}>
            {mutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CalendarPlus className="size-4" />
            )}{" "}
            Save to timeline
          </button>
        </form>
      )}
    </ModalSheet>
  );
}
