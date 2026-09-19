import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { TripBackLink } from "./TripBackLink";
import { tripChildNavigationState, tripReturnNavigation } from "../features/trips/navigation";

function ReturnPage() {
  const location = useLocation();
  return (
    <>
      <output data-testid="destination">
        {location.pathname}
        {location.search}
      </output>
      <TripBackLink {...tripReturnNavigation(location.state, "trip-1")} />
    </>
  );
}

describe("TripBackLink", () => {
  it("returns to the explicit origin instead of an unrelated browser-history entry", async () => {
    render(
      <MemoryRouter
        initialEntries={[
          "/unrelated-page",
          {
            pathname: "/trips/trip-1/flights/flight-2",
            state: tripChildNavigationState(
              null,
              "trip-1",
              "timeline",
              "/trips/trip-1?event=event-1"
            )
          }
        ]}
      >
        <ReturnPage />
      </MemoryRouter>
    );
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByTestId("destination")).toHaveTextContent("/trips/trip-1?event=event-1");
  });

  it("falls back to the trip for a directly opened page", async () => {
    render(
      <MemoryRouter initialEntries={["/trips/trip-1/flights/flight-1"]}>
        <ReturnPage />
      </MemoryRouter>
    );
    await userEvent.click(screen.getByRole("link", { name: "Back to trip" }));
    expect(screen.getByTestId("destination")).toHaveTextContent(/^\/trips\/trip-1$/);
  });
});
