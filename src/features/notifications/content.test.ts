import { describe, expect, it } from "vitest";
import { pushChangeContent } from "../../../supabase/functions/_shared/push-content";

const base = { action: "updated", item_title: "Airport taxi", trip_title: "Bali trip" };
describe("specific push change content", () => {
  it("names upcoming journeys and uses departure-local time for early and one-hour reminders", () => {
    const details = {
      reminder_stage: "five_days",
      item_title: "Delhi to Singapore",
      trip_title: "Holiday",
      event_type: "flight",
      after: { starts_at: "2026-09-28T04:00:00Z", timezone: "Asia/Kolkata", timing_mode: "exact" }
    };
    expect(pushChangeContent("reminder", details)).toEqual({
      title: "Flight coming up: Delhi to Singapore",
      body: "Holiday · 28 Sept 2026, 09:30 (Asia/Kolkata) · Review your journey and documents."
    });
    expect(pushChangeContent("reminder", { ...details, event_type: "bus" })?.title).toBe(
      "Bus coming up: Delhi to Singapore"
    );
    expect(pushChangeContent("reminder", { ...details, reminder_stage: "one_hour" })?.title).toBe(
      "Flight starting soon: Delhi to Singapore"
    );
  });
  it("distinguishes new, edited and restored records without guessing legacy actions", () => {
    expect(pushChangeContent("event", { ...base, action: "created" })?.title).toBe(
      "Event created: Airport taxi"
    );
    expect(pushChangeContent("booking", { ...base, action: "restored" })?.title).toBe(
      "Booking restored: Airport taxi"
    );
    expect(pushChangeContent("event", null)).toBeNull();
    expect(pushChangeContent("event", { ...base, action: "unknown" })).toBeNull();
    expect(pushChangeContent("reminder", base)).toBeNull();
  });
  it("shows currency-correct amounts before and after and payment status", () => {
    expect(
      pushChangeContent("cost", {
        ...base,
        changed_fields: ["amount_minor", "payment_status"],
        before: { amount_minor: 80000, currency_code: "INR", payment_status: "planned" },
        after: { amount_minor: 95000, currency_code: "INR", payment_status: "paid" }
      })
    ).toEqual({
      title: "Expense updated: Airport taxi",
      body: "Bali trip · Amount: INR 800.00 → INR 950.00; Payment status: planned → paid"
    });
    expect(
      pushChangeContent("cost", {
        ...base,
        action: "created",
        after: { amount_minor: 950, currency_code: "JPY" }
      })?.body
    ).toContain("JPY 950");
    expect(
      pushChangeContent("cost", {
        ...base,
        action: "created",
        after: { amount_minor: 950, currency_code: "KWD" }
      })?.body
    ).toContain("KWD 0.950");
  });
  it("formats an event reschedule in its own time zone, retaining the original values", () => {
    const before = {
      starts_at: "2026-09-23T04:00:00Z",
      timezone: "Asia/Kolkata",
      timing_mode: "exact"
    };
    const after = { ...before, starts_at: "2026-09-23T05:00:00Z" };
    const result = pushChangeContent("event", {
      ...base,
      changed_fields: ["starts_at"],
      before,
      after
    });
    expect(result?.body).toContain("09:30 (Asia/Kolkata) → 23 Sept 2026, 10:30 (Asia/Kolkata)");
    expect(
      pushChangeContent("event", {
        ...base,
        changed_fields: ["starts_at"],
        before,
        after: { ...after, timing_mode: "relative", has_explicit_start_time: false }
      })?.body
    ).toContain("→ Not timed");
  });
  it("reports private field changes without showing their values, and bounds long output", () => {
    expect(
      pushChangeContent("event", {
        ...base,
        changed_fields: ["timezone"],
        before: { timezone: "America/New_York" },
        after: { timezone: "America/Los_Angeles" }
      })?.body
    ).toContain("America/New_York → America/Los_Angeles");
    const output = pushChangeContent("booking", {
      ...base,
      changed_fields: ["notes", "reference_code", "details", "provider"],
      before: { notes: "secret", reference_code: "PNR123", details: { password: "secret" } },
      after: { notes: "another secret", reference_code: "PNR456" }
    });
    expect(output?.body).toBe(
      "Bali trip · Notes changed; Booking reference changed; Booking details changed; +1 more changes"
    );
    expect(JSON.stringify(output)).not.toMatch(/secret|PNR/);
    const long = pushChangeContent("event", {
      ...base,
      item_title: "x".repeat(1000),
      trip_title: "z".repeat(1000),
      changed_fields: ["title", "timezone", "event_status"],
      before: { title: "a".repeat(1000), timezone: "b".repeat(1000) },
      after: { title: "c".repeat(1000), timezone: "d".repeat(1000) }
    });
    expect(long!.title.length).toBeLessThanOrEqual(200);
    expect(long!.body.length).toBeLessThanOrEqual(360);
  });
});
