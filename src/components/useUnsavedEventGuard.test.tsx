import { useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider, useLocation, useNavigate } from "react-router-dom";
import { expect, it } from "vitest";
import { ConfirmDialogProvider } from "./ConfirmDialogProvider";
import { UnsavedEventNavigationGuard, useUnsavedEventGuard } from "./useUnsavedEventGuard";

function Form() {
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [closed, setClosed] = useState(false);
  const guard = useUnsavedEventGuard(!saved, saving);
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <>
      <output>{location.search}</output>
      <UnsavedEventNavigationGuard guard={guard} />
      <form onChangeCapture={guard.markDirty}>
        <input aria-label="Event name" />
        <input aria-label="Attachment" type="file" />
      </form>
      <button onClick={() => void guard.leave(() => setClosed(true))}>Form Back</button>
      <button onClick={() => navigate(-1)}>Browser Back</button>
      <button onClick={() => navigate("?add=event&eventType=hotel_check_in", { replace: true })}>
        Change route type
      </button>
      <button onClick={() => setSaved(true)}>Complete save</button>
      <button onClick={() => setSaving(true)}>Start save</button>
      {closed && <p>Closed</p>}
    </>
  );
}
function setup() {
  const router = createMemoryRouter(
    [
      {
        path: "*",
        element: (
          <ConfirmDialogProvider>
            <Form />
          </ConfirmDialogProvider>
        )
      }
    ],
    {
      initialEntries: ["/trips/t?view=details", "/trips/t?view=details&add=event"],
      initialIndex: 1
    }
  );
  render(<RouterProvider router={router} />);
  return { router, user: userEvent.setup() };
}
it("preserves typed input when staying, ignores duplicate Back, and discards only on confirmation", async () => {
  const { user } = setup();
  await user.type(screen.getByLabelText("Event name"), "Museum");
  await user.click(screen.getByText("Form Back"));
  await user.click(screen.getByText("Form Back"));
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
  await user.click(screen.getByText("Keep editing"));
  expect(screen.getByLabelText("Event name")).toHaveValue("Museum");
  expect(screen.queryByText("Closed")).not.toBeInTheDocument();
  await user.click(screen.getByText("Form Back"));
  await user.click(screen.getByText("Discard and leave"));
  expect(await screen.findByText("Closed")).toBeInTheDocument();
});
it("blocks browser Back, keeps the query route on cancellation, and proceeds once confirmed", async () => {
  const { router, user } = setup();
  await user.type(screen.getByLabelText("Event name"), "Flight");
  await user.click(screen.getByText("Browser Back"));
  await user.click(await screen.findByText("Keep editing"));
  expect(router.state.location.search).toContain("add=event");
  expect(screen.getByLabelText("Event name")).toHaveValue("Flight");
  await user.click(screen.getByText("Browser Back"));
  await user.click(await screen.findByText("Discard and leave"));
  await waitFor(() => expect(router.state.location.search).toBe("?view=details"));
});
it("protects attachments and replacement navigation that changes event type", async () => {
  const { router, user } = setup();
  await user.upload(
    screen.getByLabelText("Attachment"),
    new File(["test"], "ticket.pdf", { type: "application/pdf" })
  );
  await user.click(screen.getByText("Change route type"));
  await user.click(await screen.findByText("Keep editing"));
  expect(router.state.location.search).not.toContain("eventType");
  expect((screen.getByLabelText("Attachment") as HTMLInputElement).files?.[0].name).toBe(
    "ticket.pdf"
  );
});
it("warns on reload only while unsaved and does not prompt after successful save", async () => {
  const { user } = setup();
  const clean = new Event("beforeunload", { cancelable: true });
  fireEvent(window, clean);
  expect(clean.defaultPrevented).toBe(false);
  await user.type(screen.getByLabelText("Event name"), "Meal");
  const dirty = new Event("beforeunload", { cancelable: true });
  fireEvent(window, dirty);
  expect(dirty.defaultPrevented).toBe(true);
  await user.click(screen.getByText("Complete save"));
  const saved = new Event("beforeunload", { cancelable: true });
  fireEvent(window, saved);
  expect(saved.defaultPrevented).toBe(false);
  await user.click(screen.getByText("Form Back"));
  expect(await screen.findByText("Closed")).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it("allows pristine Back and prevents leaving during an in-flight save", async () => {
  const { router, user } = setup();
  await act(() => router.navigate(-1));
  expect(router.state.location.search).toBe("?view=details");
  await act(() => router.navigate(1));
  await user.click(screen.getByText("Start save"));
  await user.click(screen.getByText("Browser Back"));
  await waitFor(() =>
    expect([...router.state.blockers.values()].every((b) => b.state === "unblocked")).toBe(true)
  );
  expect(router.state.location.search).toContain("add=event");
});
