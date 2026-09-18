import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { TripTimelineEntry } from "../timeline/model";
import type { ItineraryItem } from "./types";
import { TripAgendaSheet } from "./TripAgendaSheet";

function itineraryItem(
  id: string,
  title: string,
  eventType: ItineraryItem["event_type"],
  startsAt: string,
  location: string
): ItineraryItem {
  return {
    id,
    trip_id: "trip-1",
    booking_id: null,
    title,
    event_type: eventType,
    starts_at: startsAt,
    ends_at: null,
    timezone: "Asia/Singapore",
    location: { label: location },
    notes: null,
    applies_to_all_travelers: true,
    timing_mode: "exact",
    event_status: "planned",
    created_at: "2026-09-01T00:00:00.000Z"
  };
}

const entries: TripTimelineEntry[] = [
  {
    kind: "event",
    id: "past-meal-1",
    startsAt: "2000-01-01T06:00:00.000Z",
    timezone: "Asia/Singapore",
    item: itineraryItem(
      "past-meal-1",
      "Welcome dinner",
      "meal",
      "2000-01-01T06:00:00.000Z",
      "Clarke Quay"
    )
  },
  {
    kind: "event",
    id: "flight-1",
    startsAt: "2099-09-28T01:00:00.000Z",
    timezone: "Asia/Singapore",
    item: itineraryItem(
      "flight-1",
      "Flight to Singapore",
      "flight",
      "2099-09-28T01:00:00.000Z",
      "Changi Airport"
    )
  },
  {
    kind: "event",
    id: "museum-1",
    startsAt: "2099-09-28T06:00:00.000Z",
    timezone: "Asia/Singapore",
    item: itineraryItem(
      "museum-1",
      "National Museum",
      "activity",
      "2099-09-28T06:00:00.000Z",
      "Stamford Road"
    )
  },
  {
    kind: "event",
    id: "hotel-1",
    startsAt: "2099-09-29T07:00:00.000Z",
    timezone: "Asia/Singapore",
    item: itineraryItem(
      "hotel-1",
      "Check in · Marina Hotel",
      "hotel_check_in",
      "2099-09-29T07:00:00.000Z",
      "Marina Bay"
    )
  }
];

describe("TripAgendaSheet", () => {
  it("expands future dates, collapses past dates, and filters without losing the active shortcut", async () => {
    const onSelect = vi.fn();
    render(
      <TripAgendaSheet
        entries={entries}
        activeEntryId="flight-1"
        onClose={vi.fn()}
        onSelect={onSelect}
      />
    );

    expect(screen.getByRole("dialog", { name: "Trip agenda" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Jump to now: Flight to Singapore" })).toBeVisible();
    expect(screen.getByRole("button", { name: /September 28.*2099/ })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    expect(screen.getByRole("button", { name: /September 29.*2099/ })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    expect(screen.getByRole("button", { name: /January 1.*2000/ })).toHaveAttribute(
      "aria-expanded",
      "false"
    );

    await userEvent.click(screen.getByRole("button", { name: "Stay" }));
    expect(
      screen.getByRole("button", { name: "View Check in · Marina Hotel in timeline" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "View National Museum in timeline" })
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "All" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Search trip agenda" }), "museum");
    const matchingGroup = screen
      .getByRole("button", { name: /September 28.*2099/ })
      .closest("section");
    expect(
      within(matchingGroup as HTMLElement).getByRole("button", {
        name: "View National Museum in timeline"
      })
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "View National Museum in timeline" }));
    expect(onSelect).toHaveBeenCalledWith("museum-1");
  });
});
