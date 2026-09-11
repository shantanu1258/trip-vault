import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BedDouble, Bus, CalendarPlus, CarTaxiFront, ChevronLeft, CircleEllipsis,
  CookingPot, Ship, Loader2, MapPinned, Plane, Plus, TrainFront, Trash2
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { ModalSheet } from "../../components/ModalSheet";
import { TimeZoneAutocomplete } from "../../components/TimeZoneAutocomplete";
import { AirlinePicker } from "../metadata/AirlinePicker";
import { AirportPicker } from "../metadata/AirportPicker";
import { VendorPicker } from "../metadata/VendorPicker";
import { addItineraryItem, addTripCost } from "../trips/api";
import { getErrorMessage } from "../trips/presentation";
import { isJourneyEventType, type CostCategory, type TimelineEventType, type Trip } from "../trips/types";
import { amountStringToMinor, isValidTimeZone, localDateTimeToIso } from "../trips/validation";
import { addBookedTimelineEvent, addFlightBooking, addJourneyBooking, suggestCatalogValue } from "../workspace/api";
import { ParticipantSelector } from "../workspace/ParticipantSelector";
import type { BookingType, JourneyMode, JourneyScope, Traveler } from "../workspace/types";

type Choice = {
  type: TimelineEventType;
  label: string;
  hint: string;
  icon: typeof Plane;
};

const choices: Choice[] = [
  { type: "flight", label: "Flight", hint: "One or more connected legs", icon: Plane },
  { type: "train", label: "Train", hint: "Rail ticket or connection", icon: TrainFront },
  { type: "bus", label: "Bus", hint: "Coach or local bus", icon: Bus },
  { type: "ferry", label: "Ferry / boat", hint: "Passenger or vehicle sailing", icon: Ship },
  { type: "cab", label: "Cab", hint: "Airport transfer or taxi", icon: CarTaxiFront },
  { type: "hotel_check_in", label: "Hotel", hint: "Creates check-in and checkout", icon: BedDouble },
  { type: "meal", label: "Meal", hint: "Dinner, lunch, or reservation", icon: CookingPot },
  { type: "activity", label: "Activity", hint: "Visit, tour, or free time", icon: MapPinned },
  { type: "preparation", label: "Preparation", hint: "A dated pre-trip task", icon: CalendarPlus },
  { type: "transport", label: "Other transport", hint: "Metro, rental, or transfer", icon: CarTaxiFront },
  { type: "custom", label: "Other", hint: "Anything else on the timeline", icon: CircleEllipsis }
];

function text(form: FormData, name: string) {
  return String(form.get(name) ?? "").trim();
}

function optionalHttps(value: string, label: string) {
  if (!value) return undefined;
  let url: URL;
  try { url = new URL(value); } catch { throw new Error(`${label} must be a complete web address.`); }
  if (url.protocol !== "https:") throw new Error(`${label} must start with https://.`);
  return url.toString();
}

function instant(form: FormData, dateName: string, zoneName: string, occurrenceName: string) {
  const local = text(form, dateName);
  const zone = text(form, zoneName);
  if (!local) throw new Error("Add the date and time.");
  if (!isValidTimeZone(zone)) throw new Error(`Enter a valid IANA time zone for ${dateName.includes("arrival") || dateName.includes("destination") ? "arrival" : "departure"}.`);
  const occurrence = (text(form, occurrenceName) || "automatic") as "automatic" | "earlier" | "later";
  return localDateTimeToIso(local, zone, occurrence);
}

function optionalCost(form: FormData, trip: Trip) {
  if (text(form, "includeCost") !== "yes") return undefined;
  const rawAmount = text(form, "costAmount");
  const currencyCode = text(form, "costCurrency").toUpperCase();
  if (!/^\d+(?:\.\d+)?$/.test(rawAmount)) throw new Error("Enter zero or a positive cost amount.");
  if (!/^[A-Z]{3}$/.test(currencyCode)) throw new Error("Use a three-letter currency code.");
  return {
    title: text(form, "costTitle") || text(form, "title") || "Event cost",
    amountMinor: amountStringToMinor(rawAmount, currencyCode),
    currencyCode: currencyCode || trip.base_currency,
    paymentStatus: (text(form, "paymentStatus") || "planned") as "planned" | "paid"
  };
}

