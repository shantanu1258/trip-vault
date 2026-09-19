import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ModalSheet } from "./ModalSheet";

describe("ModalSheet", () => {
  it("labels the dialog and allows editing its content before returning with Back", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <ModalSheet eyebrow="Trip" title="Edit event" onClose={onClose} manageHistory={false}>
        <form>
          <label>
            Event name
            <input />
          </label>
        </form>
      </ModalSheet>
    );

    const dialog = screen.getByRole("dialog", { name: "Edit event" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    const field = screen.getByRole("textbox", { name: "Event name" });
    expect(dialog).toContainElement(field);
    await user.type(field, "Museum visit");
    expect(field).toHaveValue("Museum visit");
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
