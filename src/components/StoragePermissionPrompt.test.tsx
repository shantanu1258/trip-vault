import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StoragePermissionPrompt } from "./StoragePermissionPrompt";

vi.mock("../features/sync/localSync", () => ({
  localProfileId: vi.fn().mockResolvedValue("profile-1")
}));

describe("offline storage request", () => {
  const persist = vi.fn().mockResolvedValue(true);

  beforeEach(() => {
    sessionStorage.clear();
    persist.mockClear();
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: { persisted: vi.fn().mockResolvedValue(false), persist }
    });
  });

  it("asks after authentication and requests persistence from a user action", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <StoragePermissionPrompt />
      </MemoryRouter>
    );

    expect(
      await screen.findByRole("heading", { name: /keep trip files on this device/i })
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /allow device storage/i }));

    expect(persist).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: /keep trip files/i })).not.toBeInTheDocument()
    );
  });

  it("explains that local files remain available when persistence is denied", async () => {
    persist.mockResolvedValueOnce(false);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <StoragePermissionPrompt />
      </MemoryRouter>
    );
    await user.click(await screen.findByRole("button", { name: /allow device storage/i }));
    expect(await screen.findByText(/files are still saved locally/i)).toBeInTheDocument();
  });
});
