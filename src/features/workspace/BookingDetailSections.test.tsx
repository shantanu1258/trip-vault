import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import {
  BookingDisclosure,
  BookingDocuments,
  primaryBookingDocument
} from "./BookingDetailSections";
import type { Traveler, VaultDocument } from "./types";

const traveler = (id: string): Traveler => ({
  id,
  display_name: id,
  trip_id: "trip",
  is_minor: false,
  created_at: "2026-09-19"
});
const doc = (
  id: string,
  purpose: VaultDocument["purpose"],
  travelerId: string | null = null
): VaultDocument => ({
  id,
  purpose,
  title: id,
  traveler_id: travelerId,
  trip_id: "trip",
  booking_id: "booking",
  flight_leg_id: null,
  category: "activity",
  short_label: null,
  visibility: "private",
  current_version_id: null,
  updated_at: "2026-09-19"
});

describe("reading-first booking sections", () => {
  it("keeps populated editors closed until requested", async () => {
    render(
      <BookingDisclosure title="Passenger" hint="Seat 5">
        <input aria-label="Seat" defaultValue="5" />
      </BookingDisclosure>
    );
    const details = screen.getByText("Passenger").closest("details")!;
    expect(details.open).toBe(false);
    const user = userEvent.setup();
    await user.click(screen.getByText("Passenger"));
    expect(details.open).toBe(true);
    expect(screen.getByRole("textbox", { name: "Seat" })).toHaveValue("5");
  });
  it("groups personal documents once, leaves shared documents visible, and sorts admission before vouchers", async () => {
    render(
      <MemoryRouter>
        <BookingDocuments
          documents={[
            doc("Meal voucher", "meal_voucher", "Alice"),
            doc("Admission", "activity_ticket", "Alice"),
            doc("Shared confirmation", "confirmation"),
            doc("Bob ticket", "activity_ticket", "Bob")
          ]}
          travelers={[traveler("Alice"), traveler("Bob")]}
          onUpload={vi.fn()}
        />
      </MemoryRouter>
    );
    expect(screen.getByRole("link", { name: /Shared confirmation/ })).toBeInTheDocument();
    const group = screen.getByText("Alice").closest("details")!;
    expect(group.open).toBe(false);
    await userEvent.click(screen.getByText("Alice"));
    const links = within(group).getAllByRole("link");
    expect(links[0]).toHaveTextContent("Admission");
    expect(links[1]).toHaveTextContent("Meal voucher");
    expect(links[0]).toHaveAttribute("href", "/trips/trip/documents/Admission");
    expect(links[0]).toHaveTextContent("Only me");
    const upload = screen.getByRole("button", { name: "Upload" });
    expect(group.compareDocumentPosition(upload) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(upload).toHaveClass("text-xs");
  });
  it("opens focused documents and keeps upload available in the empty state", async () => {
    const upload = vi.fn();
    const view = render(
      <MemoryRouter>
        <BookingDocuments documents={[]} travelers={[]} onUpload={upload} />
      </MemoryRouter>
    );
    expect(screen.getByText("No documents attached yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload" })).toHaveClass("primary-button");
    await userEvent.click(screen.getByRole("button", { name: "Upload" }));
    expect(upload).toHaveBeenCalledOnce();
    view.rerender(
      <MemoryRouter>
        <BookingDocuments
          documents={[doc("My ticket", "ticket", "Alice")]}
          travelers={[traveler("Alice")]}
          focusedTravelerId="Alice"
          onUpload={upload}
        />
      </MemoryRouter>
    );
    expect(screen.getByRole("link", { name: /My ticket/ })).toBeInTheDocument();
    expect(view.container.querySelector("details")).toBeNull();
  });
  it("chooses travel documents ahead of supporting files without inventing a ticket", () => {
    expect(primaryBookingDocument([doc("meal", "meal_voucher"), doc("ticket", "ticket")])?.id).toBe(
      "ticket"
    );
    expect(primaryBookingDocument([doc("meal", "meal_voucher")])).toBeUndefined();
    expect(
      primaryBookingDocument([
        doc("Alice ticket", "activity_ticket", "Alice"),
        doc("Bob ticket", "activity_ticket", "Bob")
      ])
    ).toBeUndefined();
    expect(
      primaryBookingDocument([
        doc("Alice ticket", "activity_ticket", "Alice"),
        doc("Shared", "confirmation")
      ])?.id
    ).toBe("Shared");
  });
});
