import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { InstallAppButton, InstallAppManager } from "./InstallAppButton";

describe("install guidance", () => {
  it("opens clear iPhone and Android Home Screen instructions", async () => {
    const user = userEvent.setup();
    render(
      <>
        <InstallAppManager />
        <InstallAppButton />
      </>
    );

    await user.click(screen.getByRole("button", { name: "Install Trip Vault" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /add trip vault to your home screen/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /install using safari/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /install using chrome/i })).toBeInTheDocument();
    expect(screen.getByText(/choose add to home screen/i)).toBeInTheDocument();
  });
});
