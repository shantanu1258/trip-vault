import { describe, expect, it } from "vitest";
import { formatDurationBetween, formatDurationMinutes } from "./formatDuration";

describe("duration display", () => {
  it("uses hours through exactly 24 hours and days after that", () => {
    expect(formatDurationMinutes(24 * 60)).toBe("24h");
    expect(formatDurationMinutes(24 * 60 + 1)).toBe("1d 1m");
    expect(formatDurationMinutes(2 * 24 * 60 + 3 * 60 + 30)).toBe("2d 3h 30m");
  });

  it("uses days through exactly seven days and weeks after that", () => {
    expect(formatDurationMinutes(7 * 24 * 60)).toBe("7d");
    expect(formatDurationMinutes(8 * 24 * 60 + 4 * 60)).toBe("1w 1d 4h");
  });

  it("supports readable long labels and elapsed instants", () => {
    expect(formatDurationMinutes(90, { style: "long" })).toBe("1 hour 30 minutes");
    expect(formatDurationBetween("2026-09-01T00:00:00Z", "2026-09-10T04:00:00Z")).toBe("1w 2d 4h");
  });
});
