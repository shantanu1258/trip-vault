import { afterEach, describe, expect, it, vi } from "vitest";
import { preferredScrollBehavior, scrollTimelineEventIntoView } from "./scroll";

describe("timeline positioning", () => {
  afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });

  it("centers the requested event instead of restoring an unrelated page position", () => {
    const card = document.createElement("article");
    card.id = "timeline-current";
    card.scrollIntoView = vi.fn();
    document.body.append(card);
    expect(scrollTimelineEventIntoView("current")).toBe(true);
    expect(card.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
  });

  it("returns false until the timeline card has been rendered", () => {
    expect(scrollTimelineEventIntoView("missing")).toBe(false);
  });

  it("respects reduced-motion preferences", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    expect(preferredScrollBehavior()).toBe("auto");
  });
});
