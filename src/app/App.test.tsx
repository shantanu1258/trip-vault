import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AppProviders } from "./AppProviders";
import { App } from "./App";
import { EmptyHomeDashboard } from "../pages/HomePage";

describe("Trip Vault", () => {
  it("offers the bundled demo from the signed-out welcome page", async () => {
    render(
      <MemoryRouter initialEntries={["/welcome"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppProviders><App /></AppProviders>
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: /your whole trip/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /explore the demo trip/i })).toHaveAttribute("href", "/preview");
  });

  it("keeps personal routes behind sign-in", async () => {
    render(
      <MemoryRouter initialEntries={["/vault"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppProviders><App /></AppProviders>
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: /welcome back/i })).toBeInTheDocument();
  });

  it("confirms and reveals passwords when creating an account", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/sign-in"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppProviders><App /></AppProviders>
      </MemoryRouter>
    );

    await user.click(await screen.findByRole("button", { name: /create an account/i }));
    const name = screen.getByLabelText("Your name");
    const password = screen.getByLabelText("Password");
    const confirmation = screen.getByLabelText("Confirm password");
    expect(name).toBeRequired();
    expect(password).toHaveAttribute("type", "password");
    expect(confirmation).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: "Show password" }));
    await user.click(screen.getByRole("button", { name: "Show confirmed password" }));
    expect(password).toHaveAttribute("type", "text");
    expect(confirmation).toHaveAttribute("type", "text");

    await user.type(screen.getByLabelText("Email address"), "sam@example.com");
    await user.type(name, "Sam Traveler");
    await user.type(password, "password-one");
    await user.type(confirmation, "password-two");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/passwords do not match/i);
  });

  it("gives a signed-in user useful first-trip actions without a demo link", () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <EmptyHomeDashboard />
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { name: /where are you going next/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /create your first trip/i })).toHaveAttribute("href", "/trips/new");
    expect(screen.getByRole("link", { name: /join with a code/i })).toHaveAttribute("href", "/join");
    expect(screen.queryByRole("link", { name: /demo/i })).not.toBeInTheDocument();
  });

  it("keeps every visible demo action interactive or explicitly sign-in gated", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/preview"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppProviders><App /></AppProviders>
      </MemoryRouter>
    );

    await user.click(await screen.findByRole("button", { name: /open what i need/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /sign in to add/i })).toHaveAttribute("href", "/sign-in");
    expect(screen.getAllByRole("link", { name: /flight ticket|boarding pass/i }).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: /close event details/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /full itinerary/i })).toHaveAttribute("href", "#full-itinerary");
  });
});
