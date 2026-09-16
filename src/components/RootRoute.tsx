import { Loader2 } from "lucide-react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useDeviceAuthentication } from "../lib/auth/useDeviceAuthentication";
import { WelcomePage } from "../pages/WelcomePage";
import { getSavedTripFocus } from "../features/trips/api";
import { selectFocusedTrip, tripPhase } from "../features/trips/presentation";
import { tripQueries } from "../features/queries/tripQueries";

export function RootRoute() {
  const authenticated = useDeviceAuthentication();
  const [savedFocus, setSavedFocus] = useState<string | null>(null);
  const [focusReady, setFocusReady] = useState(false);
  const trips = useQuery({ ...tripQueries.trips(), enabled: authenticated === true });
  useEffect(() => {
    if (!authenticated) {
      setFocusReady(false);
      return;
    }
    let active = true;
    getSavedTripFocus()
      .then((tripId) => {
        if (active) setSavedFocus(tripId);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setFocusReady(true);
      });
    return () => {
      active = false;
    };
  }, [authenticated]);

  if (authenticated === null || (authenticated && (trips.isLoading || !focusReady)))
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas text-brand">
        <Loader2
          className="size-7 animate-spin motion-reduce:animate-none"
          aria-label="Opening Trip Vault"
        />
      </div>
    );
  if (!authenticated) return <WelcomePage />;
  const currentTrips = (trips.data ?? []).filter(
    (trip) => trip.status !== "archived" && tripPhase(trip) === "current"
  );
  const launchTrip = currentTrips.length ? selectFocusedTrip(currentTrips, savedFocus) : null;
  return <Navigate to={launchTrip ? `/trips/${launchTrip.id}` : "/home"} replace />;
}
