import type { CSSProperties } from "react";
import type { FlightLeg, TripAirline } from "./types";

export type AirlineAccentStyle = CSSProperties & {
  "--airline-accent"?: string;
};

export function airlineForFlight(leg: FlightLeg, airlines: TripAirline[]) {
  return (
    airlines.find((airline) => airline.id === leg.marketing_airline_id) ??
    airlines.find(
      (airline) => airline.name.toLocaleLowerCase() === leg.airline_name.toLocaleLowerCase()
    )
  );
}

export function airlineAccentStyle(color?: string | null): AirlineAccentStyle | undefined {
  return color ? { "--airline-accent": color } : undefined;
}
