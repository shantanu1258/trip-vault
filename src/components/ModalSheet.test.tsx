import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ModalSheet } from "./ModalSheet";

describe("ModalSheet", () => {
  it("scrolls the entire modal without pinning its heading or actions", () => {
    render(
      <ModalSheet eyebrow="Trip" title="Long form" onClose={vi.fn()}>
        <form>
          <label>
            Field
            <input />
          </label>
          <button className="primary-button" type="submit">
            Save
          </button>
        </form>
      </ModalSheet>
    );

    const dialog = screen.getByRole("dialog", { name: "Long form" });
    expect(dialog).toHaveClass("overflow-y-auto");
    expect(dialog).not.toHaveClass("overflow-hidden", "flex-col");
    expect(dialog.querySelector(".modal-sheet-body")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toHaveClass("primary-button");
  });

  it("can become a full-height end drawer on larger screens", () => {
    render(
      <ModalSheet
        eyebrow="Timeline navigator"
        title="Trip agenda"
        onClose={vi.fn()}
        placement="end"
      >
        Agenda
      </ModalSheet>
    );

    const dialog = screen.getByRole("dialog", { name: "Trip agenda" });
    expect(dialog).toHaveClass("sm:h-full", "sm:max-h-full", "sm:max-w-md");
    expect(dialog.parentElement).toHaveClass("sm:items-stretch", "sm:justify-end");
  });
});
