import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { QuickFlightSeats } from "./QuickFlightSeats";
import type { FlightLeg, Traveler } from "./types";

const mocks = vi.hoisted(() => ({ list: vi.fn(), save: vi.fn() }));
vi.mock("./api", () => ({ listFlightTravelers: mocks.list, setFlightTravelerDetails: mocks.save }));
it("edits a seat in place, preserves other passenger details, and refreshes all seat summaries", async () => {
  mocks.list.mockResolvedValue([
    { traveler_id: "person", seat: "12A", boarding_group: "2", ticket_number: "ticket-123" }
  ]);
  mocks.save.mockResolvedValue({});
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  render(
    <QueryClientProvider client={client}>
      <QuickFlightSeats
        tripId="trip"
        flight={
          { id: "flight", departure_airport_code: "DEL", arrival_airport_code: "SIN" } as FlightLeg
        }
        travelers={[{ id: "person", display_name: "Sam" } as Traveler]}
      />
    </QueryClientProvider>
  );
  expect(mocks.list).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Seats · DEL → SIN" }));
  const input = await screen.findByRole("textbox", { name: "Seat for Sam" });
  expect(input).toHaveValue("12A");
  await userEvent.clear(input);
  await userEvent.type(input, "14c");
  await userEvent.click(screen.getByRole("button", { name: "Save seat for Sam" }));
  await screen.findByText("Seat saved.");
  expect(mocks.save).toHaveBeenCalledWith({
    tripId: "trip",
    flightLegId: "flight",
    travelerId: "person",
    seat: "14C",
    boardingGroup: "2",
    ticketNumber: "ticket-123"
  });
  await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["flight-travelers"] }));
  mocks.save.mockRejectedValueOnce(new Error("Try again"));
  await userEvent.click(screen.getByRole("button", { name: "Save seat for Sam" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Try again");
});
