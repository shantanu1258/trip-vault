import { Bell, FolderLock, Home, Map, Plus, Search, UserRound, WifiOff } from "lucide-react";
import { matchPath, NavLink, useLocation, useNavigate } from "react-router-dom";
import { Brand } from "./Brand";
import { ThemeToggle } from "./ThemeToggle";
import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isSupabaseConfigured } from "../lib/supabase/client";
import { alertInputsQueryOptions } from "../features/alerts/load";
import { deriveAlerts, unreadAlertCount } from "../features/alerts/engine";
import { SyncStatus } from "../features/sync/SyncStatus";
import { tripIntentNavigationState } from "../features/trips/navigation";

const nav = [
  { to: "/home", label: "Home", icon: Home },
  { to: "/trips", label: "Trips", icon: Map },
  { to: "/add", label: "Add", icon: Plus },
  { to: "/vault", label: "Vault", icon: FolderLock },
  { to: "/profile", label: "Profile", icon: UserRound }
];

export function AppShell({ children, demo = false }: { children: ReactNode; demo?: boolean }) {
  const queryClient = useQueryClient();
  const [online, setOnline] = useState(navigator.onLine);
  const location = useLocation();
  const navigate = useNavigate();
  const tripMatch = matchPath({ path: "/trips/:tripId/*", end: false }, location.pathname);
  const activeTripId =
    tripMatch?.params.tripId && tripMatch.params.tripId !== "new" ? tripMatch.params.tripId : null;
  const alertInputs = useQuery({
    ...alertInputsQueryOptions(queryClient),
    enabled: !demo && isSupabaseConfigured,
    refetchInterval: 60_000
  });
  const visibleAlerts = alertInputs.data ? deriveAlerts(alertInputs.data) : [];
  const alertCount = alertInputs.data
    ? unreadAlertCount(visibleAlerts, alertInputs.data.states)
    : 0;
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  const openTripSearch = () => {
    if (!demo && activeTripId) {
      navigate(`/trips/${activeTripId}`, {
        replace:
          location.pathname === `/trips/${activeTripId}` &&
          new URLSearchParams(location.search).get("view") !== "details",
        state: tripIntentNavigationState(location.state, activeTripId, "search", {
          view: "timeline"
        })
      });
      return;
    }
    const region = document.getElementById("trip-search");
    region?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.requestAnimationFrame(() =>
      region?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true })
    );
  };
  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <header className="sticky top-0 z-40 border-b border-line/80 bg-canvas/95 backdrop-blur-md">
        <div className="mx-auto flex h-[4.75rem] max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Brand />
          <div className="flex items-center gap-2">
            {demo && (
              <span className="hidden rounded-full bg-brand-soft px-3 py-1.5 text-xs font-bold text-brand sm:inline">
                Safe demo
              </span>
            )}
            {!online && (
              <span className="hidden items-center gap-1.5 rounded-full bg-warning/10 px-3 py-2 text-xs font-bold text-warning sm:inline-flex">
                <WifiOff className="size-3.5" /> Offline
              </span>
            )}
            {!demo && <SyncStatus />}
            {(demo || activeTripId) && (
              <button
                type="button"
                aria-label="Search this trip"
                className="tap-target grid size-11 place-items-center rounded-2xl border border-brand bg-brand text-surface shadow-soft transition-opacity hover:opacity-90"
                onClick={openTripSearch}
              >
                <Search className="size-5" aria-hidden="true" />
              </button>
            )}
            <NavLink
              to="/alerts"
              aria-label={
                alertCount
                  ? `Alerts, ${alertCount} reminder${alertCount === 1 ? "" : "s"}`
                  : "Alerts"
              }
              className={({ isActive }) =>
                `tap-target relative grid size-11 place-items-center rounded-2xl border border-line bg-surface transition-colors hover:border-brand/40 ${isActive ? "text-brand" : "text-muted"}`
              }
            >
              <Bell className="size-5" aria-hidden="true" />
              {alertCount > 0 && (
                <span
                  className="absolute right-1.5 top-1 grid min-w-4 place-items-center rounded-full bg-coral px-1 text-[0.55rem] font-black text-white"
                  aria-hidden="true"
                >
                  {alertCount > 9 ? "9+" : alertCount}
                </span>
              )}
            </NavLink>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8 lg:px-8">
        <aside className="sticky top-[4.75rem] hidden h-[calc(100dvh-4.75rem)] py-7 lg:block">
          <nav className="space-y-1" aria-label="Primary navigation">
            {nav.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex min-h-12 items-center gap-3 rounded-2xl px-4 text-sm font-bold transition-colors ${
                    (demo ? to === "/trips" : isActive)
                      ? "bg-brand text-surface"
                      : "text-muted hover:bg-surface hover:text-ink"
                  }`
                }
              >
                <Icon className="size-5" aria-hidden="true" />
                {label}
              </NavLink>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 px-4 pb-28 pt-6 sm:px-6 lg:px-0 lg:pb-12 lg:pt-8">{children}</main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-surface/95 px-2 pb-[max(0.55rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-md lg:hidden"
        aria-label="Primary navigation"
      >
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `tap-target flex flex-col items-center justify-center gap-1 rounded-xl text-[0.65rem] font-bold ${
                  (demo ? to === "/trips" : isActive) ? "text-brand" : "text-muted"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`grid size-8 place-items-center rounded-xl ${(demo ? to === "/trips" : isActive) ? "bg-brand-soft" : ""}`}
                  >
                    <Icon className="size-[1.15rem]" aria-hidden="true" />
                  </span>
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
