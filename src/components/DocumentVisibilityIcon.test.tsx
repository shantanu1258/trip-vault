import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { DocumentVisibilityIcon } from "./DocumentVisibilityIcon";

it("explains access on a phone tap, dismisses on outside tap, and supports keyboard focus/Escape", async () => {
  const user = userEvent.setup();
  render(
    <>
      <DocumentVisibilityIcon
        interactive
        visibility="selected_members"
        documentTitle="Entry pass"
      />
      <button>Outside</button>
    </>
  );
  const icon = screen.getByRole("button", { name: "Who can open Entry pass?" });
  expect(icon.querySelector(".lucide-key-round")).toBeInTheDocument();
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  expect(icon).not.toHaveTextContent("Selected members");
  expect(icon).not.toHaveClass("border", "bg-elevated", "bg-brand-soft");
  fireEvent.click(icon);
  expect(screen.getByRole("tooltip")).toHaveTextContent("Visible only to selected trip members");
  expect(icon).toHaveAttribute("aria-describedby", screen.getByRole("tooltip").id);
  await user.click(screen.getByRole("button", { name: "Outside" }));
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  await user.tab({ shift: true });
  expect(icon).toHaveFocus();
  expect(screen.getByRole("tooltip")).toBeVisible();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
});

it("renders list visibility as a plain non-interactive indicator", () => {
  const { rerender } = render(
    <DocumentVisibilityIcon visibility="private" documentTitle="Passport" />
  );
  const indicator = screen.getByRole("img", { name: "Visible only to you" });
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(indicator).not.toHaveClass("border", "bg-elevated", "bg-brand-soft");
  expect(indicator.querySelector(".lucide-lock-keyhole")).toBeInTheDocument();
  fireEvent.click(indicator);
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  rerender(<DocumentVisibilityIcon visibility="trip" documentTitle="Ticket" />);
  expect(
    screen
      .getByRole("img", { name: "Visible to all signed-in trip members" })
      .querySelector(".lucide-globe")
  ).toBeInTheDocument();
});