function CostFields({ trip }: { trip: Trip }) {
  const [enabled, setEnabled] = useState(false);
  return <fieldset className="rounded-2xl border border-line p-4">
    <label className="flex items-center gap-3 text-sm font-extrabold"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /> Add cost</label>
    <input type="hidden" name="includeCost" value={enabled ? "yes" : "no"} />
    {enabled && <div className="mt-4 grid gap-4 sm:grid-cols-2">
      <label className="form-label">Amount<input className="form-input" name="costAmount" inputMode="decimal" placeholder="0 for free" required /></label>
      <label className="form-label">Currency<input className="form-input uppercase" name="costCurrency" defaultValue={trip.base_currency} maxLength={3} required /></label>
      <label className="form-label">Cost label<input className="form-input" name="costTitle" placeholder="Uses event title if empty" /></label>
      <label className="form-label">Payment<select className="form-input" name="paymentStatus"><option value="planned">Planned / unpaid</option><option value="paid">Paid</option></select></label>
    </div>}
  </fieldset>;
}

function BookingFields({ always = false, referenceRequired = false }: { always?: boolean; referenceRequired?: boolean }) {
  const [enabled, setEnabled] = useState(always);
  return <fieldset className="rounded-2xl border border-line p-4">
    {!always && <label className="flex items-center gap-3 text-sm font-extrabold"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /> This has a booking or reservation</label>}
    <input type="hidden" name="hasBooking" value={enabled ? "yes" : "no"} />
    {enabled && <div className={`${always ? "" : "mt-4"} grid gap-4 sm:grid-cols-2`}>
      <label className="form-label">Provider / operator<input className="form-input" name="provider" placeholder="Hotel, restaurant, tour company" /></label>
      <label className="form-label">Reference / PNR{referenceRequired ? " (required)" : ""}<input className="form-input uppercase" name="referenceCode" maxLength={80} required={referenceRequired} /></label>
      <label className="form-label">Booked via<VendorPicker /></label>
      <label className="form-label">Booking website<input className="form-input" type="url" name="bookedViaUrl" placeholder="https://..." /></label>
      <label className="form-label">Contact name<input className="form-input" name="contactName" placeholder="Driver, hotel, agent" /></label>
      <label className="form-label">Phone number<input className="form-input" type="tel" name="contactPhone" maxLength={25} placeholder="+65 9123 4567" /></label>
    </div>}
  </fieldset>;
}

function OccurrenceSelect({ name }: { name: string }) {
  return <select className="form-input" name={name} defaultValue="automatic" aria-label="Repeated clock time choice">
    <option value="automatic">Automatic (usual)</option>
    <option value="earlier">Earlier occurrence</option>
    <option value="later">Later occurrence</option>
  </select>;
}

