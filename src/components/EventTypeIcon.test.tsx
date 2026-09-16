import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { timelineEventTypes } from "../features/trips/types";
import { EventTypeIcon, eventIconTone } from "./EventTypeIcon";

describe("EventTypeIcon", () => {
  it("gives every timeline event a stable visual identity", () => {
    render(
      <div>
        {timelineEventTypes.map((type) => (
          <EventTypeIcon key={type} type={type} />
        ))}
      </div>
    );

    for (const type of timelineEventTypes) {
      const icon = document.querySelector(`[data-event-type="${type}"]`);
      expect(icon).toHaveAttribute("data-event-tone", eventIconTone(type));
      expect(icon).toHaveClass(`event-type-icon--${eventIconTone(type)}`);
      expect(icon).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("keeps journeys in related cool tones and separates non-travel events", () => {
    expect([
      eventIconTone("flight"),
      eventIconTone("train"),
      eventIconTone("bus"),
      eventIconTone("ferry"),
      eventIconTone("cab"),
      eventIconTone("transport")
    ]).toEqual(["flight", "train", "bus", "ferry", "cab", "transport"]);
    expect(eventIconTone("hotel_check_in")).toBe("hotel");
    expect(eventIconTone("hotel_check_out")).toBe("hotel");
    expect(eventIconTone("activity")).toBe("activity");
    expect(eventIconTone("meal")).toBe("meal");
    expect(eventIconTone("preparation")).toBe("preparation");
    expect(eventIconTone("custom")).toBe("custom");
  });
});
