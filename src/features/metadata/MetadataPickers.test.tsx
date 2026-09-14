import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AirlinePicker } from "./AirlinePicker";
import { AirportPicker } from "./AirportPicker";
import { JourneyOperatorPicker } from "./JourneyOperatorPicker";
import { VendorPicker } from "./VendorPicker";

vi.mock("./publishedConfig", () => ({
  listAvailableAirlines: vi.fn().mockResolvedValue([{ stableKey: "air-india", name: "Air India", iataCode: "AI", icaoCode: "AIC", sourceVersion: 1 }]),
  listAvailableAirports: vi.fn().mockResolvedValue([
    { stableKey: "del", name: "Indira Gandhi International Airport", city: "Delhi", countryCode: "IN", timezone: "Asia/Kolkata", iataCode: "DEL", icaoCode: null, sourceVersion: 1 },
    { stableKey: "dxb", name: "Dubai International Airport", city: "Dubai", countryCode: "AE", timezone: "Asia/Dubai", iataCode: "DXB", icaoCode: null, sourceVersion: 1 }
  ]),
  listAvailableVendors: vi.fn().mockResolvedValue([
    { stableKey: "cleartrip", name: "Cleartrip", websiteUrl: "https://www.cleartrip.com", sourceVersion: 1 },
    { stableKey: "local-agent", name: "Local agent", websiteUrl: null, sourceVersion: 1 }
  ])
}));

function renderPicker(content: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { user: userEvent.setup(), ...render(<QueryClientProvider client={client}><form>{content}</form></QueryClientProvider>) };
}

