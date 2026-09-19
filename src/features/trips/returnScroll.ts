import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { readTripScrollRestore } from "./navigation";

export function restoreTripReturnScroll(state: unknown, tripId: string, path: string) {
  const scroll = readTripScrollRestore(state, tripId, path);
  if (!scroll) return false;
  const anchor = scroll.anchorId ? document.getElementById(scroll.anchorId) : null;
  const top =
    anchor && typeof scroll.anchorOffset === "number"
      ? window.scrollY + anchor.getBoundingClientRect().top - scroll.anchorOffset
      : scroll.y;
  // "auto" inherits the site's smooth scrolling and can race a route's top reset.
  window.scrollTo({ top: Math.max(0, top), behavior: "instant" });
  return true;
}

export function useTripReturnScroll(tripId: string, ready: boolean) {
  const location = useLocation();
  const restored = useRef<string>();
  useEffect(() => {
    if (!ready || restored.current === location.key) return;
    const frame = requestAnimationFrame(() => {
      if (restoreTripReturnScroll(location.state, tripId, `${location.pathname}${location.search}`))
        restored.current = location.key;
    });
    return () => cancelAnimationFrame(frame);
  }, [location, ready, tripId]);
}
