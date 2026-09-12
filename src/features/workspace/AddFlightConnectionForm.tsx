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

export function AddFlightConnectionForm({ trip, booking, lastLeg, onClose }: { trip: Trip; booking: Booking; lastLeg: FlightLeg; onClose: () => void }) {
  const queryClient = useQueryClient(); const [message, setMessage] = useState("");
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
      if (departureAt < lastLeg.scheduled_arrival_at) throw new Error("This connection must depart after the previous flight arrives.");
      if (arrivalAt <= departureAt) throw new Error("Arrival must be after departure after both local times are converted.");
      const boardingText = value(form, "boardingLeadMinutes"); const boardingLeadMinutes = boardingText ? Number(boardingText) : undefined;
      if (boardingLeadMinutes !== undefined && (!Number.isInteger(boardingLeadMinutes) || boardingLeadMinutes < 0 || boardingLeadMinutes > 360)) throw new Error("Boarding lead must be a whole number from 0 to 360 minutes.");
      const airlineName = value(form, "airlineName"); const departureName = value(form, "departureName"); const arrivalName = value(form, "arrivalName");
      if (!airlineName || !departureName || !arrivalName) throw new Error("Choose the airline, departure airport, and arrival airport.");
      await Promise.allSettled([
        value(form, "airlineNameSource") === "other" ? suggestCatalogValue({ type: "airline", displayValue: airlineName }) : Promise.resolve(),
        value(form, "departureNameSource") === "other" ? suggestCatalogValue({ type: "airport", displayValue: departureName, proposedData: { code: value(form, "departureCode"), country_code: value(form, "departureCountry"), timezone: departureTimezone } }) : Promise.resolve(),
        value(form, "arrivalNameSource") === "other" ? suggestCatalogValue({ type: "airport", displayValue: arrivalName, proposedData: { code: value(form, "arrivalCode"), country_code: value(form, "arrivalCountry"), timezone: arrivalTimezone } }) : Promise.resolve()
      ]);
      mutation.mutate({ tripId: trip.id, bookingId: booking.id, journeyScope: booking.journey_scope ?? lastLeg.journey_scope ?? "international", airlineName, flightNumber: value(form, "flightNumber").toUpperCase(), departureCode: value(form, "departureCode").toUpperCase(), departureName, departureCountryCode: value(form, "departureCountry").toUpperCase(), arrivalCode: value(form, "arrivalCode").toUpperCase(), arrivalName, arrivalCountryCode: value(form, "arrivalCountry").toUpperCase(), departureAt, arrivalAt, departureTimezone, arrivalTimezone, boardingLeadMinutes });
    } catch (error) { setMessage(getErrorMessage(error)); }
  };

  return <ModalSheet eyebrow={booking.title} title="Add a connecting flight" onClose={onClose}>
    <p className="mt-3 rounded-2xl bg-brand-soft p-4 text-sm text-muted">The current journey ends at <strong className="text-ink">{lastLeg.arrival_airport_code || lastLeg.arrival_airport_name}</strong> on {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: lastLeg.arrival_timezone }).format(new Date(lastLeg.scheduled_arrival_at))}. The new leg will become the next connection.</p>
    <form className="mt-5 space-y-5" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2"><label className="form-label">Airline<AirlinePicker /></label><label className="form-label">Flight number<input className="form-input uppercase" name="flightNumber" placeholder="Enter the number printed on the ticket" required /></label></div>
      <AirportPicker name="departureName" codeName="departureCode" timezoneName="departureTimezone" countryName="departureCountry" label="From airport" defaultTimezone={lastLeg.arrival_timezone} />
      <label className="form-label">Departure (airport local time)<input className="form-input" name="departureAt" type="datetime-local" defaultValue={isoToLocalDateTime(lastLeg.scheduled_arrival_at, lastLeg.arrival_timezone)} required /></label>
      <AirportPicker name="arrivalName" codeName="arrivalCode" timezoneName="arrivalTimezone" countryName="arrivalCountry" label="To airport" defaultTimezone={trip.primary_timezone} />
      <label className="form-label">Arrival (airport local time)<input className="form-input" name="arrivalAt" type="datetime-local" required /></label>
      <label className="form-label">Boarding lead (minutes, optional)<input className="form-input" name="boardingLeadMinutes" type="number" min="0" max="360" placeholder="Minutes before scheduled departure" /></label>
      {(message || mutation.error) && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm font-bold text-danger">{message || getErrorMessage(mutation.error)}</p>}
      <button className="primary-button w-full" disabled={mutation.isPending || !navigator.onLine}>{mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <PlaneTakeoff className="size-4" />} Add connection</button>
    </form>
  </ModalSheet>;
}
