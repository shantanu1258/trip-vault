import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { ItineraryItem, Trip } from "../trips/types";
import { readEventTiming, TimingFields } from "./TimingFields";

const trip: Trip = {
  id: "trip-1",
  title: "Autumn trip",
  destination_summary: "Singapore",
  start_date: "2026-09-26",
  end_date: "2026-10-12",
  primary_timezone: "Asia/Kolkata",
  base_currency: "INR",
  status: "upcoming",
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-01T00:00:00.000Z"
};

const anchor: ItineraryItem = {
  id: "hotel-1",
  trip_id: trip.id,
  booking_id: null,
  title: "Shantanu Hotel - Palm Springs",
  event_type: "hotel_check_out",
  starts_at: "2026-09-26T03:30:00.000Z",
  ends_at: null,
  timezone: "Asia/Kolkata",
  location: null,
  notes: null,
  applies_to_all_travelers: true,
  timing_mode: "exact",
  scheduled_date: "2026-09-26",
  created_at: "2026-09-01T00:00:00.000Z"
};

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
}

function relativeForm(values: Record<string, string> = {}) {
  return form({
    timingMode: "relative",
    timezone: "Asia/Kolkata",
    anchorItineraryItemId: anchor.id,
    relativePosition: "after",
    ...values
  });
}

