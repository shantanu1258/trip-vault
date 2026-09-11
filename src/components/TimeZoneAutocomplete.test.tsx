import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TimeZoneAutocomplete } from "./TimeZoneAutocomplete";

describe("strict time-zone autocomplete", () => {
  it("searches supported zones and submits only the chosen IANA identifier", async () => {
    const user = userEvent.setup();
    const { container } = render(<form><TimeZoneAutocomplete name="timezone" defaultValue="Asia/Kolkata" aria-label="Time zone" /></form>);
    await user.click(screen.getByRole("button", { name: "Time zone" }));
    await user.type(screen.getByRole("combobox", { name: "Search city or time zone" }), "London");
    await user.click(screen.getByRole("option", { name: /London Europe · Europe\/London/i }));
    expect(container.querySelector<HTMLInputElement>('input[name="timezone"]')?.value).toBe("Europe/London");
    expect(screen.queryByRole("dialog", { name: "Choose time zone" })).not.toBeInTheDocument();
  });

  it("preserves a valid legacy zone for existing trip data", () => {
    const { container } = render(<TimeZoneAutocomplete name="timezone" defaultValue="Asia/Calcutta" aria-label="Legacy time zone" />);
    expect(container.querySelector<HTMLInputElement>('input[name="timezone"]')?.value).toBe("Asia/Calcutta");
    expect(screen.getByRole("button", { name: "Legacy time zone" })).toHaveTextContent("Calcutta");
  });

  it("updates when an airport picker prefills the hidden time-zone field", () => {
    const { container } = render(<TimeZoneAutocomplete name="arrivalTimezone" defaultValue="Asia/Kolkata" aria-label="Arrival time zone" />);
    const field = container.querySelector<HTMLInputElement>('input[name="arrivalTimezone"]')!;
    field.value = "Asia/Dubai";
    fireEvent.input(field);
    expect(screen.getByRole("button", { name: "Arrival time zone" })).toHaveTextContent("Dubai");
  });

  it("opens as a bottom sheet on a phone-sized viewport", async () => {
    const media = vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
      matches: query === "(max-width: 639px)", media: query, onchange: null,
      addListener: () => undefined, removeListener: () => undefined,
      addEventListener: () => undefined, removeEventListener: () => undefined,
      dispatchEvent: () => false
    }));
    const user = userEvent.setup();
    render(<TimeZoneAutocomplete name="timezone" defaultValue="Asia/Kolkata" aria-label="Mobile time zone" />);
    await user.click(screen.getByRole("button", { name: "Mobile time zone" }));
    expect(screen.getByRole("dialog", { name: "Choose time zone" })).toHaveClass("rounded-t-[2rem]");
    media.mockRestore();
  });
});
