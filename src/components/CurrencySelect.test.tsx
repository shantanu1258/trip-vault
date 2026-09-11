import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { CurrencySelect } from "./CurrencySelect";

describe("currency selector", () => {
  it("uses a native dropdown with trip-relevant and global currency options", async () => {
    const user = userEvent.setup();
    render(<CurrencySelect aria-label="Currency" name="currency" defaultValue="INR" />);
    const select = screen.getByRole("combobox", { name: "Currency" });
    expect(select).toHaveValue("INR");
    expect(screen.getByRole("option", { name: /MYR/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /IDR/ })).toBeInTheDocument();
    await user.selectOptions(select, "SGD");
    expect(select).toHaveValue("SGD");
  });

  it("normalizes an existing lowercase currency value", () => {
    render(<CurrencySelect aria-label="Existing currency" defaultValue="inr" />);
    expect(screen.getByRole("combobox", { name: "Existing currency" })).toHaveValue("INR");
  });
});
