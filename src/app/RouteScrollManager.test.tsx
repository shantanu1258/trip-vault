import { fireEvent, render } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { tripEntryNavigationState, tripIntentNavigationState } from "../features/trips/navigation";
import { RouteScrollManager } from "./RouteScrollManager";

function NavigationHarness() {
  const navigate = useNavigate();
  return (
    <>
      <RouteScrollManager />
      <button onClick={() => navigate("/trips/example?view=details")}>Trip</button>
      <button onClick={() => navigate("/trips/example?view=timeline")}>Trip view</button>
      <button
        onClick={() =>
          navigate("/trips/example", {
            state: tripIntentNavigationState(null, "example", "restore", { view: "timeline" })
          })
        }
      >
        Return to trip
      </button>
      <button
        onClick={() =>
          navigate("/trips/example?view=details", {
            state: tripEntryNavigationState(null, "example", "details")
          })
        }
      >
        Restore trip tab
      </button>
      <button onClick={() => navigate("/profile")}>Profile</button>
      <button onClick={() => navigate("/trips/example?view=details#reservations", { state: null })}>
        Reservations section
      </button>
      <button onClick={() => navigate("/trips/example?view=details#documents", { state: null })}>
        Documents section
      </button>
    </>
  );
}

describe("route scroll isolation", () => {
  it("starts real pages at the top without resetting query-only TripPage views", () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    const view = render(
      <MemoryRouter
        initialEntries={["/home"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <NavigationHarness />
      </MemoryRouter>
    );

    expect(scrollTo).toHaveBeenCalledTimes(1);
    fireEvent.click(view.getByRole("button", { name: "Trip" }));
    expect(scrollTo).toHaveBeenCalledTimes(2);
    fireEvent.click(view.getByRole("button", { name: "Trip view" }));
    expect(scrollTo).toHaveBeenCalledTimes(2);
    fireEvent.click(view.getByRole("button", { name: "Profile" }));
    expect(scrollTo).toHaveBeenCalledTimes(3);
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, left: 0, behavior: "auto" });
  });

  it("leaves child returns and saved trip-tab entries for TripPage to restore", () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    const view = render(
      <MemoryRouter
        initialEntries={["/trips/example/bookings/booking-1"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <NavigationHarness />
      </MemoryRouter>
    );

    expect(scrollTo).toHaveBeenCalledTimes(1);
    fireEvent.click(view.getByRole("button", { name: "Return to trip" }));
    expect(scrollTo).toHaveBeenCalledTimes(1);
    fireEvent.click(view.getByRole("button", { name: "Restore trip tab" }));
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it("restores the browser scroll-restoration setting when it unmounts", () => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    Object.defineProperty(window.history, "scrollRestoration", {
      value: "auto",
      writable: true,
      configurable: true
    });
    const view = render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <RouteScrollManager />
      </MemoryRouter>
    );

    expect(window.history.scrollRestoration).toBe("manual");
    view.unmount();
    expect(window.history.scrollRestoration).toBe("auto");
  });
  it("does not reset to the top when the first section jump clears trip history state", () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    const view = render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/trips/example",
            search: "?view=details",
            state: tripEntryNavigationState(null, "example", "details")
          }
        ]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <NavigationHarness />
      </MemoryRouter>
    );
    expect(scrollTo).not.toHaveBeenCalled();
    fireEvent.click(view.getByRole("button", { name: "Reservations section" }));
    expect(scrollTo).not.toHaveBeenCalled();
    fireEvent.click(view.getByRole("button", { name: "Documents section" }));
    expect(scrollTo).not.toHaveBeenCalled();
    fireEvent.click(view.getByRole("button", { name: "Profile" }));
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, left: 0, behavior: "auto" });
  });
});
