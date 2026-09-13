import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BedDouble, Bus, CalendarPlus, CarTaxiFront, ChevronLeft, CircleEllipsis,
  CookingPot, Ship, Loader2, MapPinned, Plane, Plus, TrainFront, Trash2
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { CurrencySelect } from "../../components/CurrencySelect";
import { ModalSheet } from "../../components/ModalSheet";
import { TimeZoneAutocomplete } from "../../components/TimeZoneAutocomplete";
import { AirlinePicker } from "../metadata/AirlinePicker";
import { AirportPicker } from "../metadata/AirportPicker";
import { VendorPicker } from "../metadata/VendorPicker";
import { addItineraryItem, addTripCost, listItinerary } from "../trips/api";
import { getErrorMessage } from "../trips/presentation";
import { isJourneyEventType, type CostCategory, type TimelineEventType, type Trip } from "../trips/types";
import { amountStringToMinor, defaultHotelCheckoutLocal, hotelStayInstants, isValidTimeZone, localDateTimeMinusMinutes, localDateTimeToIso } from "../trips/validation";
import { addBookedTimelineEvent, addFlightBooking, addJourneyBooking, suggestCatalogValue } from "../workspace/api";
import { ParticipantSelector } from "../workspace/ParticipantSelector";
import type { BookingType, JourneyMode, JourneyScope, Traveler } from "../workspace/types";
import { readEventTiming, TimingFields } from "./TimingFields";

type Choice = {
  type: TimelineEventType;
  label: string;
  hint: string;
  icon: typeof Plane;
};

const choices: Choice[] = [
  { type: "flight", label: "Flight", hint: "One or more connected legs", icon: Plane },
  { type: "hotel_check_in", label: "Hotel", hint: "Creates check-in and checkout", icon: BedDouble },
  { type: "activity", label: "Activity", hint: "Visit, tour, or free time", icon: MapPinned },
  { type: "bus", label: "Bus", hint: "Coach or local bus", icon: Bus },
  { type: "train", label: "Train", hint: "Rail ticket or connection", icon: TrainFront },
  { type: "ferry", label: "Ferry / boat", hint: "Passenger or vehicle sailing", icon: Ship },
  { type: "cab", label: "Cab", hint: "Airport transfer or taxi", icon: CarTaxiFront },
  { type: "meal", label: "Meal", hint: "Dinner, lunch, or reservation", icon: CookingPot },
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

function optionalCost(form: FormData, trip: Trip, travelers: Traveler[]) {
  if (text(form, "includeCost") !== "yes") return undefined;
  const rawAmount = text(form, "costAmount");
  const currencyCode = text(form, "costCurrency").toUpperCase();
  if (!/^\d+(?:\.\d+)?$/.test(rawAmount)) throw new Error("Enter zero or a positive cost amount.");
  if (!/^[A-Z]{3}$/.test(currencyCode)) throw new Error("Use a three-letter currency code.");
  const participantTravelerIds = form.getAll("costTravelerIds").map(String);
  if (travelers.length > 0 && participantTravelerIds.length === 0) throw new Error("Choose at least one traveler to share this cost.");
  return {
    title: text(form, "costTitle") || text(form, "title") || "Event cost",
    amountMinor: amountStringToMinor(rawAmount, currencyCode),
    currencyCode: currencyCode || trip.base_currency,
    paymentStatus: (text(form, "paymentStatus") || "planned") as "planned" | "paid",
    paidByTravelerId: text(form, "paidByTravelerId") || undefined,
    participantTravelerIds
  };
}

function optionalBoardingLead(form: FormData, name: string, label: string) {
  const value = text(form, name);
  if (!value) return undefined;
  const minutes = Number(value);
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 360) throw new Error(`${label} boarding lead must be a whole number from 0 to 360 minutes.`);
  return minutes;
}

