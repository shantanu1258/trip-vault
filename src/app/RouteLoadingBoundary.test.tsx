import { act, render, screen } from "@testing-library/react";
import { lazy } from "react";
import { expect, it, vi } from "vitest";
import { RouteLoadingBoundary } from "./RouteLoadingBoundary";

it("shows an accessible loading state until a screen is ready", async () => {
  let resolve!: (value: { default: () => JSX.Element }) => void;
  const Screen = lazy(
    () =>
      new Promise<{ default: () => JSX.Element }>((done) => {
        resolve = done;
      })
  );
  render(
    <RouteLoadingBoundary reloadHref="/vault">
      <Screen />
    </RouteLoadingBoundary>
  );
  expect(screen.getByRole("status")).toHaveTextContent("Opening screen");
  await act(async () => {
    resolve({ default: () => <h1>Vault ready</h1> });
  });
  expect(await screen.findByRole("heading", { name: "Vault ready" })).toBeInTheDocument();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it("offers recovery after a failed chunk and resets for a different route", async () => {
  const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
  try {
    const Screen = lazy(() => Promise.reject(new Error("Chunk unavailable offline")));
    const { rerender } = render(
      <RouteLoadingBoundary key="cost" reloadHref="/trips/example?view=details#costs">
        <Screen />
      </RouteLoadingBoundary>
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("This screen couldn’t open");
    expect(screen.getByRole("link", { name: "Reload this page" })).toHaveAttribute(
      "href",
      "/trips/example?view=details#costs"
    );
    expect(screen.getByRole("link", { name: "Go home" })).toHaveAttribute("href", "/");
    rerender(
      <RouteLoadingBoundary key="vault" reloadHref="/vault">
        <h1>Vault ready</h1>
      </RouteLoadingBoundary>
    );
    expect(screen.getByRole("heading", { name: "Vault ready" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  } finally {
    errorLog.mockRestore();
  }
});
