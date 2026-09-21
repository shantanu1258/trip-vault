import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventSilhouette } from "./EventSilhouette";
import { timelineEventTypes, type TimelineEventType } from "../features/trips/types";

// Exercise distinct animation branches, not a type × placement × viewport matrix.
// Responsive sizing belongs to browser QA: this component never reads viewport width.
const motionCases = [
  {
    type: "flight",
    placement: "summary",
    departure: "translate(88px, -88px)",
    arrival: "translate(-112px, 112px)"
  },
  { type: "cab", placement: "hero", departure: "translateX(137px)", arrival: "translateX(-350px)" },
  {
    type: "activity",
    placement: "modal",
    departure: "scale(.8) rotate(45deg)",
    arrival: "translateY(6px) rotate(-35deg) scale(.9)"
  },
  {
    type: "hotel_check_in",
    placement: "fallback",
    departure: "none",
    arrival: "translateY(6px) rotate(0deg) scale(.9)"
  }
] as const;
const cancel = vi.fn();
const animate = vi.fn(() => ({ cancel }));
let originalAnimate: PropertyDescriptor | undefined;

beforeEach(() => {
  cancel.mockClear();
  animate.mockClear();
  originalAnimate = Object.getOwnPropertyDescriptor(Element.prototype, "animate");
  Object.defineProperty(Element.prototype, "animate", { configurable: true, value: animate });
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    if (this.matches("article")) return { top: 10, right: 375 } as DOMRect;
    if (this.matches("section")) return { left: 20, bottom: 400 } as DOMRect;
    return (
      this.getAttribute("data-silhouette-placement") === "header"
        ? { left: 250, top: 20, bottom: 86, right: 346, width: 96, height: 66 }
        : { left: 230, top: 300, right: 358, bottom: 388, width: 128, height: 88 }
    ) as DOMRect;
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalAnimate) Object.defineProperty(Element.prototype, "animate", originalAnimate);
  else delete (Element.prototype as unknown as { animate?: unknown }).animate;
});

function pairedCard(type: TimelineEventType, expanded: boolean) {
  return (
    <article>
      <EventSilhouette type={type} expanded={expanded} />
      <section>
        <EventSilhouette type={type} placement="summary" />
      </section>
    </article>
  );
}

describe("event background silhouettes", () => {
  it("provides non-interactive decorative artwork for every event type", () => {
    const { container } = render(
      <>
        {timelineEventTypes.map((type) => (
          <EventSilhouette key={type} type={type} />
        ))}
      </>
    );
    for (const type of timelineEventTypes) {
      const artwork = container.querySelector(`[data-event-type="${type}"]`)!;
      expect(artwork, type).toHaveAttribute("aria-hidden", "true");
      expect(artwork.querySelector("svg"), type).toHaveAttribute("focusable", "false");
      expect(artwork.querySelector("svg path"), type).not.toBeNull();
    }
    expect(animate).not.toHaveBeenCalled();
  });

  it("uses planning artwork with the existing preparation tone", () => {
    const { container } = render(<EventSilhouette type="preparation" />);
    expect(container.firstChild).toHaveClass("event-type-icon--preparation");
    expect(container.querySelector('[data-silhouette-art="planning"]')).toBeInTheDocument();
    expect(container.querySelector(".silhouette-planning-route")).toHaveAttribute(
      "pathLength",
      "1"
    );
  });

  it.each(motionCases)(
    "opens $type artwork once in $placement and cancels on unmount",
    ({ type, placement, arrival }) => {
      const card = (
        <section>
          <EventSilhouette type={type} placement={placement} />
        </section>
      );
      const view = render(card);
      expect(animate).toHaveBeenCalledTimes(1);
      expect(animate).toHaveBeenCalledWith(
        [
          expect.objectContaining({ opacity: 0, transform: arrival }),
          expect.objectContaining({ transform: "translateY(0) rotate(0) scale(1)" })
        ],
        expect.objectContaining({ delay: 0 })
      );
      view.rerender(
        <section>
          <EventSilhouette type={type} placement={placement} />
        </section>
      );
      expect(animate).toHaveBeenCalledTimes(1);
      view.unmount();
      expect(cancel).toHaveBeenCalledTimes(1);
    }
  );

  // The paired header path remains supported by the component even though current
  // timeline headers use icons. Keep one case per distinct departure branch.
  it.each(motionCases)(
    "pairs $type departure/arrival and cancels both on collapse",
    ({ type, departure, arrival }) => {
      const view = render(pairedCard(type, false));
      expect(animate).not.toHaveBeenCalled();
      view.rerender(pairedCard(type, true));
      expect(animate).toHaveBeenCalledTimes(2);
      expect(animate).toHaveBeenNthCalledWith(
        1,
        expect.arrayContaining([expect.objectContaining({ transform: departure, opacity: 0 })]),
        expect.any(Object)
      );
      expect(animate).toHaveBeenNthCalledWith(
        2,
        expect.arrayContaining([expect.objectContaining({ transform: arrival, opacity: 0 })]),
        expect.any(Object)
      );
      view.rerender(pairedCard(type, false));
      expect(cancel).toHaveBeenCalledTimes(2);
    }
  );

  it("keeps both standalone and paired artwork static under reduced motion", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const { container } = render(
      <>
        {pairedCard("flight", true)}
        <section>
          <EventSilhouette type="activity" placement="hero" />
        </section>
      </>
    );
    expect(container.querySelectorAll("svg")).toHaveLength(3);
    expect(animate).not.toHaveBeenCalled();
  });

  it("still renders artwork when the browser has no animation API", () => {
    delete (Element.prototype as unknown as { animate?: unknown }).animate;
    const { container } = render(
      <section>
        <EventSilhouette type="flight" placement="hero" />
      </section>
    );
    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});
