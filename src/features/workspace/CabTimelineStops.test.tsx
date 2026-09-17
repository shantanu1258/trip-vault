import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CabTimelineStops } from "./CabTimelineStops";

describe("CabTimelineStops", () => {
  it("shows a compact ordered preview of cab subevents", () => {
    const stops = ["Museum", "Lunch", "Temple", "Coffee"].map((title, index) => ({
      id: `stop-${index + 1}`,
      journey_leg_id: "leg-1",
      stop_order: (index + 1) * 100,
      title,
      location: null,
      arrives_at: null,
      departs_at: null,
      timezone: "Asia/Kolkata",
      notes: null,
      linked_itinerary_item_id: null
    }));
    render(<CabTimelineStops stops={stops} eventTimezone="Asia/Kolkata" />);

    expect(screen.getByText("1. Museum")).toBeInTheDocument();
    expect(screen.getByText("3. Temple")).toBeInTheDocument();
    expect(screen.queryByText("4. Coffee")).not.toBeInTheDocument();
    expect(screen.getByText("+1 more stops")).toBeInTheDocument();
  });
});
