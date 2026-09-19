import { describe, expect, it } from "vitest";
import {
  allowedPushEndpoint,
  deliveryResult,
  notificationPath
} from "../../../supabase/functions/_shared/push-policy";
import { notificationDestination } from "./destination";
import { applicationServerKey, publicPushKey } from "./config";

describe("push boundaries", () => {
  it("accepts the configured public key and rejects a malformed key", () => {
    expect(applicationServerKey(publicPushKey)).toHaveLength(65);
    expect(() => applicationServerKey("not-a-key")).toThrow();
  });
  it("limits outbound requests to browser push services, without credentials or custom ports", () => {
    expect(allowedPushEndpoint("https://fcm.googleapis.com/fcm/send/token")).toBe(true);
    expect(allowedPushEndpoint("https://web.push.apple.com/token")).toBe(true);
    expect(allowedPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/token")).toBe(
      true
    );
    for (const endpoint of [
      "http://127.0.0.1/test",
      "https://evil.test",
      "https://fcm.googleapis.com.evil.test/token",
      "https://user:password@fcm.googleapis.com/token",
      "https://fcm.googleapis.com:8443/token",
      "not a URL"
    ]) {
      expect(allowedPushEndpoint(endpoint)).toBe(false);
    }
  });
  it("round trips event and expense IDs into safe cold-start destinations", () => {
    const timeline = new URL(
      notificationPath("event", "trip-1", "event-1", "job-1"),
      "https://example.test"
    );
    expect(notificationDestination(timeline.search)).toEqual({ kind: "timeline", id: "event-1" });
    expect(timeline.searchParams.get("notification")).toBe("job-1");
    const cost = new URL(
      notificationPath("cost", "trip-1", "cost-1", "job-2"),
      "https://example.test"
    );
    expect(notificationDestination(cost.search)).toEqual({ kind: "cost", id: "cost-1" });
    expect(notificationPath("booking", "trip-1", "booking-1", "job-3")).toBe(
      "/trips/trip-1/bookings/booking-1"
    );
    expect(notificationDestination("?focus=event&cost=cost")).toBeNull();
    expect(notificationDestination("?focus=https://evil.test")).toBeNull();
  });
  it("retries transient errors but removes expired subscriptions and stops permanent failures", () => {
    expect(deliveryResult(201)).toBe("sent");
    expect(deliveryResult(410)).toBe("expired");
    expect(deliveryResult(404)).toBe("expired");
    expect(deliveryResult(429)).toBe("retry");
    expect(deliveryResult(503)).toBe("retry");
    expect(deliveryResult(401)).toBe("failed");
    expect(deliveryResult(400)).toBe("failed");
  });
});
