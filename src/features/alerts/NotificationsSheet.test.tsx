import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NotificationsSheet } from "./NotificationsSheet";

describe("active notifications sheet", () => {
  it("opens the readiness task deep link rather than the list", async () => {
    const onOpen = vi.fn();
    render(
      <NotificationsSheet
        alerts={[
          {
            key: "requirement-due:visa",
            tripId: "trip-1",
            title: "Bali eVisa",
            detail: "Due today",
            group: "urgent",
            target: "/trips/trip-1/readiness?task=visa"
          }
        ]}
        tripNames={new Map([["trip-1", "Bali trip"]])}
        loading={false}
        error={false}
        onClose={vi.fn()}
        onOpen={onOpen}
      />
    );
    expect(screen.getByText("Needs attention")).toBeInTheDocument();
    expect(screen.getByText("Bali trip")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Open notification: Bali eVisa" }));
    expect(onOpen).toHaveBeenCalledWith("/trips/trip-1/readiness?task=visa");
  });
  it("does not report all caught up while loading or when refresh failed", () => {
    const props = {
      alerts: [],
      tripNames: new Map<string, string>(),
      loading: true,
      error: false,
      onClose: vi.fn(),
      onOpen: vi.fn()
    };
    const { rerender } = render(<NotificationsSheet {...props} />);
    expect(screen.getByRole("status")).toHaveTextContent("Checking");
    expect(screen.queryByText("You're all caught up")).not.toBeInTheDocument();
    rerender(<NotificationsSheet {...props} loading={false} error />);
    expect(screen.getByRole("alert")).toHaveTextContent("could not be refreshed");
    expect(screen.queryByText("You're all caught up")).not.toBeInTheDocument();
  });
});
