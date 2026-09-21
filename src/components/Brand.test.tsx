import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, it } from "vitest";
import { Brand } from "./Brand";

it("uses the wallet mark without duplicating the home link's accessible name", () => {
  const { rerender } = render(
    <MemoryRouter>
      <Brand mobileHeader />
    </MemoryRouter>
  );
  const home = screen.getByRole("link", { name: "Trip Vault home" });
  const image = home.querySelector("img");
  expect(image).toHaveAttribute("src", "/icons/wallet-v2-192.png");
  expect(image).toHaveAttribute("alt", "");
  expect(image).toHaveAttribute("aria-hidden", "true");
  expect(home).toHaveTextContent("Trip Vault");
  rerender(
    <MemoryRouter>
      <Brand compact />
    </MemoryRouter>
  );
  expect(screen.getByRole("link", { name: "Trip Vault home" })).toContainElement(image);
  expect(screen.queryByText("Trip Vault")).not.toBeInTheDocument();
});