describe("travel metadata pickers", () => {
  it("chooses a saved airline or exposes a manual Other field", async () => {
    const { user, container } = renderPicker(<AirlinePicker name="airline" />);
    await user.click(screen.getByRole("button", { name: "Choose airline" }));
    expect(screen.getByPlaceholderText("Search airline name, IATA code, or ICAO code")).toBeInTheDocument();
    await user.click(await screen.findByRole("option", { name: /Air India AI · AIC/i }));
    expect(container.querySelector<HTMLInputElement>('input[name="airline"]')?.value).toBe("Air India");
    expect(container.querySelector<HTMLInputElement>('input[name="airlineSource"]')?.value).toBe("catalog");

    await user.click(screen.getByRole("button", { name: "Choose airline" }));
    await user.click(screen.getByRole("option", { name: /Other airline/i }));
    expect(screen.getByPlaceholderText("Enter the airline exactly as shown on the ticket")).toBeRequired();
    expect(container.querySelector<HTMLInputElement>('input[name="airlineSource"]')?.value).toBe("other");
  });

  it("derives airport code, country, and time zone from one selection", async () => {
    const { user, container } = renderPicker(<AirportPicker name="departureName" codeName="departureCode" countryName="departureCountry" timezoneName="departureTimezone" label="From airport" defaultTimezone="Asia/Dubai" />);
    await user.click(screen.getByRole("button", { name: "Choose from airport" }));
    expect(screen.getByPlaceholderText("Search airport name, city, or IATA code")).toBeInTheDocument();
    await user.click(await screen.findByRole("option", { name: /DEL · Indira Gandhi International Airport/i }));

    expect(screen.getByLabelText("From airport code")).toBeDisabled();
    expect(screen.getByLabelText("From airport code")).toHaveValue("DEL");
    expect(container.querySelector<HTMLInputElement>('input[name="departureName"]')?.value).toBe("Indira Gandhi International Airport");
    expect(container.querySelector<HTMLInputElement>('input[name="departureCountry"]')?.value).toBe("IN");
    expect(container.querySelector<HTMLInputElement>('input[name="departureTimezone"]')?.value).toBe("Asia/Kolkata");

    await user.click(screen.getByRole("button", { name: "Choose from airport" }));
    await user.click(screen.getByRole("option", { name: /Other from airport/i }));
    expect(screen.getByPlaceholderText("Enter the full airport name printed on the ticket")).toBeRequired();
    expect(screen.getByPlaceholderText("Enter the 3-letter IATA code")).toHaveAttribute("maxlength", "3");
    expect(screen.getByPlaceholderText("Enter the 2-letter country code")).toBeRequired();
    expect(screen.getAllByLabelText("From airport time zone")).not.toHaveLength(0);
    expect(container.querySelector<HTMLInputElement>('input[name="departureNameSource"]')?.value).toBe("other");
  });

  it("filters a domestic destination to the origin country and keeps its fallback time zone hidden", async () => {
    const { user, container } = renderPicker(<AirportPicker name="arrivalName" codeName="arrivalCode" countryName="arrivalCountry" timezoneName="arrivalTimezone" label="To airport" defaultTimezone="Asia/Kolkata" countryFilter="IN" showManualTimezone={false} />);
    await user.click(screen.getByRole("button", { name: "Choose to airport" }));

    expect(await screen.findByRole("option", { name: /DEL · Indira Gandhi International Airport/i })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /DXB · Dubai International Airport/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: /Other to airport/i }));

    expect(screen.queryByLabelText("To airport time zone")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Enter the 2-letter country code")).not.toBeInTheDocument();
    expect(container.querySelector<HTMLInputElement>('input[name="arrivalCountry"]')?.value).toBe("IN");
    expect(container.querySelector<HTMLInputElement>('input[name="arrivalTimezone"]')?.value).toBe("Asia/Kolkata");
  });

  it("fills the known booking website and supports an admin-reviewable Other source", async () => {
    const website = vi.fn();
    const { user, container } = renderPicker(<VendorPicker onWebsite={website} />);
    await user.click(screen.getByRole("button", { name: "Choose booked via" }));
    expect(screen.getByPlaceholderText("Search booking website, seller, or travel agent")).toBeInTheDocument();
    await user.click(await screen.findByRole("option", { name: /Cleartrip/i }));
    expect(website).toHaveBeenCalledWith("https://www.cleartrip.com");
    expect(container.querySelector<HTMLInputElement>('input[name="bookedViaName"]')?.value).toBe("Cleartrip");

    await user.click(screen.getByRole("button", { name: "Choose booked via" }));
    await user.click(screen.getByRole("option", { name: /Other booking source/i }));
    expect(website).toHaveBeenLastCalledWith("");
    await user.type(screen.getByPlaceholderText("Enter the website, agent, or business that sold the booking"), "Local agent");
    await waitFor(() => expect(container.querySelector<HTMLInputElement>('input[name="bookedViaNameSource"]')?.value).toBe("other"));

    expect(screen.getByRole("button", { name: "Choose booked via" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Choose booked via" }));
    await user.click(await screen.findByRole("option", { name: /Cleartrip/i }));
    expect(screen.queryByPlaceholderText("Enter the website, agent, or business that sold the booking")).not.toBeInTheDocument();
    expect(container.querySelector<HTMLInputElement>('input[name="bookedViaName"]')?.value).toBe("Cleartrip");
    expect(container.querySelector<HTMLInputElement>('input[name="bookedViaNameSource"]')?.value).toBe("catalog");

    await user.click(screen.getByRole("button", { name: "Choose booked via" }));
    await user.click(await screen.findByRole("option", { name: /Local agent/i }));
    expect(website).toHaveBeenLastCalledWith("");
  });

  it("offers mode-specific journey operators and keeps Other reversible", async () => {
    const { user, container } = renderPicker(<JourneyOperatorPicker mode="bus" name="operator" required />);
    await user.click(screen.getByRole("button", { name: "Choose bus operator" }));
    await user.click(screen.getByRole("option", { name: /Qistna Express/i }));
    expect(container.querySelector<HTMLInputElement>('input[name="operator"]')?.value).toBe("Qistna Express");
    expect(container.querySelector<HTMLInputElement>('input[name="operatorSource"]')?.value).toBe("catalog");

    await user.click(screen.getByRole("button", { name: "Choose bus operator" }));
    await user.click(screen.getByRole("option", { name: /Other bus operator/i }));
    const manual = screen.getByPlaceholderText("Enter the bus operator shown on the ticket");
    expect(manual).toBeRequired();
    await user.type(manual, "Local coach");
    expect(container.querySelector<HTMLInputElement>('input[name="operatorSource"]')?.value).toBe("other");

    await user.click(screen.getByRole("button", { name: "Choose bus operator" }));
    await user.click(screen.getByRole("option", { name: /Causeway Link/i }));
    expect(screen.queryByPlaceholderText("Enter the bus operator shown on the ticket")).not.toBeInTheDocument();
    expect(container.querySelector<HTMLInputElement>('input[name="operator"]')?.value).toBe("Causeway Link");
  });

  it("offers regional cab providers while preserving a manual local-cab option", async () => {
    const { user, container } = renderPicker(<JourneyOperatorPicker mode="cab" name="operator" />);
    await user.click(screen.getByRole("button", { name: "Choose cab operator" }));
    await user.click(screen.getByRole("option", { name: /Grab/i }));
    expect(container.querySelector<HTMLInputElement>('input[name="operator"]')?.value).toBe("Grab");
    expect(container.querySelector<HTMLInputElement>('input[name="operatorSource"]')?.value).toBe("catalog");

    await user.click(screen.getByRole("button", { name: "Choose cab operator" }));
    await user.click(screen.getByRole("option", { name: /Other cab operator/i }));
    expect(screen.getByPlaceholderText("Enter the cab operator shown on the ticket")).not.toBeRequired();
    expect(container.querySelector<HTMLInputElement>('input[name="operatorSource"]')?.value).toBe("other");
  });
});