describe("relative event timing", () => {
  it("keeps a relation-only event next to its anchor without claiming an explicit start", () => {
    expect(readEventTiming(relativeForm(), trip, [anchor])).toMatchObject({
      timingMode: "relative",
      startsAt: anchor.starts_at,
      endsAt: undefined,
      anchorItineraryItemId: anchor.id,
      relativePosition: "after",
      hasExplicitStartTime: false,
      durationMinutes: undefined
    });
  });

  it("accepts a duration without requiring a start or end", () => {
    expect(readEventTiming(relativeForm({ durationValue: "1.5", durationUnit: "hours" }), trip, [anchor])).toMatchObject({
      startsAt: anchor.starts_at,
      endsAt: undefined,
      hasExplicitStartTime: false,
      durationMinutes: 90
    });
  });

  it.each([
    ["zero", "0"],
    ["negative", "-1"]
  ])("rejects a %s duration", (_label, durationValue) => {
    expect(() => readEventTiming(relativeForm({ durationValue, durationUnit: "minutes" }), trip, [anchor])).toThrow("Duration must be greater than zero.");
  });

  it("rejects a fractional duration that does not resolve to whole minutes", () => {
    expect(() => readEventTiming(relativeForm({ durationValue: "0.5", durationUnit: "minutes" }), trip, [anchor])).toThrow("Duration must resolve to a whole number of minutes.");
  });

  it("derives an end from an optional start and duration", () => {
    expect(readEventTiming(relativeForm({ startsAt: "2026-09-27T10:00", durationValue: "2", durationUnit: "hours" }), trip, [anchor])).toMatchObject({
      startsAt: "2026-09-27T04:30:00.000Z",
      endsAt: "2026-09-27T06:30:00.000Z",
      scheduledDate: "2026-09-27",
      hasExplicitStartTime: true,
      durationMinutes: 120
    });
  });

  it("derives duration from optional relative start and end", () => {
    expect(readEventTiming(relativeForm({ startsAt: "2026-09-27T10:00", endsAt: "2026-09-27T11:45" }), trip, [anchor])).toMatchObject({
      hasExplicitStartTime: true,
      durationMinutes: 105
    });
  });

  it("uses the anchor time zone for a new relative event", () => {
    const dubaiAnchor = { ...anchor, timezone: "Asia/Dubai" };
    const data = relativeForm({ startsAt: "2026-09-27T10:00", durationValue: "1", durationUnit: "hours" });
    data.delete("timezone");

    expect(readEventTiming(data, trip, [dubaiAnchor])).toMatchObject({
      timezone: "Asia/Dubai",
      startsAt: "2026-09-27T06:00:00.000Z",
      endsAt: "2026-09-27T07:00:00.000Z"
    });
  });

  it("rejects an end without a start", () => {
    expect(() => readEventTiming(relativeForm({ endsAt: "2026-09-27T12:00" }), trip, [anchor])).toThrow("Add a start date and time before adding an end time.");
  });

  it("rejects an end before start and inconsistent duration", () => {
    expect(() => readEventTiming(relativeForm({ startsAt: "2026-09-27T12:00", endsAt: "2026-09-27T11:00" }), trip, [anchor])).toThrow("End time must be after the start time.");
    expect(() => readEventTiming(relativeForm({ startsAt: "2026-09-27T12:00", endsAt: "2026-09-27T12:00" }), trip, [anchor])).toThrow("End time must be after the start time.");
    expect(() => readEventTiming(relativeForm({ startsAt: "2026-09-27T10:00", endsAt: "2026-09-27T12:00", durationValue: "3", durationUnit: "hours" }), trip, [anchor])).toThrow("End time and duration do not match.");
  });

  it("rejects a derived end outside the trip dates", () => {
    expect(() => readEventTiming(relativeForm({ startsAt: "2026-10-12T23:00", durationValue: "2", durationUnit: "hours" }), trip, [anchor])).toThrow("Choose a date between 2026-09-26 and 2026-10-12.");
  });

  it("shows an optional full schedule below Position and Event and enables end after start", async () => {
    const user = userEvent.setup();
    render(<TimingFields trip={trip} itinerary={[anchor]} />);

    await user.selectOptions(screen.getByLabelText("Timing"), "relative");

    expect(screen.getByLabelText("Position")).toBeInTheDocument();
    expect(screen.getByLabelText("Event")).toBeInTheDocument();
    expect(screen.getByText("Optional schedule details")).toBeInTheDocument();
    const start = screen.getByLabelText("Start date & time (optional)");
    const end = screen.getByLabelText("End date & time (optional)");
    expect(start).toHaveValue("");
    expect(end).toBeDisabled();
    expect(screen.getByLabelText("Duration (optional)")).toBeInTheDocument();
    expect(screen.getByLabelText("Duration unit")).toBeInTheDocument();

    fireEvent.change(start, { target: { value: "2026-09-27T10:00" } });
    expect(end).toBeEnabled();
  });

  it("uses native range validation and custom whole-minute validation for duration", async () => {
    const user = userEvent.setup();
    render(<form><TimingFields trip={trip} itinerary={[anchor]} /></form>);

    await user.selectOptions(screen.getByLabelText("Timing"), "relative");
    const duration = screen.getByLabelText("Duration (optional)") as HTMLInputElement;

    fireEvent.input(duration, { target: { value: "0" } });
    expect(duration.validity.rangeUnderflow).toBe(true);
    expect(duration.checkValidity()).toBe(false);

    fireEvent.input(duration, { target: { value: "-1" } });
    expect(duration.validity.rangeUnderflow).toBe(true);
    expect(duration.checkValidity()).toBe(false);

    fireEvent.input(duration, { target: { value: "0.5" } });
    expect(duration.validity.customError).toBe(true);
    expect(duration.validationMessage).toBe("Use a duration that resolves to whole minutes.");

    await user.selectOptions(screen.getByLabelText("Duration unit"), "hours");
    expect(duration.validity.customError).toBe(false);
    expect(duration.checkValidity()).toBe(true);
  });

  it("does not display an old synthetic anchor time as an explicit start", () => {
    render(<TimingFields trip={trip} itinerary={[anchor]} item={{
      ...anchor,
      id: "relative-1",
      title: "Museum",
      timing_mode: "relative",
      anchor_itinerary_item_id: anchor.id,
      relative_position: "after",
      has_explicit_start_time: false
    }} />);

    expect(screen.getByLabelText("Start date & time (optional)")).toHaveValue("");
  });

  it("preloads a start added later to an existing relative event", () => {
    render(<TimingFields trip={trip} itinerary={[anchor]} item={{
      ...anchor,
      id: "relative-1",
      title: "Museum",
      starts_at: "2026-09-27T04:30:00.000Z",
      timing_mode: "relative",
      anchor_itinerary_item_id: anchor.id,
      relative_position: "after",
      has_explicit_start_time: true,
      duration_minutes: 120
    }} />);

    expect(screen.getByLabelText("Start date & time (optional)")).toHaveValue("2026-09-27T10:00");
    expect(screen.getByLabelText("Duration (optional)")).toHaveValue(2);
    expect(screen.getByLabelText("Duration unit")).toHaveValue("hours");
  });

  it("retains the saved order while the anchor options load", () => {
    const relativeItem: ItineraryItem = {
      ...anchor,
      id: "relative-1",
      title: "Museum",
      timing_mode: "relative",
      anchor_itinerary_item_id: anchor.id,
      relative_position: "before",
      has_explicit_start_time: false
    };
    const view = render(<TimingFields trip={trip} itinerary={[]} item={relativeItem} />);

    expect(screen.getByLabelText("Position")).toHaveValue("before");
    expect(screen.getByLabelText("Event")).toHaveValue("");

    view.rerender(<TimingFields trip={trip} itinerary={[anchor]} item={relativeItem} />);

    expect(screen.getByLabelText("Position")).toHaveValue("before");
    expect(screen.getByLabelText("Event")).toHaveValue(anchor.id);
    expect(screen.getByLabelText("Start date & time (optional)")).toHaveValue("");
  });
});

describe("exact event timing", () => {
  it("derives duration from start and end", () => {
    expect(readEventTiming(form({ timingMode: "exact", timezone: "Asia/Kolkata", startsAt: "2026-09-27T10:00", endsAt: "2026-09-27T11:30" }), trip, [])).toMatchObject({
      startsAt: "2026-09-27T04:30:00.000Z",
      endsAt: "2026-09-27T06:00:00.000Z",
      hasExplicitStartTime: true,
      durationMinutes: 90
    });
  });

  it("derives end from start and duration", () => {
    expect(readEventTiming(form({ timingMode: "exact", timezone: "Asia/Kolkata", startsAt: "2026-09-27T10:00", durationValue: "1", durationUnit: "days" }), trip, [])).toMatchObject({
      endsAt: "2026-09-28T04:30:00.000Z",
      hasExplicitStartTime: true,
      durationMinutes: 1_440
    });
  });
});
