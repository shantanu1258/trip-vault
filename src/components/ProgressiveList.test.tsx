import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ProgressiveList } from "./ProgressiveList";

describe("ProgressiveList", () => {
  it("keeps a large collection compact until the user asks for every item", async () => {
    const items = Array.from({ length: 12 }, (_, index) => ({
      id: `item-${index + 1}`,
      label: `Trip item ${index + 1}`
    }));

    render(
      <ProgressiveList
        items={items}
        initialCount={5}
        itemLabel="trip items"
        getKey={(item) => item.id}
        renderItem={(item) => <p>{item.label}</p>}
      />
    );

    expect(screen.getByText("Trip item 5")).toBeInTheDocument();
    expect(screen.queryByText("Trip item 6")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Show all 12 trip items" }));

    expect(screen.getByText("Trip item 12")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show fewer" })).toHaveAttribute(
      "aria-expanded",
      "true"
    );

    await userEvent.click(screen.getByRole("button", { name: "Show fewer" }));

    expect(screen.queryByText("Trip item 6")).not.toBeInTheDocument();
  });
});
