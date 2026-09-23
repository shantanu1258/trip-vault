import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

function worker() {
  const handlers = new Map<string, (event: unknown) => void>();
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const openWindow = vi.fn().mockResolvedValue(undefined);
  runInNewContext(readFileSync("public/push-worker.js", "utf8"), {
    URL,
    self: {
      location: { origin: "https://trip.test" },
      addEventListener: (name: string, handler: (event: unknown) => void) =>
        handlers.set(name, handler),
      registration: { showNotification },
      clients: { openWindow }
    }
  });
  async function dispatch(name: string, event: object) {
    let work: Promise<unknown> | undefined;
    handlers.get(name)!({
      ...event,
      waitUntil: (promise: Promise<unknown>) => {
        work = promise;
      }
    });
    await work;
  }
  return { dispatch, showNotification, openWindow };
}

describe("notification service worker", () => {
  it("displays specific change text and opens the exact same-origin destination on tap", async () => {
    const { dispatch, showNotification, openWindow } = worker();
    await dispatch("push", {
      data: {
        json: () => ({
          kind: "cost",
          title: "Expense updated: Airport taxi",
          body: "Bali trip · Amount: INR 800.00 → INR 950.00",
          url: "https://trip.test/trips/trip-1?cost=cost-1",
          tag: "cost-1"
        })
      }
    });
    expect(showNotification).toHaveBeenCalledWith(
      "Expense updated: Airport taxi",
      expect.objectContaining({
        body: "Bali trip · Amount: INR 800.00 → INR 950.00",
        data: { url: "/trips/trip-1?cost=cost-1" },
        tag: "cost-1"
      })
    );
    const close = vi.fn();
    await dispatch("notificationclick", {
      notification: { close, data: { url: "/trips/trip-1?cost=cost-1" } }
    });
    expect(close).toHaveBeenCalledOnce();
    expect(openWindow).toHaveBeenCalledWith("https://trip.test/trips/trip-1?cost=cost-1");
  });
  it("keeps generic copy for older jobs and bounds malformed text", async () => {
    const { dispatch, showNotification } = worker();
    await dispatch("push", { data: { json: () => ({ kind: "event" }) } });
    expect(showNotification).toHaveBeenLastCalledWith(
      "Trip Vault",
      expect.objectContaining({
        body: "A trip event was added or updated. Open Trip Vault to review it."
      })
    );
    await dispatch("push", {
      data: { json: () => ({ title: "x".repeat(500), body: "\u202e" + "y".repeat(700) }) }
    });
    expect(showNotification).toHaveBeenLastCalledWith(
      "x".repeat(200),
      expect.objectContaining({ body: "y".repeat(360) })
    );
  });
  it("falls back safely for malformed payloads and external links", async () => {
    const { dispatch, showNotification, openWindow } = worker();
    await dispatch("push", {
      data: {
        json: () => {
          throw new Error("bad JSON");
        }
      }
    });
    expect(showNotification).toHaveBeenLastCalledWith(
      "Trip Vault",
      expect.objectContaining({ data: { url: "/trips" } })
    );
    await dispatch("push", { data: { json: () => ({ url: "https://evil.test", kind: "test" }) } });
    expect(showNotification).toHaveBeenLastCalledWith(
      "Trip Vault",
      expect.objectContaining({ data: { url: "/trips" } })
    );
    await dispatch("notificationclick", {
      notification: { close: vi.fn(), data: { url: "https://evil.test" } }
    });
    expect(openWindow).not.toHaveBeenCalled();
  });
});
