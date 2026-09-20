import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ apply: vi.fn() }));
vi.mock("virtual:pwa-register/react", () => ({
  useRegisterSW: () => ({ needRefresh: [true, vi.fn()], offlineReady: [false, vi.fn()] })
}));
vi.mock("../lib/pwa/update", () => ({ reloadWithServiceWorkerUpdate: mocks.apply }));
import { PwaUpdatePrompt } from "./PwaUpdatePrompt";

it("updates only on request, prevents duplicate clicks, and offers retry on failure", async () => {
  const user = userEvent.setup();
  let fail!: (error: Error) => void;
  mocks.apply.mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        fail = reject;
      })
  );
  render(<PwaUpdatePrompt />);
  expect(mocks.apply).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Reload and update" }));
  const updating = screen.getByRole("button", { name: "Updating…" });
  expect(updating).toBeDisabled();
  expect(screen.getByRole("button", { name: "Dismiss update message" })).toBeDisabled();
  await user.click(updating);
  expect(mocks.apply).toHaveBeenCalledOnce();
  await act(async () => fail(new Error("The update did not finish. Please try again.")));
  expect(screen.getByRole("alert")).toHaveTextContent("Please try again");
  mocks.apply.mockResolvedValueOnce(undefined);
  await user.click(screen.getByRole("button", { name: "Retry update" }));
  expect(mocks.apply).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
