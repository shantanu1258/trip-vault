import { useEffect, useLayoutEffect } from "react";
import { matchPath, useLocation } from "react-router-dom";
import { readTripEntry, readTripNavigationIntent } from "../features/trips/navigation";

/**
 * Gives each real page navigation a clean starting position without touching
 * query-string navigation. TripPage uses its query string for timeline/detail
 * views and owns its more specific per-trip restoration behavior.
 */
export function RouteScrollManager() {
  const { pathname, state } = useLocation();

  useLayoutEffect(() => {
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
