import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { TripDocumentRow } from "./TripDocumentRow";
import { TripBackLink } from "./TripBackLink";
import {
  readTripScrollRestore,
  tripChildNavigationState,
  tripReturnNavigation
} from "../features/trips/navigation";
import type { VaultDocument } from "../features/workspace/types";

let state: unknown;
function Harness() {
  const location = useLocation();
  state = location.state;
  return (
    <>
      <output>
        {location.pathname}
        {location.search}
      </output>
      {location.pathname.endsWith("/doc-1") ? (
        <TripBackLink {...tripReturnNavigation(location.state, "trip-1")} />
      ) : (
        <TripDocumentRow
          document={
            {
              id: "doc-1",
              trip_id: "trip-1",
              title: "Hotel confirmation",
              category: "hotel",
              purpose: "hotel_confirmation",
              visibility: "trip",
              assignment_mode: "shared"
            } as VaultDocument
          }
          travelers={[]}
          to="/trips/trip-1/documents/doc-1"
          state={tripChildNavigationState(location.state, "trip-1", "details")}
        />
      )}
    </>
  );
}
afterEach(() => vi.restoreAllMocks());
it.each(["/trips/trip-1?view=details", "/trips/trip-1/documents?category=hotel"])(
  "captures document position before navigation and returns to %s",
  (path) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <Harness />
      </MemoryRouter>
    );
    const link = screen.getByRole("link", { name: /Hotel confirmation/ });
    vi.spyOn(window, "scrollY", "get").mockReturnValue(1200);
    vi.spyOn(link, "getBoundingClientRect").mockReturnValue({ top: 210 } as DOMRect);
    fireEvent.click(link);
    // Opening the document resets the page before the return click.
    vi.spyOn(window, "scrollY", "get").mockReturnValue(0);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText(path)).toBeInTheDocument();
    expect(readTripScrollRestore(state, "trip-1", path)).toEqual({
      y: 1200,
      anchorId: "document-doc-1",
      anchorOffset: 210
    });
  }
);
