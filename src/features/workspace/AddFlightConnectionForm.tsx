import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, PlaneTakeoff } from "lucide-react";
import { useState, type FormEvent } from "react";
import { ModalSheet } from "../../components/ModalSheet";
import { AirlinePicker } from "../metadata/AirlinePicker";
import { AirportPicker } from "../metadata/AirportPicker";
import { getErrorMessage } from "../trips/presentation";
import type { Trip } from "../trips/types";
import { isoToLocalDateTime, localDateTimeToIso } from "../trips/validation";
import { addFlightConnection, suggestCatalogValue } from "./api";
import type { Booking, FlightLeg } from "./types";

const value = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

const normalizedEndpoint = (code: string | null | undefined, name: string) =>
  (code?.trim() || name.trim()).toLocaleUpperCase().replace(/[^A-Z0-9]/g, "");

export function validateNextFlightConnection(lastLeg: FlightLeg, input: {
  departureCode: string;
  departureName: string;
  departureAt: string;
  arrivalAt: string;
  arrivalCountryCode: string;
  journeyScope: "domestic" | "international";
}) {
  const previousDestination = normalizedEndpoint(lastLeg.arrival_airport_code, lastLeg.arrival_airport_name);
  const nextOrigin = normalizedEndpoint(input.departureCode, input.departureName);
  if (!previousDestination || previousDestination !== nextOrigin) {
    throw new Error("A connection must depart from the airport where the previous flight arrives.");
  }
  if (input.departureAt <= lastLeg.scheduled_arrival_at) {
    throw new Error("This connection must depart after the previous flight arrives.");
  }
  if (input.arrivalAt <= input.departureAt) {
    throw new Error("Arrival must be after departure after both local times are converted.");
  }
  const previousCountry = lastLeg.arrival_country_code?.trim().toLocaleUpperCase();
  if (input.journeyScope === "domestic" && previousCountry && input.arrivalCountryCode.toLocaleUpperCase() !== previousCountry) {
    throw new Error(`A domestic connection must stay within ${previousCountry}. Choose International for another country.`);
  }
}

