import { useEffect, useState } from "react";
import { CurrencySelect } from "../../components/CurrencySelect";
import { VendorPicker } from "../metadata/VendorPicker";
import type { TimelineEventType, Trip } from "../trips/types";
import { defaultHotelCheckoutLocal } from "../trips/validation";
import type { ReservationState, Traveler } from "../workspace/types";

type BookableEventType = Exclude<TimelineEventType, "preparation">;
export type OtherTransportSubtype = "metro" | "rental" | "private_transfer" | "walk" | "other";

const bookingLabels: Partial<Record<BookableEventType, { provider: string; reference: string; phone: string }>> = {
  flight: { provider: "Airline", reference: "Booking reference / PNR", phone: "Airline support phone" },
  hotel_check_in: { provider: "Hotel / property", reference: "Booking reference", phone: "Property phone" },
  activity: { provider: "Activity provider or venue", reference: "Booking reference", phone: "Provider phone" },
  meal: { provider: "Restaurant or venue", reference: "Reservation name or reference", phone: "Restaurant phone" },
  train: { provider: "Train operator", reference: "PNR or booking reference", phone: "Support phone" },
  bus: { provider: "Bus operator", reference: "Ticket / order number", phone: "Operator or support phone" },
  ferry: { provider: "Ferry operator", reference: "Seller order / reference", phone: "Operator or support phone" },
  cab: { provider: "Cab company or app", reference: "Booking reference / Ride ID", phone: "Support phone" },
  transport: { provider: "Transport provider", reference: "Booking reference", phone: "Support phone" },
  custom: { provider: "Provider", reference: "Booking reference", phone: "Contact phone" }
};

export function EventTitleField({ type }: { type: TimelineEventType }) {
  const labels: Partial<Record<TimelineEventType, string>> = {
    flight: "Timeline title",
    hotel_check_in: "Hotel / property name",
    activity: "Activity name",
    meal: "Meal or restaurant name",
    train: "Timeline title",
    bus: "Timeline title",
    ferry: "Timeline title",
    cab: "Timeline title",
    preparation: "Task name",
    transport: "Timeline title",
    custom: "Timeline title"
  };
  return <label className="form-label">{labels[type] ?? "Timeline title"}<input autoFocus className="form-input" name="title" placeholder="Describe what should appear on the timeline" required /></label>;
}

type ReservationChoice = { value: ReservationState; label: string; hint: string };

function reservationChoices(type: TimelineEventType): ReservationChoice[] {
  if (type === "meal") return [
    { value: "planned", label: "No reservation", hint: "Keep the meal on the plan without a reservation." },
    { value: "booked", label: "Reserved", hint: "Add the restaurant confirmation and contact details." }
  ];
  if (type === "cab") return [
    { value: "planned", label: "Need a cab", hint: "Book or hail it when needed." },
    { value: "booked", label: "Booked in advance", hint: "A company or app has confirmed the ride." },
    { value: "walk_up", label: "Already took this ride", hint: "Record the actual route, cost, or receipt." }
  ];
  if (["train", "bus", "ferry"].includes(type)) return [
    { value: "planned", label: "Plan only", hint: "Route known; ticket not booked yet." },
    { value: "walk_up", label: "Buy when needed", hint: "Purchase locally or on arrival." },
    { value: "booked", label: "Ticket booked", hint: "Add the details shown on the ticket." }
  ];
  return [
    { value: "planned", label: "Plan only", hint: "Keep it on the timeline and add booking details later." },
    { value: "booked", label: type === "activity" ? "Booked" : "Reservation confirmed", hint: "Add the confirmation details now." }
  ];
}