function FlightLegFields({ index, trip, removable, onRemove }: { index: number; trip: Trip; removable: boolean; onRemove: () => void }) {
  const prefix = `flight.${index}`;
  return <fieldset className="rounded-2xl border border-line p-4">
    <div className="flex items-center justify-between"><legend className="font-display text-lg font-black">{index ? `Connection ${index + 1}` : "First flight"}</legend>{removable && <button type="button" className="tap-target grid size-9 place-items-center text-danger" onClick={onRemove} aria-label={`Remove flight leg ${index + 1}`}><Trash2 className="size-4" /></button>}</div>
    <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="form-label">Airline<AirlinePicker name={`${prefix}.airline`} /></label><label className="form-label">Flight number<input className="form-input uppercase" name={`${prefix}.number`} placeholder="SQ 403" required /></label></div>
    <div className="mt-4 grid gap-4 sm:grid-cols-[7rem_minmax(0,1fr)]"><label className="form-label">From code<input className="form-input uppercase" name={`${prefix}.departureCode`} maxLength={4} placeholder="BLR" /></label><label className="form-label">Origin airport<AirportPicker name={`${prefix}.departureName`} codeName={`${prefix}.departureCode`} timezoneName={`${prefix}.departureTimezone`} countryName={`${prefix}.departureCountry`} placeholder="Search code or airport" /></label></div>
    <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="form-label">Origin country<input className="form-input uppercase" name={`${prefix}.departureCountry`} maxLength={2} placeholder="IN" /></label><label className="form-label">Origin time zone<TimeZoneAutocomplete name={`${prefix}.departureTimezone`} defaultValue={trip.primary_timezone} required /></label></div>
    <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="form-label">Departure (origin local time)<input className="form-input" type="datetime-local" name={`${prefix}.departureAt`} defaultValue={`${trip.start_date}T09:00`} required /></label><label className="form-label">If the clock repeats<OccurrenceSelect name={`${prefix}.departureOccurrence`} /></label></div>
    <div className="mt-4 grid gap-4 sm:grid-cols-[7rem_minmax(0,1fr)]"><label className="form-label">To code<input className="form-input uppercase" name={`${prefix}.arrivalCode`} maxLength={4} placeholder="DXB" /></label><label className="form-label">Destination airport<AirportPicker name={`${prefix}.arrivalName`} codeName={`${prefix}.arrivalCode`} timezoneName={`${prefix}.arrivalTimezone`} countryName={`${prefix}.arrivalCountry`} placeholder="Search code or airport" /></label></div>
    <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="form-label">Destination country<input className="form-input uppercase" name={`${prefix}.arrivalCountry`} maxLength={2} placeholder="AE" /></label><label className="form-label">Destination time zone<TimeZoneAutocomplete name={`${prefix}.arrivalTimezone`} defaultValue={trip.primary_timezone} required /></label></div>
    <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="form-label">Arrival (destination local time)<input className="form-input" type="datetime-local" name={`${prefix}.arrivalAt`} defaultValue={`${trip.start_date}T12:00`} required /></label><label className="form-label">If the clock repeats<OccurrenceSelect name={`${prefix}.arrivalOccurrence`} /></label></div>
    <div className="mt-4 grid gap-4 sm:grid-cols-3"><label className="form-label">Boarding lead (minutes)<input className="form-input" type="number" min="0" max="360" name={`${prefix}.boardingLead`} placeholder="45" /></label><label className="form-label">Exact boarding time (optional)<input className="form-input" type="datetime-local" name={`${prefix}.boardingAt`} /></label><label className="form-label">If boarding clock repeats<OccurrenceSelect name={`${prefix}.boardingOccurrence`} /></label></div>
  </fieldset>;
}

function JourneyLegFields({ index, mode, trip, removable, onRemove }: { index: number; mode: JourneyMode; trip: Trip; removable: boolean; onRemove: () => void }) {
  const prefix = `journey.${index}`;
  return <fieldset className="rounded-2xl border border-line p-4">
    <div className="flex items-center justify-between"><legend className="font-display text-lg font-black">{index ? `Connection ${index + 1}` : `First ${mode}`}</legend>{removable && <button type="button" className="tap-target grid size-9 place-items-center text-danger" onClick={onRemove} aria-label={`Remove journey leg ${index + 1}`}><Trash2 className="size-4" /></button>}</div>
    <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="form-label">Operator<input className="form-input" name={`${prefix}.operator`} placeholder="Eurostar, FlixBus, driver…" required /></label><label className="form-label">Service number<input className="form-input" name={`${prefix}.service`} placeholder="Optional" /></label></div>
    <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="form-label">Origin<input className="form-input" name={`${prefix}.originName`} required /></label><label className="form-label">Origin code<input className="form-input uppercase" name={`${prefix}.originCode`} /></label><label className="form-label">Origin country<input className="form-input uppercase" maxLength={2} name={`${prefix}.originCountry`} /></label><label className="form-label">Origin time zone<TimeZoneAutocomplete name={`${prefix}.originTimezone`} defaultValue={trip.primary_timezone} required /></label><label className="form-label">Departure (origin local)<input className="form-input" type="datetime-local" name={`${prefix}.departureAt`} defaultValue={`${trip.start_date}T09:00`} required /></label><label className="form-label">If clock repeats<OccurrenceSelect name={`${prefix}.departureOccurrence`} /></label></div>
    <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="form-label">Destination<input className="form-input" name={`${prefix}.destinationName`} required /></label><label className="form-label">Destination code<input className="form-input uppercase" name={`${prefix}.destinationCode`} /></label><label className="form-label">Destination country<input className="form-input uppercase" maxLength={2} name={`${prefix}.destinationCountry`} /></label><label className="form-label">Destination time zone<TimeZoneAutocomplete name={`${prefix}.destinationTimezone`} defaultValue={trip.primary_timezone} required /></label><label className="form-label">Arrival (destination local)<input className="form-input" type="datetime-local" name={`${prefix}.arrivalAt`} defaultValue={`${trip.start_date}T12:00`} required /></label><label className="form-label">If clock repeats<OccurrenceSelect name={`${prefix}.arrivalOccurrence`} /></label></div>
    <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="form-label">Boarding lead (minutes)<input className="form-input" type="number" min="0" max="360" name={`${prefix}.boardingLead`} /></label><label className="form-label">Exact boarding time<input className="form-input" type="datetime-local" name={`${prefix}.boardingAt`} /></label><label className="form-label">If boarding clock repeats<OccurrenceSelect name={`${prefix}.boardingOccurrence`} /></label><label className="form-label">Departure platform / bay<input className="form-input" name={`${prefix}.departurePlatform`} /></label><label className="form-label">Arrival platform / bay<input className="form-input" name={`${prefix}.arrivalPlatform`} /></label><label className="form-label">Coach / cabin<input className="form-input" name={`${prefix}.coach`} /></label><label className="form-label">Seat<input className="form-input" name={`${prefix}.seat`} /></label></div>
  </fieldset>;
}

