import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPushDevice: vi.fn(),
  updatePushDevice: vi.fn(),
  disablePush: vi.fn(),
  enablePush: vi.fn()
}));
vi.mock("./config", () => ({ pushEnabled: true }));
vi.mock("./api", () => ({ ...mocks, supportsPush: () => true }));
import { PushSettings } from "./PushSettings";

it("retains opt-in, preferences and revocation without exposing the test-send control", async () => {
  const user = userEvent.setup();
  const device = { id: "device", event_changes: true, cost_changes: true, reminders: true };
  mocks.getPushDevice.mockResolvedValue(null);
  mocks.enablePush.mockResolvedValue(device);
  render(<PushSettings />);
  await user.click(
    await screen.findByRole("button", { name: "Enable notifications on this device" })
  );
  const costs = await screen.findByRole("checkbox", { name: "Expense additions and changes" });
  expect(screen.getByRole("checkbox", { name: "Event additions and changes" })).toBeChecked();
  expect(
    screen.getByRole("checkbox", {
      name: "Remind me one hour before timed events, and five days before flights and buses"
    })
  ).toBeChecked();
  expect(screen.queryByRole("button", { name: "Send test notification" })).not.toBeInTheDocument();
  await user.click(costs);
  await waitFor(() =>
    expect(mocks.updatePushDevice).toHaveBeenCalledWith({ ...device, cost_changes: false })
  );
  await user.click(screen.getByRole("button", { name: "Disable on this device" }));
  await waitFor(() => expect(mocks.disablePush).toHaveBeenCalledOnce());
  expect(
    await screen.findByRole("button", { name: "Enable notifications on this device" })
  ).toBeInTheDocument();
});
