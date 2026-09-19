import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TripChildLink } from "./TripChildLink";
import { TripBackLink } from "./TripBackLink";
import {
  readTripScrollRestore,
  tripChildNavigationState,
  tripReturnNavigation
} from "../features/trips/navigation";

let returnedState: unknown;
function Harness() {
  const location = useLocation();
  returnedState = location.state;
  return (
    <>
      <output>
        {location.pathname}
        {location.search}
      </output>
      {location.pathname.includes("/bookings/") ? (
        <TripBackLink {...tripReturnNavigation(location.state, "trip-1")} />
      ) : (
        <TripChildLink
          id="reservation-booking-1"
          tripId="trip-1"
          to="/trips/trip-1/bookings/booking-1"
          state={tripChildNavigationState(
            location.state,
            "trip-1",
            "details",
            `${location.pathname}${location.search}`
          )}
        >
          Open booking
        </TripChildLink>
      )}
    </>
  );
}

describe("reservation return position", () => {
  afterEach(() => vi.restoreAllMocks());
  it.each([
    "/trips/trip-1?view=details",
    "/trips/trip-1/reservations?category=hotel&search=stay&traveler=person-1"
  ])("remembers the clicked card and exact origin %s", (path) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <Harness />
      </MemoryRouter>
    );
    vi.spyOn(window, "scrollY", "get").mockReturnValue(900);
    vi.spyOn(
      screen.getByRole("link", { name: "Open booking" }),
      "getBoundingClientRect"
    ).mockReturnValue({ top: 180 } as DOMRect);
    fireEvent.click(screen.getByRole("link", { name: "Open booking" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText(path)).toBeInTheDocument();
    expect(readTripScrollRestore(returnedState, "trip-1", path)).toEqual({
      y: 900,
      anchorId: "reservation-booking-1",
      anchorOffset: 180
    });
  });
});
