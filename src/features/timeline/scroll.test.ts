import { afterEach, describe, expect, it, vi } from "vitest";
import { preferredScrollBehavior, scrollTimelineEventIntoView } from "./scroll";

describe("timeline positioning", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("places the event's phase and date context just below the sticky header", () => {
    const header = document.createElement("header");
    header.className = "sticky";
    vi.spyOn(header, "getBoundingClientRect").mockReturnValue({ bottom: 76 } as DOMRect);
    const phase = document.createElement("div");
    phase.id = "timeline-phase-future";
    vi.spyOn(phase, "getBoundingClientRect").mockReturnValue({ top: 300 } as DOMRect);
    const date = document.createElement("h3");
    const card = document.createElement("article");
    card.id = "timeline-current";
    vi.spyOn(card, "getBoundingClientRect").mockReturnValue({ top: 500 } as DOMRect);
    vi.spyOn(window, "scrollY", "get").mockReturnValue(200);
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    document.body.append(header, phase, date, card);
    expect(scrollTimelineEventIntoView("current")).toBe(true);
    expect(scrollTo).toHaveBeenCalledWith({ behavior: "smooth", top: 396 });
    expect(card).not.toHaveClass("timeline-focus-pulse");
    window.dispatchEvent(new Event("scrollend"));
    expect(card).toHaveClass("timeline-focus-pulse");
  });

  it("uses the event itself when it has no date or phase heading", () => {
    const card = document.createElement("article");
    card.id = "timeline-current";
    vi.spyOn(card, "getBoundingClientRect").mockReturnValue({ top: 300 } as DOMRect);
    vi.spyOn(window, "scrollY", "get").mockReturnValue(200);
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    document.body.append(card);
    expect(scrollTimelineEventIntoView("current", "auto")).toBe(true);
    expect(scrollTo).toHaveBeenCalledWith({ behavior: "auto", top: 396 });
    expect(card).toHaveClass("timeline-focus-pulse");
  });

  it("removes the focus pulse after its animation finishes", () => {
    const card = document.createElement("article");
    card.id = "timeline-current";
    vi.spyOn(card, "getBoundingClientRect").mockReturnValue({ top: 300 } as DOMRect);
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    document.body.append(card);
    scrollTimelineEventIntoView("current", "auto");
    const animationEnd = new Event("animationend", { bubbles: true });
    Object.defineProperty(animationEnd, "animationName", { value: "timeline-focus-pulse" });
    card.dispatchEvent(animationEnd);
    expect(card).not.toHaveClass("timeline-focus-pulse");
  });

  it("returns false until the timeline card has been rendered", () => {
    expect(scrollTimelineEventIntoView("missing")).toBe(false);
  });

  it("respects reduced-motion preferences", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true }))
    );
    expect(preferredScrollBehavior()).toBe("auto");
  });
});
