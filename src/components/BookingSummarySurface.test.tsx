import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Booking } from "../features/workspace/types";
import { BookingSummarySurface } from "./BookingSummarySurface";

describe("BookingSummarySurface", () => {
  it("inherits the parent event identity for a linked planning booking", () => {
    const { container } = render(
      <BookingSummarySurface
        booking={
          {
            id: "booking-1",
            type: "other",
            title: "Booking 1",
            reservation_state: "booked"
          } as Booking
        }
        eventType="preparation"
      />
    );

    expect(container.firstChild).toHaveClass("event-type-icon--preparation");
    expect(container.querySelector('[data-event-type="preparation"]')).toBeInTheDocument();
    expect(container.querySelector('[data-silhouette-art="planning"]')).toBeInTheDocument();
  });
});
