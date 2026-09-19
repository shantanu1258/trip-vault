import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EventSilhouette } from "./EventSilhouette";
import { timelineEventTypes } from "../features/trips/types";

describe("event background silhouettes", () => {
  it.each([
    ["flight", "flight"],
    ["hotel_check_in", "hotel"],
    ["hotel_check_out", "hotel"],
    ["cab", "cab"]
  ] as const)("uses the existing %s color and stays decorative", (type, tone) => {
    const { container, rerender } = render(<EventSilhouette type={type} />);
    const artwork = container.firstElementChild!;
    expect(artwork).toHaveAttribute("aria-hidden", "true");
    expect(artwork).toHaveClass(`event-type-icon--${tone}`);
    expect(artwork).toHaveAttribute("data-expanded", "false");
    expect(artwork.querySelector("svg")).toHaveAttribute("focusable", "false");
    rerender(<EventSilhouette type={type} expanded />);
    expect(artwork).toHaveAttribute("data-expanded", "true");
  });

  it("provides decorative artwork for every event type", () => {
    for (const type of timelineEventTypes) {
      const { container } = render(<EventSilhouette type={type} />);
      expect(container.querySelector("svg path")).not.toBeNull();
    }
  });

  it("animates transport between the actual header and lower card, and cancels on collapse", () => {
    const cancel = vi.fn();
    const animate = vi.fn(() => ({ cancel }));
    const bounds = vi
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: Element) {
        if (this.matches("article")) return { top: 10, right: 375 } as DOMRect;
        return (
          this.getAttribute("data-silhouette-placement") === "header"
            ? { left: 10, top: 20, bottom: 90, width: 100, height: 70 }
            : { left: 50, top: 230, right: 210, bottom: 340, width: 160, height: 110 }
        ) as DOMRect;
      });
    Object.defineProperty(Element.prototype, "animate", { configurable: true, value: animate });
    const card = (expanded: boolean) => (
      <article>
        <button>
          <EventSilhouette type="flight" expanded={expanded} />
        </button>
        <section>
          <EventSilhouette type="flight" placement="summary" />
        </section>
      </article>
    );
    const view = render(card(false));
    view.rerender(card(true));
    expect(animate).toHaveBeenCalledTimes(2);
    expect(animate).toHaveBeenNthCalledWith(
      1,
      expect.arrayContaining([expect.objectContaining({ transform: "translate(92px, -92px)" })]),
      expect.objectContaining({ duration: 450 })
    );
    view.rerender(card(false));
    expect(cancel).toHaveBeenCalledTimes(2);
    view.unmount();
    bounds.mockRestore();
    delete (Element.prototype as unknown as { animate?: unknown }).animate;
  });

  it.each(["header", "modal", "hero"] as const)(
    "uses static %s artwork when reduced motion is requested",
    (placement) => {
      const animate = vi.fn();
      Object.defineProperty(Element.prototype, "animate", { configurable: true, value: animate });
      vi.stubGlobal("matchMedia", () => ({ matches: true }));
      const view = render(
        <article>
          <EventSilhouette type="flight" placement={placement} expanded />
          <EventSilhouette type="flight" placement="summary" />
        </article>
      );
      expect(animate).not.toHaveBeenCalled();
      expect(
        view.container.querySelector(`[data-silhouette-placement="${placement}"]`)
      ).toHaveAttribute("data-expanded", "true");
      view.unmount();
      vi.unstubAllGlobals();
      delete (Element.prototype as unknown as { animate?: unknown }).animate;
    }
  );

  it.each(
    (
      ["flight", "cab", "train", "ferry", "bus", "transport", "activity", "hotel_check_in"] as const
    ).flatMap((type) => [375, 768, 1280].map((width) => ({ type, width })))
  )(
    "uses the same transition for $type at $width px without changing its resting destination",
    ({ type, width }) => {
      const cancel = vi.fn();
      const animate = vi.fn(() => ({ cancel }));
      vi.stubGlobal("matchMedia", (query: string) => ({
        matches: query === "(max-width: 767px)" && width < 768
      }));
      Object.defineProperty(Element.prototype, "animate", { configurable: true, value: animate });
      const bounds = vi
        .spyOn(Element.prototype, "getBoundingClientRect")
        .mockImplementation(function (this: Element) {
          if (this.matches("article")) return { top: 10, right: 375 } as DOMRect;
          if (this.matches("section")) return { left: 20, bottom: 400 } as DOMRect;
          return (
            this.getAttribute("data-silhouette-placement") === "header"
              ? { left: 250, top: 20, bottom: 86, right: 346, width: 96, height: 66 }
              : { left: 230, top: 300, right: 358, bottom: 388, width: 128, height: 88 }
          ) as DOMRect;
        });
      const card = (expanded: boolean) => (
        <article>
          <button>
            <EventSilhouette type={type} expanded={expanded} />
          </button>
          <section>
            <EventSilhouette type={type} placement="summary" />
          </section>
        </article>
      );
      const view = render(card(false));
      try {
        view.rerender(card(true));
        const hotel = type === "hotel_check_in";
        const activity = type === "activity";
        expect(animate).toHaveBeenCalledTimes(2);
        expect(animate).toHaveBeenNthCalledWith(
          1,
          expect.arrayContaining([
            expect.objectContaining({
              transform: hotel
                ? "none"
                : activity
                  ? "scale(.8) rotate(45deg)"
                  : type === "flight"
                    ? "translate(88px, -88px)"
                    : "translateX(137px)",
              opacity: 0
            })
          ]),
          expect.objectContaining({ duration: hotel ? 700 : activity ? 350 : 450 })
        );
        expect(animate).toHaveBeenNthCalledWith(
          2,
          [
            {
              opacity: 0,
              transform: hotel
                ? "translateY(6px) rotate(0deg) scale(.9)"
                : activity
                  ? "translateY(6px) rotate(-35deg) scale(.9)"
                  : type === "flight"
                    ? "translate(-112px, 112px)"
                    : "translateX(-350px)"
            },
            { opacity: 0.12, transform: "translateY(0) rotate(0) scale(1)" }
          ],
          expect.objectContaining({
            duration: hotel || activity ? 500 : 650,
            delay: hotel ? 450 : activity ? 250 : 350
          })
        );
        view.rerender(card(false));
        expect(cancel).toHaveBeenCalledTimes(2);
      } finally {
        view.unmount();
        bounds.mockRestore();
        vi.unstubAllGlobals();
        delete (Element.prototype as unknown as { animate?: unknown }).animate;
      }
    }
  );

  it.each(
    timelineEventTypes.flatMap((type) =>
      (["modal", "hero", "summary", "fallback"] as const).map((placement) => ({ type, placement }))
    )
  )(
    "animates $type on opening the $placement, not on ordinary rerenders",
    ({ type, placement }) => {
      const cancel = vi.fn();
      const animate = vi.fn(() => ({ cancel }));
      Object.defineProperty(Element.prototype, "animate", { configurable: true, value: animate });
      vi.stubGlobal("matchMedia", () => ({ matches: false }));
      const bounds = vi
        .spyOn(Element.prototype, "getBoundingClientRect")
        .mockImplementation(function (this: Element) {
          return (
            this.matches("section")
              ? { left: 20, bottom: 400 }
              : { left: 230, top: 300, right: 358, bottom: 388, width: 128, height: 88 }
          ) as DOMRect;
        });
      const card = (
        <section>
          <EventSilhouette type={type} placement={placement} />
        </section>
      );
      const view = render(card);
      try {
        const moves = ["flight", "cab", "bus", "ferry", "train", "transport"].includes(type);
        expect(animate).toHaveBeenCalledTimes(1);
        expect(animate).toHaveBeenCalledWith(
          [
            {
              opacity: 0,
              transform: moves
                ? type === "flight"
                  ? "translate(-112px, 112px)"
                  : "translateX(-350px)"
                : `translateY(6px) rotate(${type === "activity" ? -35 : 0}deg) scale(.9)`
            },
            { opacity: 0.12, transform: "translateY(0) rotate(0) scale(1)" }
          ],
          expect.objectContaining({ duration: moves ? 650 : 500, delay: 0 })
        );
        view.rerender(
          <section>
            <EventSilhouette type={type} placement={placement} />
          </section>
        );
        expect(animate).toHaveBeenCalledTimes(1);
      } finally {
        view.unmount();
        expect(cancel).toHaveBeenCalledTimes(1);
        bounds.mockRestore();
        vi.unstubAllGlobals();
        delete (Element.prototype as unknown as { animate?: unknown }).animate;
      }
    }
  );
});