function scopeValue(form: FormData): JourneyScope {
  return text(form, "journeyScope") === "international" ? "international" : "domestic";
}

function bookingTypeFor(type: TimelineEventType): BookingType {
  if (type === "meal") return "restaurant";
  if (type === "activity") return "activity";
  if (type === "transport") return "transport";
  return "other";
}

function costCategoryFor(type: TimelineEventType): CostCategory {
  if (["flight"].includes(type)) return "flight";
  if (["train", "bus", "ferry", "cab", "transport"].includes(type)) return "transport";
  if (type === "meal") return "food";
  if (type === "activity") return "activity";
  if (type === "hotel_check_in") return "hotel";
  return "other";
}

export function AddEventForm({ trip, travelers, preferredTravelerId, onClose }: { trip: Trip; travelers: Traveler[]; preferredTravelerId?: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [type, setType] = useState<TimelineEventType | null>(null);
  const [legKeys, setLegKeys] = useState([crypto.randomUUID()]);
  const mutation = useMutation({
    mutationFn: async (form: FormData) => {
      if (!type) throw new Error("Choose an event type.");
      const title = text(form, "title");
      if (!title) throw new Error("Name this event.");
      const travelerIds = form.getAll("travelerIds").map(String);
      const cost = optionalCost(form, trip);
      const bookedViaUrl = optionalHttps(text(form, "bookedViaUrl"), "Booking website");
      if (type === "flight") {
        const legs = legKeys.map((_, index) => {
          const prefix = `flight.${index}`;
          const departureTimezone = text(form, `${prefix}.departureTimezone`);
          const arrivalTimezone = text(form, `${prefix}.arrivalTimezone`);
          const departureAt = instant(form, `${prefix}.departureAt`, `${prefix}.departureTimezone`, `${prefix}.departureOccurrence`);
          const arrivalAt = instant(form, `${prefix}.arrivalAt`, `${prefix}.arrivalTimezone`, `${prefix}.arrivalOccurrence`);
          if (arrivalAt <= departureAt) throw new Error(`Flight leg ${index + 1} must arrive after it departs, after converting both local times.`);
          const boardingLocal = text(form, `${prefix}.boardingAt`);
          const boardingAt = boardingLocal ? localDateTimeToIso(boardingLocal, departureTimezone, (text(form, `${prefix}.boardingOccurrence`) || "automatic") as "automatic" | "earlier" | "later") : undefined;
          if (boardingAt && boardingAt > departureAt) throw new Error(`Flight leg ${index + 1} cannot board after departure.`);
          return { airlineName: text(form, `${prefix}.airline`), flightNumber: text(form, `${prefix}.number`).toUpperCase(), departureCode: text(form, `${prefix}.departureCode`).toUpperCase(), departureName: text(form, `${prefix}.departureName`), departureCountryCode: text(form, `${prefix}.departureCountry`).toUpperCase(), arrivalCode: text(form, `${prefix}.arrivalCode`).toUpperCase(), arrivalName: text(form, `${prefix}.arrivalName`), arrivalCountryCode: text(form, `${prefix}.arrivalCountry`).toUpperCase(), departureTimezone, arrivalTimezone, departureAt, arrivalAt, boardingAt, boardingLeadMinutes: text(form, `${prefix}.boardingLead`) ? Number(text(form, `${prefix}.boardingLead`)) : undefined };
        });
        if (legs.some((leg) => !leg.airlineName || !leg.flightNumber || !leg.departureName || !leg.arrivalName)) throw new Error("Complete the airline, flight number, origin, and destination for every leg.");
        for (let index = 1; index < legs.length; index += 1) if (legs[index].departureAt < legs[index - 1].arrivalAt) throw new Error(`Connection ${index + 1} departs before the previous flight arrives.`);
        const created = await addFlightBooking({ tripId: trip.id, title, referenceCode: text(form, "referenceCode"), journeyScope: scopeValue(form), bookedViaName: text(form, "bookedViaName"), bookedViaUrl, contactName: text(form, "contactName"), contactPhone: text(form, "contactPhone"), travelerIds, legs, cost });
        await Promise.allSettled([
          ...legs.map((leg) => suggestCatalogValue({ type: "airline", displayValue: leg.airlineName })),
          ...legs.flatMap((leg) => [suggestCatalogValue({ type: "airport", displayValue: leg.departureName, proposedData: { code: leg.departureCode, country_code: leg.departureCountryCode, timezone: leg.departureTimezone } }), suggestCatalogValue({ type: "airport", displayValue: leg.arrivalName, proposedData: { code: leg.arrivalCode, country_code: leg.arrivalCountryCode, timezone: leg.arrivalTimezone } })]),
          suggestCatalogValue({ type: "booking_vendor", displayValue: text(form, "bookedViaName"), proposedData: { website_url: bookedViaUrl } })
        ]);
        return created;
      }
      if (["train", "bus", "ferry", "cab"].includes(type)) {
        const mode = type as JourneyMode;
        const legs = legKeys.map((_, index) => {
          const prefix = `journey.${index}`;
          const originTimezone = text(form, `${prefix}.originTimezone`);
          const destinationTimezone = text(form, `${prefix}.destinationTimezone`);
          const departureAt = instant(form, `${prefix}.departureAt`, `${prefix}.originTimezone`, `${prefix}.departureOccurrence`);
          const arrivalAt = instant(form, `${prefix}.arrivalAt`, `${prefix}.destinationTimezone`, `${prefix}.arrivalOccurrence`);
          if (arrivalAt <= departureAt) throw new Error(`Journey leg ${index + 1} must arrive after it departs, after converting both local times.`);
          const boardingLocal = text(form, `${prefix}.boardingAt`);
          const boardingAt = boardingLocal ? localDateTimeToIso(boardingLocal, originTimezone, (text(form, `${prefix}.boardingOccurrence`) || "automatic") as "automatic" | "earlier" | "later") : undefined;
          if (boardingAt && boardingAt > departureAt) throw new Error(`Journey leg ${index + 1} cannot board after departure.`);
          return { operatorName: text(form, `${prefix}.operator`), serviceNumber: text(form, `${prefix}.service`), originCode: text(form, `${prefix}.originCode`).toUpperCase(), originName: text(form, `${prefix}.originName`), originCountryCode: text(form, `${prefix}.originCountry`).toUpperCase(), originTimezone, destinationCode: text(form, `${prefix}.destinationCode`).toUpperCase(), destinationName: text(form, `${prefix}.destinationName`), destinationCountryCode: text(form, `${prefix}.destinationCountry`).toUpperCase(), destinationTimezone, departureAt, arrivalAt, boardingAt, boardingLeadMinutes: text(form, `${prefix}.boardingLead`) ? Number(text(form, `${prefix}.boardingLead`)) : undefined, departurePlatform: text(form, `${prefix}.departurePlatform`), arrivalPlatform: text(form, `${prefix}.arrivalPlatform`), coachOrCabin: text(form, `${prefix}.coach`), seat: text(form, `${prefix}.seat`) };
        });
        if (legs.some((leg) => !leg.operatorName || !leg.originName || !leg.destinationName)) throw new Error("Complete the operator, origin, and destination for every leg.");
        for (let index = 1; index < legs.length; index += 1) if (legs[index].departureAt < legs[index - 1].arrivalAt) throw new Error(`Connection ${index + 1} departs before the previous leg arrives.`);
        const created = await addJourneyBooking({ tripId: trip.id, title, mode, referenceCode: text(form, "referenceCode"), journeyScope: scopeValue(form), bookedViaName: text(form, "bookedViaName"), bookedViaUrl, contactName: text(form, "contactName"), contactPhone: text(form, "contactPhone"), travelerIds, legs, cost });
        await Promise.allSettled([
          ...legs.map((leg) => suggestCatalogValue({ type: "service_provider", displayValue: leg.operatorName })),
          suggestCatalogValue({ type: "booking_vendor", displayValue: text(form, "bookedViaName"), proposedData: { website_url: bookedViaUrl } })
        ]);
        return created;
      }
      const timezone = text(form, "timezone");
      const startsAt = instant(form, "startsAt", "timezone", "occurrence");
      const checkoutLocal = type === "hotel_check_in" ? text(form, "checkoutAt") : "";
      const endsAt = checkoutLocal ? localDateTimeToIso(checkoutLocal, timezone, (text(form, "checkoutOccurrence") || "automatic") as "automatic" | "earlier" | "later") : undefined;
      if (endsAt && endsAt < startsAt) throw new Error("Hotel checkout cannot be before check-in.");
      const common = { tripId: trip.id, eventType: type, title, startsAt, endsAt, timezone, location: text(form, "location"), mapUrl: optionalHttps(text(form, "mapUrl"), "Map link"), notes: text(form, "notes"), travelerIds };
      if (type === "hotel_check_in" || text(form, "hasBooking") === "yes") {
        if (type === "hotel_check_in" && !endsAt) throw new Error("Add the hotel checkout date and time.");
        const created = await addBookedTimelineEvent({ ...common, type: type === "hotel_check_in" ? "hotel" : bookingTypeFor(type), provider: text(form, "provider"), referenceCode: text(form, "referenceCode"), journeyScope: undefined, bookedViaName: text(form, "bookedViaName"), bookedViaUrl, contactName: text(form, "contactName"), contactPhone: text(form, "contactPhone"), cost });
        await Promise.allSettled([suggestCatalogValue({ type: "service_provider", displayValue: text(form, "provider") }), suggestCatalogValue({ type: "booking_vendor", displayValue: text(form, "bookedViaName"), proposedData: { website_url: bookedViaUrl } })]);
        return created;
      }
      const item = await addItineraryItem(common);
      if (cost) await addTripCost({ tripId: trip.id, itineraryItemId: item.id, title: cost.title, category: costCategoryFor(type), amountMinor: cost.amountMinor, currencyCode: cost.currencyCode, paymentStatus: cost.paymentStatus });
      return item;
    },
    onSuccess: async () => {
      await Promise.all(["itinerary", "bookings", "flights", "journey-legs", "costs", "trip-airlines"].map((key) => queryClient.invalidateQueries({ queryKey: [key, trip.id] })));
      onClose();
    }
  });
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); mutation.mutate(new FormData(event.currentTarget)); };
  const isJourney = isJourneyEventType(type ?? undefined);
  return <ModalSheet eyebrow={trip.title} title={type ? `Add ${choices.find((choice) => choice.type === type)?.label}` : "Add to timeline"} onClose={onClose}>
    {!type ? <div className="mt-6 grid gap-3 sm:grid-cols-2">{choices.map(({ type: choiceType, label, hint, icon: Icon }) => <button key={choiceType} type="button" onClick={() => { setType(choiceType); setLegKeys([crypto.randomUUID()]); }} className="group flex min-h-24 items-center gap-4 rounded-2xl border border-line bg-elevated p-4 text-left transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-soft"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand transition group-hover:scale-105"><Icon className="size-5" /></span><span><strong className="block font-display text-base font-black">{label}</strong><span className="mt-1 block text-xs leading-5 text-muted">{hint}</span></span></button>)}</div> : <form className="mt-5 space-y-5" onSubmit={submit}>
      <button type="button" onClick={() => setType(null)} className="inline-flex items-center gap-1 text-sm font-extrabold text-brand"><ChevronLeft className="size-4" /> Change event type</button>
      <label className="form-label">Event title<input autoFocus className="form-input" name="title" placeholder={type === "flight" ? "Flights to London" : type === "hotel_check_in" ? "Dubai hotel" : "What is happening?"} required /></label>
      {isJourney && <fieldset className="grid grid-cols-2 gap-3 rounded-2xl border border-line p-4"><legend className="px-1 text-sm font-extrabold">Journey type</legend><label className="flex items-center gap-2 rounded-xl bg-elevated p-3 text-sm font-bold"><input type="radio" name="journeyScope" value="domestic" defaultChecked /> Domestic</label><label className="flex items-center gap-2 rounded-xl bg-elevated p-3 text-sm font-bold"><input type="radio" name="journeyScope" value="international" /> International</label></fieldset>}
      {type === "flight" && <><BookingFields always referenceRequired />{legKeys.map((key, index) => <FlightLegFields key={key} index={index} trip={trip} removable={legKeys.length > 1} onRemove={() => setLegKeys((keys) => keys.filter((item) => item !== key))} />)}<button type="button" className="secondary-button w-full" onClick={() => setLegKeys((keys) => [...keys, crypto.randomUUID()])}><Plus className="size-4" /> Add connecting flight</button></>}
      {type && ["train", "bus", "ferry", "cab"].includes(type) && <><BookingFields always />{legKeys.map((key, index) => <JourneyLegFields key={key} index={index} mode={type as JourneyMode} trip={trip} removable={legKeys.length > 1} onRemove={() => setLegKeys((keys) => keys.filter((item) => item !== key))} />)}<button type="button" className="secondary-button w-full" onClick={() => setLegKeys((keys) => [...keys, crypto.randomUUID()])}><Plus className="size-4" /> Add connection</button></>}
      {type && !isJourney && <>
        <div className="grid gap-4 sm:grid-cols-2"><label className="form-label">{type === "hotel_check_in" ? "Check-in (hotel local time)" : "Starts (place local time)"}<input className="form-input" name="startsAt" type="datetime-local" defaultValue={`${trip.start_date}T09:00`} required /></label><label className="form-label">Time zone<TimeZoneAutocomplete name="timezone" defaultValue={trip.primary_timezone} required /></label><label className="form-label">If clock repeats<OccurrenceSelect name="occurrence" /></label>{type === "hotel_check_in" && <><label className="form-label">Checkout (hotel local time)<input className="form-input" name="checkoutAt" type="datetime-local" required /></label><label className="form-label">If checkout clock repeats<OccurrenceSelect name="checkoutOccurrence" /></label></>}</div>
        <label className="form-label">Place / address<input className="form-input" name="location" /></label><label className="form-label">Google Maps link<input className="form-input" type="url" name="mapUrl" placeholder="https://maps.google.com/..." /></label><label className="form-label">Notes<textarea className="form-input min-h-24" name="notes" /></label>
        <BookingFields always={type === "hotel_check_in"} />
      </>}
      <ParticipantSelector travelers={travelers} selectedTravelerIds={preferredTravelerId ? [preferredTravelerId] : undefined} explicitAll />
      <CostFields trip={trip} />
      {mutation.error && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm font-bold text-danger">{getErrorMessage(mutation.error)}</p>}
      <button className="primary-button w-full" disabled={mutation.isPending}>{mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <CalendarPlus className="size-4" />} Save to timeline</button>
    </form>}
  </ModalSheet>;
}