export function AddFlightConnectionForm({ trip, booking, lastLeg, onClose }: { trip: Trip; booking: Booking; lastLeg: FlightLeg; onClose: () => void }) {
  const queryClient = useQueryClient(); const [message, setMessage] = useState("");
  const journeyScope = booking.journey_scope ?? lastLeg.journey_scope ?? "international";
  const domesticCountry = journeyScope === "domestic" ? lastLeg.arrival_country_code?.trim().toLocaleUpperCase() : undefined;
  const mutation = useMutation({
    mutationFn: addFlightConnection,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["flight-legs", trip.id, booking.id] }),
        queryClient.invalidateQueries({ queryKey: ["flights", trip.id] }),
        queryClient.invalidateQueries({ queryKey: ["booking", booking.id] }),
        queryClient.invalidateQueries({ queryKey: ["bookings", trip.id] }),
        queryClient.invalidateQueries({ queryKey: ["itinerary", trip.id] })
      ]);
      onClose();
    }
  });

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const departureTimezone = value(form, "departureTimezone"); const arrivalTimezone = value(form, "arrivalTimezone");
      const departureAt = localDateTimeToIso(value(form, "departureAt"), departureTimezone);
      const arrivalAt = localDateTimeToIso(value(form, "arrivalAt"), arrivalTimezone);
      const boardingText = value(form, "boardingLeadMinutes"); const boardingLeadMinutes = boardingText ? Number(boardingText) : undefined;
      if (boardingLeadMinutes !== undefined && (!Number.isInteger(boardingLeadMinutes) || boardingLeadMinutes < 0 || boardingLeadMinutes > 360)) throw new Error("Boarding lead must be a whole number from 0 to 360 minutes.");
      const airlineName = value(form, "airlineName"); const departureName = value(form, "departureName"); const arrivalName = value(form, "arrivalName");
      if (!airlineName || !departureName || !arrivalName) throw new Error("Choose the airline, departure airport, and arrival airport.");
      validateNextFlightConnection(lastLeg, {
        departureCode: value(form, "departureCode"), departureName, departureAt, arrivalAt,
        arrivalCountryCode: value(form, "arrivalCountry"), journeyScope
      });
      await Promise.allSettled([
        value(form, "airlineNameSource") === "other" ? suggestCatalogValue({ type: "airline", displayValue: airlineName }) : Promise.resolve(),
        value(form, "departureNameSource") === "other" ? suggestCatalogValue({ type: "airport", displayValue: departureName, proposedData: { code: value(form, "departureCode"), country_code: value(form, "departureCountry"), timezone: departureTimezone } }) : Promise.resolve(),
        value(form, "arrivalNameSource") === "other" ? suggestCatalogValue({ type: "airport", displayValue: arrivalName, proposedData: { code: value(form, "arrivalCode"), country_code: value(form, "arrivalCountry"), timezone: arrivalTimezone } }) : Promise.resolve()
      ]);
      mutation.mutate({ tripId: trip.id, bookingId: booking.id, journeyScope, airlineName, flightNumber: value(form, "flightNumber").toUpperCase(), departureCode: value(form, "departureCode").toUpperCase(), departureName, departureCountryCode: value(form, "departureCountry").toUpperCase(), arrivalCode: value(form, "arrivalCode").toUpperCase(), arrivalName, arrivalCountryCode: value(form, "arrivalCountry").toUpperCase(), departureAt, arrivalAt, departureTimezone, arrivalTimezone, boardingLeadMinutes });
    } catch (error) { setMessage(getErrorMessage(error)); }
  };

  return <ModalSheet eyebrow={booking.title} title="Add a connecting flight" onClose={onClose}>
    <p className="mt-3 rounded-2xl bg-brand-soft p-4 text-sm text-muted">The current journey ends at <strong className="text-ink">{lastLeg.arrival_airport_code || lastLeg.arrival_airport_name}</strong> on {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: lastLeg.arrival_timezone }).format(new Date(lastLeg.scheduled_arrival_at))}. The new leg will become the next connection.</p>
    <form className="mt-5 space-y-5" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2"><label className="form-label">Airline<AirlinePicker /></label><label className="form-label">Flight number<input className="form-input uppercase" name="flightNumber" placeholder="Enter the number printed on the ticket" required /></label></div>
      <div className="rounded-2xl border border-line bg-elevated p-4"><p className="eyebrow">From airport</p><p className="mt-2 font-display text-lg font-black">{lastLeg.arrival_airport_code || lastLeg.arrival_airport_name}</p><p className="mt-1 text-sm text-muted">Fixed to the previous flight's arrival so this journey stays connected.</p></div>
      <input type="hidden" name="departureName" value={lastLeg.arrival_airport_name} />
      <input type="hidden" name="departureCode" value={lastLeg.arrival_airport_code ?? ""} />
      <input type="hidden" name="departureCountry" value={lastLeg.arrival_country_code ?? ""} />
      <input type="hidden" name="departureTimezone" value={lastLeg.arrival_timezone} />
      <input type="hidden" name="departureNameSource" value="connection" />
      <label className="form-label">Departure (airport local time)<input className="form-input" name="departureAt" type="datetime-local" defaultValue={isoToLocalDateTime(new Date(new Date(lastLeg.scheduled_arrival_at).getTime() + 2 * 60 * 60 * 1_000).toISOString(), lastLeg.arrival_timezone)} required /></label>
      <AirportPicker name="arrivalName" codeName="arrivalCode" timezoneName="arrivalTimezone" countryName="arrivalCountry" label="To airport" defaultTimezone={journeyScope === "domestic" ? lastLeg.arrival_timezone : trip.primary_timezone} countryFilter={domesticCountry} showManualTimezone={journeyScope !== "domestic"} />
      <label className="form-label">Arrival (airport local time)<input className="form-input" name="arrivalAt" type="datetime-local" required /></label>
      <label className="form-label">Boarding lead (minutes, optional)<input className="form-input" name="boardingLeadMinutes" type="number" min="0" max="360" placeholder="Minutes before scheduled departure" /></label>
      {(message || mutation.error) && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm font-bold text-danger">{message || getErrorMessage(mutation.error)}</p>}
      <button className="primary-button w-full" disabled={mutation.isPending || !navigator.onLine}>{mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <PlaneTakeoff className="size-4" />} Add connection</button>
    </form>
  </ModalSheet>;
}
