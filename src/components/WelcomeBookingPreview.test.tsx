import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { WelcomeBookingPreview } from "./WelcomeBookingPreview";

it("shows three clearly identified sample bookings using the real animated hero artwork", () => {
  render(<WelcomeBookingPreview />);
  const preview = screen.getByRole("region", { name: "Sample booking previews" });
  expect(within(preview).getAllByRole("article")).toHaveLength(3);
  expect(within(preview).getByText(/Sample bookings/)).toBeVisible();
  for (const title of ["DEL → FCO", "Casa Verde Hotel", "A morning at the Colosseum"]) {
    const card = screen.getByRole("heading", { name: title }).closest("article")!;
    expect(card).toHaveClass("event-hero");
    expect(card.querySelector('[data-silhouette-placement="hero"]')).toHaveAttribute(
      "aria-hidden",
      "true"
    );
  }
  expect(screen.queryByText(/Boarding in 48 min/)).not.toBeInTheDocument();
  expect(within(preview).queryByRole("button")).not.toBeInTheDocument();
});
