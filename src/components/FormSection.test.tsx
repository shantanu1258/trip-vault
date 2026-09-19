import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { FormSection } from "./FormSection";
import { FieldHelp } from "./FieldHelp";

describe("progressive form sections", () => {
  it("starts empty optional fields collapsed but keeps their values in FormData", async () => {
    const { container } = render(
      <form>
        <FormSection>
          <summary>Seats</summary>
          <label>
            Seat
            <input name="seat" />
          </label>
        </FormSection>
      </form>
    );
    expect(container.querySelector("details")).not.toHaveAttribute("open");
    await userEvent.click(screen.getByText("Seats"));
    await userEvent.type(screen.getByLabelText("Seat"), "12A");
    expect(screen.getByText("1 filled")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Seats"));
    expect(new FormData(container.querySelector("form")!).get("seat")).toBe("12A");
  });
  it("reveals existing values on edit", () => {
    const { container } = render(
      <FormSection>
        <summary>Seats</summary>
        <input name="seat" defaultValue="12A" />
      </FormSection>
    );
    expect(container.querySelector("details")).toHaveAttribute("open");
    expect(screen.getByText("1 filled")).toBeInTheDocument();
  });
  it("reveals a collapsed section synchronously for native validation", async () => {
    const { container } = render(
      <FormSection>
        <summary>Seats</summary>
        <input aria-label="Seat" name="seat" required />
      </FormSection>
    );
    const details = container.querySelector("details")!;
    expect(details.open).toBe(true);
    await userEvent.click(screen.getByText("Seats"));
    fireEvent.invalid(screen.getByLabelText("Seat"));
    expect(details.open).toBe(true);
  });
  it("reveals help on demand without removing the field label", async () => {
    render(
      <FieldHelp label="Journey time zone">Use the local clock printed on your ticket.</FieldHelp>
    );
    expect(screen.queryByText(/Use the local clock/)).not.toBeInTheDocument();
    const button = screen.getByRole("button", { name: "About Journey time zone" });
    await userEvent.click(button);
    expect(screen.getByText(/Use the local clock/)).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(button).toHaveAttribute("aria-expanded", "false");
  });
});
