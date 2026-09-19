import { afterEach, describe, expect, it, vi } from "vitest";
import {
  preferredScrollBehavior,
  revealExpandedTimelineEvent,
  scrollTimelineEventIntoView
} from "./scroll";

function expandedViewport(top: number, height: number, hiddenHeaders = false) {
  const bounds = (top: number, height: number) =>
    ({ top, bottom: top + height, height, width: 375 }) as DOMRect;
  const header = document.createElement("header");
  header.dataset.scrollHeader = "true";
  vi.spyOn(header, "getBoundingClientRect").mockReturnValue(bounds(hiddenHeaders ? -60 : 0, 60));
  const tabs = document.createElement("div");
  tabs.dataset.tripSticky = "true";
  vi.spyOn(tabs, "getBoundingClientRect").mockReturnValue(bounds(hiddenHeaders ? -50 : 60, 50));
  const dock = document.createElement("div");
  dock.dataset.tripActions = "true";
  vi.spyOn(dock, "getBoundingClientRect").mockReturnValue(bounds(600, 54));
  const card = document.createElement("article");
  card.id = "timeline-expanded";
  const trigger = document.createElement("button");
  trigger.dataset.timelineTrigger = "true";
  trigger.setAttribute("aria-expanded", "true");
  card.append(trigger);
  vi.spyOn(card, "getBoundingClientRect").mockReturnValue(bounds(top, height));
  document.body.append(header, tabs, card, dock);
  vi.spyOn(window, "scrollY", "get").mockReturnValue(100);
  vi.spyOn(window, "innerHeight", "get").mockReturnValue(800);
  const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  return { card, trigger, scrollTo };
}

describe("timeline positioning", () => {
  it("keeps a grouped date visible below both sticky headers", () => {
    const header = document.createElement("header");
    header.className = "sticky";
    vi.spyOn(header, "getBoundingClientRect").mockReturnValue({ bottom: 76 } as DOMRect);
    const tripHeader = document.createElement("div");
    tripHeader.dataset.tripSticky = "true";
    vi.spyOn(tripHeader, "getBoundingClientRect").mockReturnValue({ height: 169 } as DOMRect);
    const date = document.createElement("h3");
    vi.spyOn(date, "getBoundingClientRect").mockReturnValue({ top: 500 } as DOMRect);
    const group = document.createElement("div");
    const card = document.createElement("article");
    card.id = "timeline-grouped";
    card.className = "timeline-outline-card";
    group.append(card);
    document.body.append(header, tripHeader, date, group);
    vi.spyOn(window, "scrollY", "get").mockReturnValue(0);
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    scrollTimelineEventIntoView("grouped", "auto");
    expect(scrollTo).toHaveBeenCalledWith({ top: 235, behavior: "auto" });
  });
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("does not move a newly expanded card that already fits above the dock", () => {
    const { scrollTo } = expandedViewport(160, 200);
    expect(revealExpandedTimelineEvent("expanded")).toBe(false);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("scrolls only enough to clear the floating controls for a fitting card", () => {
    const { card, scrollTo } = expandedViewport(400, 230);
    expect(revealExpandedTimelineEvent("expanded")).toBe(true);
    expect(scrollTo).toHaveBeenCalledWith({ top: 142, behavior: "smooth" });
    expect(card).not.toHaveClass("timeline-focus-pulse");
  });

  it("aligns a taller card's heading below both headers", () => {
    const { scrollTo } = expandedViewport(350, 700);
    revealExpandedTimelineEvent("expanded");
    expect(scrollTo).toHaveBeenCalledWith({ top: 328, behavior: "smooth" });
  });

  it("reveals a heading covered by sticky bars and respects reduced motion", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true }))
    );
    const { scrollTo } = expandedViewport(80, 200);
    revealExpandedTimelineEvent("expanded");
    expect(scrollTo).toHaveBeenCalledWith({ top: 58, behavior: "auto" });
  });

  it("does not scroll already visible content just because the headers are hidden", () => {
    const { scrollTo } = expandedViewport(20, 200, true);
    expect(revealExpandedTimelineEvent("expanded")).toBe(false);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("ignores a card that was collapsed before the scheduled measurement", () => {
    const { trigger, scrollTo } = expandedViewport(350, 700);
    trigger.setAttribute("aria-expanded", "false");
    expect(revealExpandedTimelineEvent("expanded")).toBe(false);
    expect(revealExpandedTimelineEvent("missing")).toBe(false);
    expect(scrollTo).not.toHaveBeenCalled();
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
