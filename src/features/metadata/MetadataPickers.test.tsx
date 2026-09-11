import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AirlinePicker } from "./AirlinePicker";
import { AirportPicker } from "./AirportPicker";
import { VendorPicker } from "./VendorPicker";

vi.mock("./publishedConfig", () => ({
  listAvailableAirlines: vi.fn().mockResolvedValue([{ stableKey: "air-india", name: "Air India", iataCode: "AI", icaoCode: "AIC", sourceVersion: 1 }]),
  listAvailableAirports: vi.fn().mockResolvedValue([{ stableKey: "del", name: "Indira Gandhi International Airport", city: "Delhi", countryCode: "IN", timezone: "Asia/Kolkata", iataCode: "DEL", icaoCode: null, sourceVersion: 1 }]),
  listAvailableVendors: vi.fn().mockResolvedValue([{ stableKey: "cleartrip", name: "Cleartrip", websiteUrl: "https://www.cleartrip.com", sourceVersion: 1 }])
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
    expect(container.querySelector<HTMLInputElement>('input[name="departureNameSource"]')?.value).toBe("other");
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
    await user.type(screen.getByPlaceholderText("Enter the website, agent, or business that sold the booking"), "Local agent");
    await waitFor(() => expect(container.querySelector<HTMLInputElement>('input[name="bookedViaNameSource"]')?.value).toBe("other"));
  });
});