export function ReservationStateFields({ type, value, onChange, transportSubtype }: { type: TimelineEventType; value: ReservationState; onChange: (value: ReservationState) => void; transportSubtype?: OtherTransportSubtype }) {
  const choices = reservationChoices(type);
  if (type === "flight" || type === "preparation" || (type === "transport" && transportSubtype === "walk")) return <input type="hidden" name="reservationState" value={type === "flight" ? "booked" : "planned"} />;
  return <fieldset className="rounded-2xl border border-line p-4"><legend className="px-1 text-sm font-extrabold">Booking status</legend><div className={`mt-1 grid gap-3 ${choices.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>{choices.map((choice) => <label key={choice.value} className={`rounded-xl border p-3 text-sm transition ${value === choice.value ? "border-brand bg-brand-soft" : "border-line bg-elevated"}`}><span className="flex items-center gap-2 font-extrabold"><input type="radio" name="reservationState" value={choice.value} checked={value === choice.value} onChange={() => onChange(choice.value)} />{choice.label}</span><span className="mt-1 block text-xs leading-5 text-muted">{choice.hint}</span></label>)}</div></fieldset>;
}

export function BookingFields({ type, referenceRequired = false, hideProvider = false }: { type: BookableEventType; referenceRequired?: boolean; hideProvider?: boolean }) {
  const labels = bookingLabels[type] ?? bookingLabels.custom!;
  const [website, setWebsite] = useState("");
  const showContactName = !["flight", "train", "bus", "ferry"].includes(type);
  return <fieldset className="rounded-2xl border border-line p-4"><legend className="px-1 text-sm font-extrabold">Booking details</legend><div className="mt-2 grid gap-4 sm:grid-cols-2">
    {!hideProvider && <label className="form-label">{labels.provider}<input className="form-input" name="provider" placeholder={`Enter the ${labels.provider.toLocaleLowerCase()} shown on the confirmation`} required={type === "hotel_check_in"} /></label>}
    <label className="form-label">{labels.reference}{referenceRequired ? " (required)" : " (optional)"}<input className="form-input uppercase" name="referenceCode" maxLength={160} placeholder="Enter the reference shown on the confirmation" required={referenceRequired} /></label>
    <label className="form-label">Booked via<VendorPicker onWebsite={setWebsite} /></label>
    <label className="form-label">Manage booking link (optional)<input className="form-input" type="url" name="bookedViaUrl" value={website} onChange={(event) => setWebsite(event.target.value)} placeholder="Paste the page used to view or manage this booking" /></label>
    {showContactName && <label className="form-label">Contact name (optional)<input className="form-input" name="contactName" placeholder="Enter the person to contact, if one was provided" /></label>}
    <label className="form-label">{labels.phone} (optional)<input className="form-input" type="tel" name="contactPhone" maxLength={40} placeholder="Include the country code for Call and WhatsApp" /></label>
  </div></fieldset>;
}

export function HotelStayFields({ trip }: { trip: Trip }) {
  const initialCheckIn = `${trip.start_date}T15:00`;
  const [checkInDate, setCheckInDate] = useState(trip.start_date);
  const [checkInTime, setCheckInTime] = useState("");
  const [checkoutDate, setCheckoutDate] = useState(defaultHotelCheckoutLocal(initialCheckIn).slice(0, 10));
  const [checkoutTime, setCheckoutTime] = useState("");
  return <fieldset className="rounded-2xl border border-line p-4"><legend className="px-1 text-sm font-extrabold">Stay</legend><div className="mt-2 grid gap-4 sm:grid-cols-2">
    <label className="form-label">Check-in date<input className="form-input" name="checkInDate" type="date" min={trip.start_date} max={trip.end_date} value={checkInDate} onChange={(event) => { const next = event.target.value; setCheckInDate(next); if (checkoutDate < next) setCheckoutDate(next); }} required /></label>
    <label className="form-label">Printed check-in time (optional)<input className="form-input" name="checkInTime" type="time" value={checkInTime} onChange={(event) => setCheckInTime(event.target.value)} /></label>
    <label className="form-label">Checkout date<input className="form-input" name="checkoutDate" type="date" min={checkInDate || trip.start_date} max={trip.end_date} value={checkoutDate} onChange={(event) => setCheckoutDate(event.target.value)} required /></label>
    <label className="form-label">Printed checkout time (optional)<input className="form-input" name="checkoutTime" type="time" value={checkoutTime} onChange={(event) => setCheckoutTime(event.target.value)} /></label>
  </div><p className="mt-3 text-xs leading-5 text-muted">If the property only gives dates, Trip Vault uses neutral local milestone times for ordering and does not present them as printed times.</p>
  <input type="hidden" name="startsAt" value={`${checkInDate}T${checkInTime || "12:00"}`} /><input type="hidden" name="checkoutAt" value={`${checkoutDate}T${checkoutTime || "12:00"}`} /><input type="hidden" name="checkInHasTime" value={checkInTime ? "yes" : "no"} /><input type="hidden" name="checkoutHasTime" value={checkoutTime ? "yes" : "no"} /><input type="hidden" name="timezone" value={trip.primary_timezone} /><input type="hidden" name="occurrence" value="earlier" /><input type="hidden" name="checkoutOccurrence" value="earlier" /></fieldset>;
}

function MealDetailsFields({ defaultPartySize }: { defaultPartySize?: number }) {
  const [partySize, setPartySize] = useState(defaultPartySize ? String(defaultPartySize) : "");
  const [manuallyEdited, setManuallyEdited] = useState(false);
  useEffect(() => {
    if (!manuallyEdited) setPartySize(defaultPartySize ? String(defaultPartySize) : "");
  }, [defaultPartySize, manuallyEdited]);
  return <><label className="form-label">Party size (optional)<input className="form-input" name="partySize" type="number" min="1" inputMode="numeric" value={partySize} onChange={(event) => { setManuallyEdited(true); setPartySize(event.target.value); }} placeholder="Enter the number of diners" /></label><label className="form-label">Dietary or arrival notes (optional)<textarea className="form-input min-h-20" name="dietaryNotes" placeholder="Add dietary needs or instructions for arrival" /></label></>;
}

export function PlaceAndNotesFields({ type, mealPartySize }: { type: TimelineEventType; mealPartySize?: number }) {
  if (type === "preparation") return <details className="rounded-2xl border border-line p-4"><summary className="cursor-pointer text-sm font-extrabold">More details</summary><div className="mt-4 grid gap-4">
    <label className="form-label">Place (optional)<input className="form-input" name="location" placeholder="Enter where this task needs to happen" /></label>
    <label className="form-label">Navigation (Google Maps link, optional)<input className="form-input" type="url" name="mapUrl" placeholder="Paste the place or directions link" /></label>
    <label className="form-label">Provider or organization (optional)<input className="form-input" name="provider" placeholder="Enter who provides or manages this task" /></label>
    <label className="form-label">External booking or manage link (optional)<input className="form-input" type="url" name="bookedViaUrl" placeholder="Paste the page used to book or manage this task" /></label>
    <label className="form-label">Notes (optional)<textarea className="form-input min-h-24" name="notes" placeholder="Add instructions you may need before the trip" /></label>
  </div></details>;
  const placeLabel = type === "hotel_check_in" ? "Hotel address" : type === "meal" ? "Restaurant or venue" : type === "activity" ? "Venue or place" : "Place or address";
  return <details className="rounded-2xl border border-line p-4"><summary className="cursor-pointer text-sm font-extrabold">More details</summary><div className="mt-4 grid gap-4">
    <label className="form-label">{placeLabel} (optional)<input className="form-input" name="location" placeholder="Enter the place name or full address" /></label>
    <label className="form-label">Google Maps link (optional)<input className="form-input" type="url" name="mapUrl" placeholder="Paste the Google Maps place or directions link" /></label>
    <label className="form-label">Notes (optional)<textarea className="form-input min-h-24" name="notes" placeholder="Add instructions you may need during the trip" /></label>
    {type === "hotel_check_in" && <><label className="form-label">Room type (optional)<input className="form-input" name="roomType" placeholder="Enter the room type shown on the confirmation" /></label><label className="form-label">Number of rooms (optional)<input className="form-input" name="roomCount" type="number" min="1" inputMode="numeric" placeholder="Enter how many rooms are reserved" /></label><label className="form-label">Lead guest (optional)<input className="form-input" name="leadGuest" placeholder="Enter the lead guest shown on the booking" /></label></>}
    {type === "activity" && <label className="form-label">Entry or meeting instructions (optional)<textarea className="form-input min-h-20" name="meetingInstructions" placeholder="Enter the meeting point, entry rule, or arrival instruction" /></label>}
    {type === "meal" && <MealDetailsFields defaultPartySize={mealPartySize} />}
  </div></details>;
}

export function OtherTransportFields({ subtype, onSubtypeChange, trip }: { subtype: OtherTransportSubtype; onSubtypeChange: (value: OtherTransportSubtype) => void; trip: Trip }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const rental = subtype === "rental";
  return <>
    <fieldset className="rounded-2xl border border-line p-4"><legend className="px-1 text-sm font-extrabold">Kind of transport</legend><label className="form-label mt-2">Transport type<select className="form-input" name="transportSubtype" value={subtype} onChange={(event) => onSubtypeChange(event.target.value as OtherTransportSubtype)}><option value="metro">Metro / public transit</option><option value="rental">Rental vehicle</option><option value="private_transfer">Private transfer</option><option value="walk">Walk</option><option value="other">Other transport</option></select></label></fieldset>
    <fieldset className="rounded-2xl border border-line p-4"><legend className="px-1 text-sm font-extrabold">{rental ? "Rental route" : "Route"}</legend><div className="mt-2 grid gap-4 sm:grid-cols-2"><label className="form-label">{rental ? "Pickup place" : "From"}<input className="form-input" name="transport.from" value={from} onChange={(event) => setFrom(event.target.value)} placeholder={rental ? "Enter where the vehicle will be collected" : "Enter where this journey starts"} required /></label><label className="form-label">{rental ? "Return place" : "To"}<input className="form-input" name="transport.to" value={to} onChange={(event) => setTo(event.target.value)} placeholder={rental ? "Enter where the vehicle will be returned" : "Enter where this journey ends"} required /></label>{rental && <label className="form-label sm:col-span-2">Return date and time (optional)<input className="form-input" type="datetime-local" name="transport.returnAt" min={`${trip.start_date}T00:00`} max={`${trip.end_date}T23:59`} /></label>}</div></fieldset>
    <input type="hidden" name="location" value={[from, to].filter(Boolean).join(" → ")} />
    <details className="rounded-2xl border border-line p-4"><summary className="cursor-pointer text-sm font-extrabold">More details</summary><div className="mt-4 grid gap-4"><label className="form-label">Google Maps link (optional)<input className="form-input" type="url" name="mapUrl" placeholder="Paste the route, pickup, or destination link" /></label><label className="form-label">Notes (optional)<textarea className="form-input min-h-24" name="notes" placeholder="Add tickets, pickup, return, or route instructions you may need" /></label></div></details>
  </>;
}

export function CostFields({ trip, travelers }: { trip: Trip; travelers: Traveler[] }) {
  const [mode, setMode] = useState<"missing" | "free" | "known">("missing");
  const [everyone, setEveryone] = useState(true);
  return <details className="rounded-2xl border border-line p-4"><summary className="cursor-pointer text-sm font-extrabold">Cost</summary><div className="mt-4 space-y-4">
    <div className="grid gap-2 sm:grid-cols-3">{([['missing','Add later'],['free','Free'],['known','Add amount']] as const).map(([value,label]) => <label key={value} className={`flex items-center gap-2 rounded-xl border p-3 text-sm font-bold ${mode === value ? "border-brand bg-brand-soft" : "border-line"}`}><input type="radio" checked={mode === value} onChange={() => setMode(value)} />{label}</label>)}</div>
    <input type="hidden" name="includeCost" value={mode === "known" || mode === "free" ? "yes" : "no"} />
    {(mode === "known" || mode === "free") && <div className="grid gap-4 sm:grid-cols-2"><label className="form-label">Amount{mode === "free" ? <input className="form-input" name="costAmount" inputMode="decimal" value="0" readOnly /> : <input className="form-input" name="costAmount" inputMode="decimal" placeholder="Enter the total amount for this event" required />}</label><label className="form-label">Currency<CurrencySelect name="costCurrency" defaultValue={trip.base_currency} required /></label><label className="form-label">Cost label (optional)<input className="form-input" name="costTitle" placeholder="Describe what this amount covers" /></label><label className="form-label">Payment<select className="form-input" name="paymentStatus"><option value="planned">Planned / unpaid</option><option value="paid">Paid</option></select></label>{travelers.length > 0 && <label className="form-label">Paid by<select className="form-input" name="paidByTravelerId"><option value="">Not recorded yet</option>{travelers.map((traveler) => <option key={traveler.id} value={traveler.id}>{traveler.display_name}</option>)}</select></label>}{travelers.length > 0 && <div className="sm:col-span-2"><div className="flex flex-wrap gap-4 text-sm"><label className="flex items-center gap-2"><input type="radio" checked={everyone} onChange={() => setEveryone(true)} /> Split among everyone</label><label className="flex items-center gap-2"><input type="radio" checked={!everyone} onChange={() => setEveryone(false)} /> Choose people</label></div>{everyone ? travelers.map((traveler) => <input key={traveler.id} type="hidden" name="costTravelerIds" value={traveler.id} />) : <div className="mt-3 grid gap-2 sm:grid-cols-2">{travelers.map((traveler) => <label key={traveler.id} className="flex items-center gap-2 rounded-xl bg-elevated p-3 text-sm font-bold"><input type="checkbox" name="costTravelerIds" value={traveler.id} />{traveler.display_name}</label>)}</div>}</div>}</div>}
  </div></details>;
}
