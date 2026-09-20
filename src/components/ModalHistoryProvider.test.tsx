import { useState } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { ModalHistoryProvider } from "./ModalHistoryProvider";
import { ConfirmDialogProvider } from "./ConfirmDialogProvider";
import { ModalSheet } from "./ModalSheet";
import { useUnsavedEventGuard } from "./useUnsavedEventGuard";

function Example() {
  const [open, setOpen] = useState(true);
  const guard = useUnsavedEventGuard(open, false);
  return open ? (
    <ModalSheet title="Event" eyebrow="Trip" onClose={() => void guard.leave(() => setOpen(false))}>
      <input aria-label="Event name" onChange={guard.markDirty} />
    </ModalSheet>
  ) : (
    <p>Form closed</p>
  );
}

it("re-arms modal Back after a dirty form stays open for confirmation", async () => {
  const user = userEvent.setup();
  render(
    <ModalHistoryProvider>
      <ConfirmDialogProvider>
        <Example />
      </ConfirmDialogProvider>
    </ModalHistoryProvider>
  );
  await user.type(screen.getByLabelText("Event name"), "Unsaved");
  await act(async () => {
    history.back();
  });
  await user.click(await screen.findByRole("button", { name: "Keep editing" }));
  expect(screen.getByLabelText("Event name")).toHaveValue("Unsaved");
  await act(async () => {
    history.back();
  });
  await user.click(await screen.findByRole("button", { name: "Discard and leave" }));
  await waitFor(() => expect(screen.getByText("Form closed")).toBeInTheDocument());
});