function normalizedEndpoint(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function assertConnectedRoute(
  legs: Array<{
    departureCode?: string;
    departureName?: string;
    originCode?: string;
    originName?: string;
    arrivalCode?: string;
    arrivalName?: string;
    destinationCode?: string;
    destinationName?: string;
  }>,
  noun: "flight" | "journey"
) {
  for (let index = 1; index < legs.length; index += 1) {
    const previous = legs[index - 1];
    const current = legs[index];
    const previousCode = previous.arrivalCode || previous.destinationCode || "";
    const currentCode = current.departureCode || current.originCode || "";
    const previousName = previous.arrivalName || previous.destinationName || "";
    const currentName = current.departureName || current.originName || "";
    const matches = previousCode && currentCode
      ? normalizedEndpoint(previousCode) === normalizedEndpoint(currentCode)
      : normalizedEndpoint(previousName) === normalizedEndpoint(currentName);
    if (!matches) {
      throw new Error(`Connection ${index + 1} must depart from where the previous ${noun} arrives.`);
    }
  }
}

export function assertSequentialConnectionTimes(legs: Array<{ departureAt: string; arrivalAt: string }>, noun: "flight" | "journey") {
  for (let index = 1; index < legs.length; index += 1) {
    if (legs[index].departureAt <= legs[index - 1].arrivalAt) {
      throw new Error(`Connection ${index + 1} must depart after the previous ${noun} arrives.`);
    }
  }
}

function CostFields({ trip, travelers }: { trip: Trip; travelers: Traveler[] }) {
  const [enabled, setEnabled] = useState(false);
  const [everyone, setEveryone] = useState(true);
  return <fieldset className="rounded-2xl border border-line p-4">
    <label className="flex items-center gap-3 text-sm font-extrabold"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /> Add cost</label>
    <input type="hidden" name="includeCost" value={enabled ? "yes" : "no"} />
    {enabled && <div className="mt-4 grid gap-4 sm:grid-cols-2">
      <label className="form-label">Amount<input className="form-input" name="costAmount" inputMode="decimal" placeholder="Enter 0 if this event is free" required /></label>
      <label className="form-label">Currency<CurrencySelect name="costCurrency" defaultValue={trip.base_currency} required /></label>
      <label className="form-label">Cost label<input className="form-input" name="costTitle" placeholder="Describe what this amount covers" /></label>
      <label className="form-label">Payment<select className="form-input" name="paymentStatus"><option value="planned">Planned / unpaid</option><option value="paid">Paid</option></select></label>
      {travelers.length > 0 && <label className="form-label">Paid by<select className="form-input" name="paidByTravelerId"><option value="">Not recorded yet</option>{travelers.map((traveler) => <option key={traveler.id} value={traveler.id}>{traveler.display_name}</option>)}</select></label>}
      {travelers.length > 0 && <div className="sm:col-span-2"><div className="flex flex-wrap gap-4 text-sm"><label className="flex items-center gap-2"><input type="radio" checked={everyone} onChange={() => setEveryone(true)} /> Split among everyone</label><label className="flex items-center gap-2"><input type="radio" checked={!everyone} onChange={() => setEveryone(false)} /> Choose people</label></div>{everyone ? travelers.map((traveler) => <input key={traveler.id} type="hidden" name="costTravelerIds" value={traveler.id} />) : <div className="mt-3 grid gap-2 sm:grid-cols-2">{travelers.map((traveler) => <label key={traveler.id} className="flex items-center gap-2 rounded-xl bg-elevated p-3 text-sm font-bold"><input type="checkbox" name="costTravelerIds" value={traveler.id} />{traveler.display_name}</label>)}</div>}</div>}
    </div>}
  </fieldset>;
}

function BookingFields({ always = false, referenceRequired = false, flightReference = false, showProvider = true, showContactName = true }: { always?: boolean; referenceRequired?: boolean; flightReference?: boolean; showProvider?: boolean; showContactName?: boolean }) {
  const [enabled, setEnabled] = useState(always);
  const [website, setWebsite] = useState("");
  return <fieldset className="rounded-2xl border border-line p-4">
    {!always && <label className="flex items-center gap-3 text-sm font-extrabold"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /> This has a booking or reservation</label>}
    <input type="hidden" name="hasBooking" value={enabled ? "yes" : "no"} />
    {enabled && <div className={`${always ? "" : "mt-4"} grid gap-4 sm:grid-cols-2`}>
      {showProvider && <label className="form-label">Service provider<input className="form-input" name="provider" placeholder="Enter the business delivering this service" /><span className="mt-1 block text-xs font-medium text-muted">The hotel, restaurant, tour company, or other business providing the service.</span></label>}
      <label className="form-label">{flightReference ? "Booking reference / PNR" : "Booking reference"}{referenceRequired ? " (required)" : ""}<input className="form-input uppercase" name="referenceCode" maxLength={80} placeholder="Enter the reference from the booking confirmation" required={referenceRequired} /></label>
      <label className="form-label">Booked via<VendorPicker onWebsite={setWebsite} /><span className="mt-1 block text-xs font-medium text-muted">Where you purchased it: an airline website, booking platform, or travel agent.</span></label>
      <label className="form-label">Booking website<input className="form-input" type="url" name="bookedViaUrl" value={website} onChange={(event) => setWebsite(event.target.value)} placeholder="Paste the reservation or confirmation link" /></label>
      {showContactName && <label className="form-label">Contact name<input className="form-input" name="contactName" placeholder="Enter the service contact or driver name" /></label>}
      <label className="form-label">Phone number<input className="form-input" type="tel" name="contactPhone" maxLength={25} placeholder="Include country code for Call and WhatsApp" /></label>
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

function RepeatedClockHelp() {
  return <p className="mt-2 text-xs leading-5 text-muted">Leave Automatic normally. If daylight saving makes this local time occur twice, choose the earlier or later occurrence shown by the ticket provider.</p>;
}

function HotelStayFields({ trip }: { trip: Trip }) {
  const initialCheckIn = `${trip.start_date}T15:00`;
  const [checkIn, setCheckIn] = useState(initialCheckIn);
  const [checkout, setCheckout] = useState(defaultHotelCheckoutLocal(initialCheckIn));
  const changeCheckIn = (nextCheckIn: string) => {
    setCheckIn(nextCheckIn);
    setCheckout((current) => (!current || current <= nextCheckIn) ? defaultHotelCheckoutLocal(nextCheckIn) : current);
  };
  return <>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="form-label">Check-in (hotel local time)<input className="form-input" name="startsAt" type="datetime-local" min={`${trip.start_date}T00:00`} max={`${trip.end_date}T23:59`} value={checkIn} onChange={(event) => changeCheckIn(event.target.value)} required /></label>
      <label className="form-label">Checkout (hotel local time)<input className="form-input" name="checkoutAt" type="datetime-local" min={`${trip.start_date}T00:00`} max={`${trip.end_date}T23:59`} value={checkout} onChange={(event) => setCheckout(event.target.value)} required /></label>
    </div>
    <input type="hidden" name="timezone" value={trip.primary_timezone} />
    <input type="hidden" name="occurrence" value="earlier" />
    <input type="hidden" name="checkoutOccurrence" value="earlier" />
    <p className="-mt-3 text-xs leading-5 text-muted">Checkout starts on the following day by default. Enter both times as shown by the property.</p>
  </>;
}

function FlightLegFields({ index, trip, scope, removable, onRemove }: { index: number; trip: Trip; scope: JourneyScope; removable: boolean; onRemove: () => void }) {
  const prefix = `flight.${index}`;
  const [departure, setDeparture] = useState(`${trip.start_date}T09:00`);
  const [boardingLead, setBoardingLead] = useState("");
  const [departureCountry, setDepartureCountry] = useState("");
  const international = scope === "international";
  const calculatedBoarding = boardingLead ? localDateTimeMinusMinutes(departure, Number(boardingLead)) : "";
  return <fieldset className="rounded-2xl border border-line p-4">
    <div className="flex items-center justify-between"><legend className="font-display text-lg font-black">{index ? `Connection ${index + 1}` : "First flight"}</legend>{removable && <button type="button" className="tap-target grid size-9 place-items-center text-danger" onClick={onRemove} aria-label={`Remove flight leg ${index + 1}`}><Trash2 className="size-4" /></button>}</div>
    <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="form-label">Airline<AirlinePicker name={`${prefix}.airline`} /><span className="mt-1 block text-xs font-medium text-muted">The carrier operating this flight; this is different from where it was booked.</span></label><label className="form-label">Flight number<input className="form-input uppercase" name={`${prefix}.number`} placeholder="Enter the number printed on the ticket" required /></label></div>
    <div className="mt-4"><AirportPicker name={`${prefix}.departureName`} codeName={`${prefix}.departureCode`} timezoneName={`${prefix}.departureTimezone`} countryName={`${prefix}.departureCountry`} label="From airport" defaultTimezone={trip.primary_timezone} showManualTimezone={international} onCountryChange={setDepartureCountry} /></div>
    <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="form-label">Departure (origin local time)<input className="form-input" type="datetime-local" name={`${prefix}.departureAt`} min={`${trip.start_date}T00:00`} max={`${trip.end_date}T23:59`} value={departure} onChange={(event) => setDeparture(event.target.value)} required /></label>{international ? <label className="form-label">If the clock repeats<OccurrenceSelect name={`${prefix}.departureOccurrence`} /></label> : <input type="hidden" name={`${prefix}.departureOccurrence`} value="earlier" />}</div>
    <div className="mt-4"><AirportPicker name={`${prefix}.arrivalName`} codeName={`${prefix}.arrivalCode`} timezoneName={`${prefix}.arrivalTimezone`} countryName={`${prefix}.arrivalCountry`} label="To airport" defaultTimezone={trip.primary_timezone} countryFilter={international ? undefined : departureCountry} showManualTimezone={international} /></div>
    <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="form-label">Arrival (destination local time)<input className="form-input" type="datetime-local" name={`${prefix}.arrivalAt`} min={`${trip.start_date}T00:00`} max={`${trip.end_date}T23:59`} defaultValue={`${trip.start_date}T12:00`} required /></label>{international ? <label className="form-label">If the clock repeats<OccurrenceSelect name={`${prefix}.arrivalOccurrence`} /></label> : <input type="hidden" name={`${prefix}.arrivalOccurrence`} value="earlier" />}</div>
    <div className="mt-4 grid gap-4 sm:grid-cols-3"><label className="form-label">Boarding lead (minutes)<input className="form-input" type="number" min="0" max="360" name={`${prefix}.boardingLead`} value={boardingLead} onChange={(event) => setBoardingLead(event.target.value)} placeholder="Enter minutes before departure" /></label><label className="form-label">Exact boarding time override<input className="form-input" type="datetime-local" name={`${prefix}.boardingAt`} /></label>{international ? <label className="form-label">If boarding clock repeats<OccurrenceSelect name={`${prefix}.boardingOccurrence`} /></label> : <input type="hidden" name={`${prefix}.boardingOccurrence`} value="earlier" />}</div>
    {calculatedBoarding && <p className="mt-3 rounded-xl bg-brand-soft px-3 py-2 text-xs font-bold text-brand">Calculated boarding time: {calculatedBoarding.replace("T", " ")} at the departure airport. An exact time overrides this.</p>}{international && <RepeatedClockHelp />}
  </fieldset>;
}

function JourneyLegFields({ index, mode, trip, scope, removable, onRemove }: { index: number; mode: JourneyMode; trip: Trip; scope: JourneyScope; removable: boolean; onRemove: () => void }) {
  const prefix = `journey.${index}`;
  const [departure, setDeparture] = useState(`${trip.start_date}T09:00`);
  const [boardingLead, setBoardingLead] = useState("");
  const international = scope === "international";
  const calculatedBoarding = boardingLead ? localDateTimeMinusMinutes(departure, Number(boardingLead)) : "";
  return <fieldset className="rounded-2xl border border-line p-4">
    <div className="flex items-center justify-between"><legend className="font-display text-lg font-black">{index ? `Connection ${index + 1}` : `First ${mode}`}</legend>{removable && <button type="button" className="tap-target grid size-9 place-items-center text-danger" onClick={onRemove} aria-label={`Remove journey leg ${index + 1}`}><Trash2 className="size-4" /></button>}</div>
    <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="form-label">Operator<input className="form-input" name={`${prefix}.operator`} placeholder={`Enter the ${mode} company or driver's name`} required /></label><label className="form-label">Service number<input className="form-input" name={`${prefix}.service`} placeholder="Enter the route or service number, if provided" /></label></div>
    <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="form-label">Origin<input className="form-input" name={`${prefix}.originName`} placeholder="Enter the departure station, stop, port, or address" required /></label><label className="form-label">Origin code<input className="form-input uppercase" name={`${prefix}.originCode`} placeholder="Enter a station or terminal code, if used" /></label>{international && <label className="form-label">Origin country<input className="form-input uppercase" maxLength={2} name={`${prefix}.originCountry`} placeholder="Enter the 2-letter country code" required /></label>}{international ? <label className="form-label">Origin time zone<TimeZoneAutocomplete name={`${prefix}.originTimezone`} requireSelection required /></label> : <input type="hidden" name={`${prefix}.originTimezone`} value={trip.primary_timezone} />}<label className="form-label">Departure (origin local)<input className="form-input" type="datetime-local" name={`${prefix}.departureAt`} min={`${trip.start_date}T00:00`} max={`${trip.end_date}T23:59`} value={departure} onChange={(event) => setDeparture(event.target.value)} required /></label>{international ? <label className="form-label">If clock repeats<OccurrenceSelect name={`${prefix}.departureOccurrence`} /></label> : <input type="hidden" name={`${prefix}.departureOccurrence`} value="earlier" />}</div>
    <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="form-label">Destination<input className="form-input" name={`${prefix}.destinationName`} placeholder="Enter the arrival station, stop, port, or address" required /></label><label className="form-label">Destination code<input className="form-input uppercase" name={`${prefix}.destinationCode`} placeholder="Enter a station or terminal code, if used" /></label>{international && <label className="form-label">Destination country<input className="form-input uppercase" maxLength={2} name={`${prefix}.destinationCountry`} placeholder="Enter the 2-letter country code" required /></label>}{international ? <label className="form-label">Destination time zone<TimeZoneAutocomplete name={`${prefix}.destinationTimezone`} requireSelection required /></label> : <input type="hidden" name={`${prefix}.destinationTimezone`} value={trip.primary_timezone} />}<label className="form-label">Arrival (destination local)<input className="form-input" type="datetime-local" name={`${prefix}.arrivalAt`} min={`${trip.start_date}T00:00`} max={`${trip.end_date}T23:59`} defaultValue={`${trip.start_date}T12:00`} required /></label>{international ? <label className="form-label">If clock repeats<OccurrenceSelect name={`${prefix}.arrivalOccurrence`} /></label> : <input type="hidden" name={`${prefix}.arrivalOccurrence`} value="earlier" />}</div>
    <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="form-label">Boarding lead (minutes)<input className="form-input" type="number" min="0" max="360" name={`${prefix}.boardingLead`} value={boardingLead} onChange={(event) => setBoardingLead(event.target.value)} placeholder="Enter minutes before departure" /></label><label className="form-label">Exact boarding time override<input className="form-input" type="datetime-local" name={`${prefix}.boardingAt`} /></label>{international ? <label className="form-label">If boarding clock repeats<OccurrenceSelect name={`${prefix}.boardingOccurrence`} /></label> : <input type="hidden" name={`${prefix}.boardingOccurrence`} value="earlier" />}<label className="form-label">Departure platform / bay<input className="form-input" name={`${prefix}.departurePlatform`} placeholder="Enter the platform, gate, or bay" /></label><label className="form-label">Arrival platform / bay<input className="form-input" name={`${prefix}.arrivalPlatform`} placeholder="Enter the arrival platform or bay" /></label><label className="form-label">Coach / cabin<input className="form-input" name={`${prefix}.coach`} placeholder="Enter the coach, cabin, or vehicle" /></label><label className="form-label">Seat<input className="form-input" name={`${prefix}.seat`} placeholder="Enter the assigned seat" /></label></div>
    {calculatedBoarding && <p className="mt-3 rounded-xl bg-brand-soft px-3 py-2 text-xs font-bold text-brand">Calculated boarding time: {calculatedBoarding.replace("T", " ")} in the origin time zone. An exact time overrides this.</p>}{international && <RepeatedClockHelp />}
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
  const itineraryQuery = useQuery({ queryKey: ["itinerary", trip.id], queryFn: () => listItinerary(trip.id) });
  const [type, setType] = useState<TimelineEventType | null>(null);
  const [legKeys, setLegKeys] = useState([crypto.randomUUID()]);
  const [journeyScope, setJourneyScope] = useState<JourneyScope>("domestic");
  const [journeyStructure, setJourneyStructure] = useState<"direct" | "connecting">("direct");
  const mutation = useMutation({
    mutationFn: async (form: FormData) => {
      if (!type) throw new Error("Choose an event type.");
      const title = text(form, "title");
      if (!title) throw new Error("Name this event.");
      const travelerIds = form.getAll("travelerIds").map(String);
      const cost = optionalCost(form, trip, travelers);
      const bookedViaUrl = optionalHttps(text(form, "bookedViaUrl"), "Booking website");
      if (type === "flight") {
        const scope = scopeValue(form);
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
          return { airlineName: text(form, `${prefix}.airline`), flightNumber: text(form, `${prefix}.number`).toUpperCase(), departureCode: text(form, `${prefix}.departureCode`).toUpperCase(), departureName: text(form, `${prefix}.departureName`), departureCountryCode: text(form, `${prefix}.departureCountry`).toUpperCase(), arrivalCode: text(form, `${prefix}.arrivalCode`).toUpperCase(), arrivalName: text(form, `${prefix}.arrivalName`), arrivalCountryCode: text(form, `${prefix}.arrivalCountry`).toUpperCase(), departureTimezone, arrivalTimezone, departureAt, arrivalAt, boardingAt, boardingLeadMinutes: optionalBoardingLead(form, `${prefix}.boardingLead`, `Flight leg ${index + 1}`), airlineSource: text(form, `${prefix}.airlineSource`), departureSource: text(form, `${prefix}.departureNameSource`), arrivalSource: text(form, `${prefix}.arrivalNameSource`) };
        });
        if (legs.some((leg) => !leg.airlineName || !leg.flightNumber || !leg.departureName || !leg.departureCode || !leg.arrivalName || !leg.arrivalCode)) throw new Error("Complete the airline, flight number, and both airport selections for every leg.");
        if (scope === "domestic" && legs.some((leg) => leg.departureCountryCode && leg.arrivalCountryCode && leg.departureCountryCode !== leg.arrivalCountryCode)) throw new Error("A domestic flight must depart and arrive in the same country. Choose International if it crosses a border.");
        assertConnectedRoute(legs, "flight");
        assertSequentialConnectionTimes(legs, "flight");
        const created = await addFlightBooking({ tripId: trip.id, title, referenceCode: text(form, "referenceCode"), journeyScope: scope, bookedViaName: text(form, "bookedViaName"), bookedViaUrl, contactName: text(form, "contactName"), contactPhone: text(form, "contactPhone"), travelerIds, legs, cost });
        await Promise.allSettled([
          ...legs.filter((leg) => leg.airlineSource === "other").map((leg) => suggestCatalogValue({ type: "airline", displayValue: leg.airlineName })),
          ...legs.flatMap((leg) => [leg.departureSource === "other" ? suggestCatalogValue({ type: "airport", displayValue: leg.departureName, proposedData: { code: leg.departureCode, country_code: leg.departureCountryCode, timezone: leg.departureTimezone } }) : null, leg.arrivalSource === "other" ? suggestCatalogValue({ type: "airport", displayValue: leg.arrivalName, proposedData: { code: leg.arrivalCode, country_code: leg.arrivalCountryCode, timezone: leg.arrivalTimezone } }) : null].filter((request): request is Promise<void> => Boolean(request))),
          ...(text(form, "bookedViaNameSource") === "other" ? [suggestCatalogValue({ type: "booking_vendor", displayValue: text(form, "bookedViaName"), proposedData: { website_url: bookedViaUrl } })] : [])
        ]);
        return created;
      }
      if (["train", "bus", "ferry", "cab"].includes(type)) {
        const mode = type as JourneyMode;
        const scope = scopeValue(form);
        const domesticCountryCode = text(form, "journeyCountry").toUpperCase();
        if (scope === "domestic" && !/^[A-Z]{2}$/.test(domesticCountryCode)) throw new Error("Enter the two-letter country code for this domestic journey.");
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
          return { operatorName: text(form, `${prefix}.operator`), serviceNumber: text(form, `${prefix}.service`), originCode: text(form, `${prefix}.originCode`).toUpperCase(), originName: text(form, `${prefix}.originName`), originCountryCode: scope === "domestic" ? domesticCountryCode : text(form, `${prefix}.originCountry`).toUpperCase(), originTimezone, destinationCode: text(form, `${prefix}.destinationCode`).toUpperCase(), destinationName: text(form, `${prefix}.destinationName`), destinationCountryCode: scope === "domestic" ? domesticCountryCode : text(form, `${prefix}.destinationCountry`).toUpperCase(), destinationTimezone, departureAt, arrivalAt, boardingAt, boardingLeadMinutes: optionalBoardingLead(form, `${prefix}.boardingLead`, `Journey leg ${index + 1}`), departurePlatform: text(form, `${prefix}.departurePlatform`), arrivalPlatform: text(form, `${prefix}.arrivalPlatform`), coachOrCabin: text(form, `${prefix}.coach`), seat: text(form, `${prefix}.seat`) };
        });
        if (legs.some((leg) => !leg.operatorName || !leg.originName || !leg.destinationName)) throw new Error("Complete the operator, origin, and destination for every leg.");
        assertConnectedRoute(legs, "journey");
        assertSequentialConnectionTimes(legs, "journey");
        const created = await addJourneyBooking({ tripId: trip.id, title, mode, referenceCode: text(form, "referenceCode"), journeyScope: scope, bookedViaName: text(form, "bookedViaName"), bookedViaUrl, contactName: text(form, "contactName"), contactPhone: text(form, "contactPhone"), travelerIds, legs, cost });
        await Promise.allSettled([
          ...legs.map((leg) => suggestCatalogValue({ type: "service_provider", displayValue: leg.operatorName })),
          ...(text(form, "bookedViaNameSource") === "other" ? [suggestCatalogValue({ type: "booking_vendor", displayValue: text(form, "bookedViaName"), proposedData: { website_url: bookedViaUrl } })] : [])
        ]);
        return created;
      }
      const timezone = text(form, "timezone");
      const stay = type === "hotel_check_in" ? hotelStayInstants({
        checkInLocal: text(form, "startsAt"),
        checkoutLocal: text(form, "checkoutAt"),
        timeZone: timezone,
        checkInOccurrence: (text(form, "occurrence") || "automatic") as "automatic" | "earlier" | "later",
        checkoutOccurrence: (text(form, "checkoutOccurrence") || "automatic") as "automatic" | "earlier" | "later"
      }) : null;
      const timing = stay ? { startsAt: stay.checkInAt, endsAt: stay.checkoutAt, timezone, timingMode: "exact" as const, scheduledDate: text(form, "startsAt").slice(0, 10), isAllDay: false } : readEventTiming(form, trip, itineraryQuery.data ?? []);
      const startsAt = timing.startsAt;
      const endsAt = timing.endsAt;
      const common = { tripId: trip.id, eventType: type, title, ...timing, location: text(form, "location"), mapUrl: optionalHttps(text(form, "mapUrl"), "Map link"), notes: text(form, "notes"), travelerIds };
      if (type === "hotel_check_in" || text(form, "hasBooking") === "yes") {
        if (type === "hotel_check_in" && !endsAt) throw new Error("Add the hotel checkout date and time.");
        const provider = type === "hotel_check_in" ? title : text(form, "provider");
        const created = await addBookedTimelineEvent({ ...common, type: type === "hotel_check_in" ? "hotel" : bookingTypeFor(type), provider, referenceCode: text(form, "referenceCode"), journeyScope: undefined, bookedViaName: text(form, "bookedViaName"), bookedViaUrl, contactName: text(form, "contactName"), contactPhone: text(form, "contactPhone"), cost });
        await Promise.allSettled([...(provider ? [suggestCatalogValue({ type: "service_provider", displayValue: provider })] : []), ...(text(form, "bookedViaNameSource") === "other" ? [suggestCatalogValue({ type: "booking_vendor", displayValue: text(form, "bookedViaName"), proposedData: { website_url: bookedViaUrl } })] : [])]);
        return created;
      }
      const item = await addItineraryItem(common);
      if (cost) await addTripCost({ tripId: trip.id, itineraryItemId: item.id, title: cost.title, category: costCategoryFor(type), amountMinor: cost.amountMinor, currencyCode: cost.currencyCode, paymentStatus: cost.paymentStatus, paidByTravelerId: cost.paidByTravelerId, participantTravelerIds: cost.participantTravelerIds });
      return item;
    },
    onSuccess: async () => {
      await Promise.all(["itinerary", "bookings", "flights", "journey-legs", "costs", "trip-airlines"].map((key) => queryClient.invalidateQueries({ queryKey: [key, trip.id] })));
      onClose();
    }
  });
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); mutation.mutate(new FormData(event.currentTarget)); };
  const chooseJourneyStructure = (next: "direct" | "connecting") => {
    setJourneyStructure(next);
    setLegKeys((keys) => next === "direct" ? keys.slice(0, 1) : keys.length >= 2 ? keys : [...keys, crypto.randomUUID()]);
  };
  const isJourney = isJourneyEventType(type ?? undefined);
  return <ModalSheet eyebrow={trip.title} title={type ? `Add ${choices.find((choice) => choice.type === type)?.label}` : "Add to timeline"} onClose={onClose}>
    {!type ? <div className="mt-6 grid gap-3 sm:grid-cols-2">{choices.map(({ type: choiceType, label, hint, icon: Icon }) => <button key={choiceType} type="button" onClick={() => { setType(choiceType); setLegKeys([crypto.randomUUID()]); setJourneyScope("domestic"); setJourneyStructure("direct"); }} className="group flex min-h-24 items-center gap-4 rounded-2xl border border-line bg-elevated p-4 text-left transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-soft"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand transition group-hover:scale-105"><Icon className="size-5" /></span><span><strong className="block font-display text-base font-black">{label}</strong><span className="mt-1 block text-xs leading-5 text-muted">{hint}</span></span></button>)}</div> : <form className="mt-5 space-y-5" onSubmit={submit}>
      <button type="button" onClick={() => setType(null)} className="inline-flex items-center gap-1 text-sm font-extrabold text-brand"><ChevronLeft className="size-4" /> Change event type</button>
      <label className="form-label">{type === "hotel_check_in" ? "Hotel / property name" : "Event title"}<input autoFocus className="form-input" name="title" placeholder={type === "hotel_check_in" ? "Enter the hotel or property name" : "Name this timeline event so it is easy to recognize"} required /></label>
      {isJourney && <><fieldset className="grid grid-cols-2 gap-3 rounded-2xl border border-line p-4"><legend className="px-1 text-sm font-extrabold">Journey type</legend><label className="flex items-center gap-2 rounded-xl bg-elevated p-3 text-sm font-bold"><input type="radio" name="journeyScope" value="domestic" checked={journeyScope === "domestic"} onChange={() => setJourneyScope("domestic")} /> Domestic</label><label className="flex items-center gap-2 rounded-xl bg-elevated p-3 text-sm font-bold"><input type="radio" name="journeyScope" value="international" checked={journeyScope === "international"} onChange={() => setJourneyScope("international")} /> International</label></fieldset>{type !== "flight" && journeyScope === "domestic" && <label className="form-label">Journey country<input className="form-input uppercase" name="journeyCountry" maxLength={2} placeholder="Enter the 2-letter country code used for this route" required /></label>}<fieldset className="grid grid-cols-2 gap-3 rounded-2xl border border-line p-4"><legend className="px-1 text-sm font-extrabold">Route</legend><label className="flex items-center gap-2 rounded-xl bg-elevated p-3 text-sm font-bold"><input type="radio" name="journeyStructure" value="direct" checked={journeyStructure === "direct"} onChange={() => chooseJourneyStructure("direct")} /> Direct</label><label className="flex items-center gap-2 rounded-xl bg-elevated p-3 text-sm font-bold"><input type="radio" name="journeyStructure" value="connecting" checked={journeyStructure === "connecting"} onChange={() => chooseJourneyStructure("connecting")} /> Connecting</label></fieldset></>}
      {type === "flight" && <><BookingFields always referenceRequired flightReference showProvider={false} showContactName={false} />{legKeys.map((key, index) => <FlightLegFields key={key} index={index} trip={trip} scope={journeyScope} removable={journeyStructure === "connecting" && legKeys.length > 2} onRemove={() => setLegKeys((keys) => keys.filter((item) => item !== key))} />)}{journeyStructure === "connecting" && <button type="button" className="secondary-button w-full" onClick={() => setLegKeys((keys) => [...keys, crypto.randomUUID()])}><Plus className="size-4" /> Add connecting flight</button>}</>}
      {type && ["train", "bus", "ferry", "cab"].includes(type) && <><BookingFields always showProvider={false} showContactName={type !== "train"} />{legKeys.map((key, index) => <JourneyLegFields key={key} index={index} mode={type as JourneyMode} trip={trip} scope={journeyScope} removable={journeyStructure === "connecting" && legKeys.length > 2} onRemove={() => setLegKeys((keys) => keys.filter((item) => item !== key))} />)}{journeyStructure === "connecting" && <button type="button" className="secondary-button w-full" onClick={() => setLegKeys((keys) => [...keys, crypto.randomUUID()])}><Plus className="size-4" /> Add connection</button>}</>}
      {type && !isJourney && <>
        {type === "hotel_check_in" ? <HotelStayFields trip={trip} /> : <TimingFields trip={trip} itinerary={itineraryQuery.data ?? []} />}
        <label className="form-label">Place / address<input className="form-input" name="location" placeholder="Enter the place name or full address" /></label><label className="form-label">Google Maps link<input className="form-input" type="url" name="mapUrl" placeholder="Paste a Google Maps place or directions link" /></label><label className="form-label">Notes<textarea className="form-input min-h-24" name="notes" placeholder="Add instructions you may need during the trip" /></label>
        <BookingFields always={type === "hotel_check_in"} showProvider={type !== "hotel_check_in"} />
      </>}
      <ParticipantSelector travelers={travelers} selectedTravelerIds={preferredTravelerId ? [preferredTravelerId] : undefined} explicitAll />
      <CostFields trip={trip} travelers={travelers} />
      {mutation.error && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm font-bold text-danger">{getErrorMessage(mutation.error)}</p>}
      <button className="primary-button w-full" disabled={mutation.isPending}>{mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <CalendarPlus className="size-4" />} Save to timeline</button>
    </form>}
  </ModalSheet>;
}
