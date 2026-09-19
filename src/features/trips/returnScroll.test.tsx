import { act, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { tripChildNavigationState, tripChildScrollState, tripReturnNavigation } from "./navigation";
import { restoreTripReturnScroll, useTripReturnScroll } from "./returnScroll";

const path = "/trips/trip-1/reservations?category=hotel";
const state = tripReturnNavigation(
  tripChildScrollState(tripChildNavigationState(null, "trip-1", "details", path), "trip-1", {
    y: 800,
    anchorId: "reservation-1",
    anchorOffset: 120
  }),
  "trip-1"
).state;
function Page({ ready }: { ready: boolean }) {
  useTripReturnScroll("trip-1", ready);
  return <div id="reservation-1">Reservation</div>;
}

describe("return scroll restoration", () => {
  afterEach(() => vi.restoreAllMocks());
  it("waits for the list and restores the clicked card's viewport offset only once", () => {
    const scrollTo = vi.spyOn(window, "scrollTo");
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    const wrapper = ({ ready }: { ready: boolean }) => (
      <MemoryRouter
        initialEntries={[
          { pathname: "/trips/trip-1/reservations", search: "?category=hotel", state }
        ]}
      >
        <Page ready={ready} />
      </MemoryRouter>
    );
    const view = render(wrapper({ ready: false }));
    expect(frames).toHaveLength(0);
    view.rerender(wrapper({ ready: true }));
    vi.spyOn(document.getElementById("reservation-1")!, "getBoundingClientRect").mockReturnValue({
      top: 1000
    } as DOMRect);
    vi.spyOn(window, "scrollY", "get").mockReturnValue(0);
    act(() => frames.splice(0).forEach((frame) => frame(0)));
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 880, behavior: "instant" });
    view.rerender(wrapper({ ready: false }));
    view.rerender(wrapper({ ready: true }));
    expect(frames).toHaveLength(0);
  });
  it("falls back to saved scroll if a reservation was removed and ignores other routes", () => {
    const scrollTo = vi.spyOn(window, "scrollTo");
    expect(restoreTripReturnScroll(state, "trip-1", "/trips/trip-1/reservations")).toBe(false);
    expect(scrollTo).not.toHaveBeenCalled();
    expect(restoreTripReturnScroll(state, "trip-1", path)).toBe(true);
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 800, behavior: "instant" });
  });
});
