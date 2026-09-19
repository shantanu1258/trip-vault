import { Loader2 } from "lucide-react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useDeviceAuthentication } from "../lib/auth/useDeviceAuthentication";
import { WelcomePage } from "../pages/WelcomePage";
import { isTripInLaunchWindow } from "../features/trips/presentation";
import { tripQueries } from "../features/queries/tripQueries";

export function RootRoute() {
  const authenticated = useDeviceAuthentication();
  const trips = useQuery({ ...tripQueries.trips(), enabled: authenticated === true });
  if (authenticated === null || (authenticated && trips.isLoading))
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas text-brand">
        <Loader2
          className="size-7 animate-spin motion-reduce:animate-none"
          aria-label="Opening Trip Vault"
        />
      </div>
    );
  if (!authenticated) return <WelcomePage />;
  const relevant = (trips.data ?? []).filter((trip) => isTripInLaunchWindow(trip));
  // An overlap is a choice, not a reason to guess which trip the traveler wants.
  return <Navigate to={relevant.length === 1 ? `/trips/${relevant[0].id}` : "/trips"} replace />;
}
