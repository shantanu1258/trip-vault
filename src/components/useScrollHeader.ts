import { useEffect, useState } from "react";

/** Hide only after deliberate downward travel; any upward movement reveals. */
export function useScrollHeader(routeKey: string) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let previousY = Math.max(0, window.scrollY);
    let downwardTravel = 0;
    setHidden(false);
    const reveal = () => {
      downwardTravel = 0;
      setHidden(false);
    };
    const onScroll = () => {
      // Clamp overscroll at both ends so iOS bounce isn't a direction change.
      const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const y = Math.max(0, Math.min(window.scrollY, maxY));
      const delta = y - previousY;
      previousY = y;
      const focused = document.activeElement;
      const keyboardInHeader =
        focused?.matches(":focus-visible") &&
        focused.closest("[data-scroll-header], [data-trip-sticky]");
      // A trip's tabs may start below a tall hero. Do not hide them before
      // they have reached their sticky position and content has scrolled past.
      const stickyStart = document.querySelector("[data-trip-sticky-start]");
      const headerHeight =
        document.querySelector("[data-scroll-header]")?.getBoundingClientRect().height ?? 56;
      const hideAfter = stickyStart
        ? Math.max(120, stickyStart.getBoundingClientRect().top + y - headerHeight + 64)
        : 120;
      if (y <= hideAfter || delta < 0 || keyboardInHeader) {
        reveal();
      } else if (delta > 0) {
        downwardTravel += delta;
        if (downwardTravel >= 24) setHidden(true);
      }
    };
    const onFocus = (event: FocusEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest("[data-scroll-header], [data-trip-sticky]")
      )
        reveal();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Tab") reveal();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("focusin", onFocus);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("keydown", onKey);
    };
  }, [routeKey]);
  return hidden;
}
