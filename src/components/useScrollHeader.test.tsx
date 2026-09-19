import { act, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useScrollHeader } from "./useScrollHeader";

let y = 0;
function scrollTo(value: number) {
  act(() => {
    y = value;
    fireEvent.scroll(window);
  });
}

beforeEach(() => {
  y = 0;
  vi.spyOn(window, "scrollY", "get").mockImplementation(() => y);
  vi.spyOn(document.documentElement, "scrollHeight", "get").mockReturnValue(3000);
  vi.spyOn(window, "innerHeight", "get").mockReturnValue(700);
});
afterEach(() => vi.restoreAllMocks());

describe("scroll-aware headers", () => {
  it("does not hide trip tabs before a tall hero has scrolled past their sticky position", () => {
    const marker = document.createElement("div");
    marker.dataset.tripStickyStart = "";
    document.body.append(marker);
    vi.spyOn(marker, "getBoundingClientRect").mockImplementation(
      () => ({ top: 600 - y }) as DOMRect
    );
    try {
      const { result } = renderHook(() => useScrollHeader("/trips/tall-hero"));
      scrollTo(300);
      expect(result.current).toBe(false);
      scrollTo(580);
      expect(result.current).toBe(false);
      scrollTo(640);
      expect(result.current).toBe(true);
      scrollTo(639);
      expect(result.current).toBe(false);
    } finally {
      marker.remove();
    }
  });
  it("stays visible near the top, hides after downward travel, and reveals on the first upward pixel", () => {
    const { result } = renderHook(() => useScrollHeader("/trips/one"));
    scrollTo(120);
    expect(result.current).toBe(false);
    scrollTo(130);
    expect(result.current).toBe(false);
    scrollTo(145);
    expect(result.current).toBe(true);
    scrollTo(144);
    expect(result.current).toBe(false);
    scrollTo(150);
    expect(result.current).toBe(false);
    scrollTo(170);
    expect(result.current).toBe(true);
    scrollTo(0);
    expect(result.current).toBe(false);
  });

  it("reveals for keyboard navigation and when changing routes or trip tabs", () => {
    const { result, rerender } = renderHook(({ route }) => useScrollHeader(route), {
      initialProps: { route: "/trips/one" }
    });
    scrollTo(300);
    expect(result.current).toBe(true);
    act(() => {
      fireEvent.keyDown(document, { key: "Tab" });
    });
    expect(result.current).toBe(false);
    scrollTo(350);
    expect(result.current).toBe(true);
    rerender({ route: "/trips/one?view=details" });
    expect(result.current).toBe(false);
  });

  it("ignores bottom-edge rubber-band bounce", () => {
    const { result } = renderHook(() => useScrollHeader("/trips/one"));
    scrollTo(2300);
    expect(result.current).toBe(true);
    scrollTo(2350);
    scrollTo(2300);
    expect(result.current).toBe(true);
    scrollTo(2299);
    expect(result.current).toBe(false);
  });
});
