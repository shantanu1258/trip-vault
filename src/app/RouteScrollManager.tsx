import { useEffect, useLayoutEffect, useRef } from "react";
import { matchPath, useLocation } from "react-router-dom";
import { readTripEntry, readTripNavigationIntent } from "../features/trips/navigation";

/**
 * Gives each real page navigation a clean starting position without touching
 * query-string or anchor navigation. TripPage uses its query string for timeline/detail
 * views and owns its more specific per-trip restoration behavior.
 */
export function RouteScrollManager() {
  const { pathname, state } = useLocation();
  const previousPathname = useRef<string>();

  useLayoutEffect(() => {
    // Native section links can clear history state on their first click. That
    // is still the same page: do not override the browser's anchor scrolling.
    if (previousPathname.current === pathname) return;
    previousPathname.current = pathname;
    const tripRoute = matchPath({ path: "/trips/:tripId", end: true }, pathname);
    const tripId = tripRoute?.params.tripId;
    const intent = tripId ? readTripNavigationIntent(state, tripId) : null;
    if (tripId && (intent?.kind === "restore" || readTripEntry(state, tripId))) return;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname, state]);

  useEffect(() => {
    if (!("scrollRestoration" in window.history)) return;
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    return () => {
      window.history.scrollRestoration = previous;
    };
  }, []);

  return null;
}
