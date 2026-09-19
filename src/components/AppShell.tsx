import { Bell, FolderLock, Map as MapIcon, Search, UserRound, WifiOff } from "lucide-react";
import { matchPath, NavLink, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Brand } from "./Brand";
import { ThemeToggle } from "./ThemeToggle";
import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isSupabaseConfigured } from "../lib/supabase/client";
import { alertInputsQueryOptions } from "../features/alerts/load";
import { deriveAlerts, unreadAlertCount } from "../features/alerts/engine";
import { SyncStatus } from "../features/sync/SyncStatus";
import { tripIntentNavigationState } from "../features/trips/navigation";
import { useScrollHeader } from "./useScrollHeader";
import { NotificationsSheet } from "../features/alerts/NotificationsSheet";

const nav = [
  { to: "/trips", label: "Trips", icon: MapIcon },
  { to: "/vault", label: "Vault", icon: FolderLock },
  { to: "/profile", label: "Profile", icon: UserRound }
];

export function AppShell({
  children,
  demo = false,
  onTripSearch,
  compactTop = false
}: {
  children: ReactNode;
  demo?: boolean;
  onTripSearch?: () => void;
  compactTop?: boolean;
}) {
  const queryClient = useQueryClient();
  const [online, setOnline] = useState(navigator.onLine);
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const showingNotifications = searchParams.get("notifications") === "active";
  const toggleNotifications = (open: boolean) => {
    const next = new URLSearchParams(searchParams);
    if (open) next.set("notifications", "active");
    else next.delete("notifications");
    navigate(
      { pathname: location.pathname, search: next.toString(), hash: location.hash },
      { replace: !open, state: location.state }
    );
  };
  const headersHidden = useScrollHeader(`${location.pathname}${location.search}`);
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
    if (onTripSearch) {
      onTripSearch();
      return;
    }
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
    <div
      data-headers-hidden={headersHidden}
      className="min-h-dvh bg-canvas text-ink [--app-header-height:3.5rem] [--app-footer-height:3.5rem] sm:[--app-header-height:4.75rem]"
    >
      <header
        data-scroll-header
        className="sticky top-0 z-40 border-b border-line/80 bg-canvas/95 backdrop-blur-md"
      >
        <div className="mx-auto flex h-[var(--app-header-height)] max-w-7xl items-center justify-between gap-2 px-3 sm:px-6 lg:px-8">
          <Brand mobileHeader />
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
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
            <button
              type="button"
              onClick={() => toggleNotifications(true)}
              aria-haspopup="dialog"
              aria-expanded={showingNotifications}
              aria-label={
                alertCount
                  ? `Alerts, ${alertCount} reminder${alertCount === 1 ? "" : "s"}`
                  : "Alerts"
              }
              className={`tap-target relative grid size-11 place-items-center rounded-2xl border border-line bg-surface transition-colors hover:border-brand/40 ${showingNotifications ? "text-brand" : "text-muted"}`}
            >
              <Bell className="size-5" aria-hidden="true" />
              {alertCount > 0 && (
                <span
                  className="absolute right-1.5 top-1 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[0.55rem] font-black text-surface"
                  aria-hidden="true"
                >
                  {alertCount > 9 ? "9+" : alertCount}
                </span>
              )}
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8 lg:px-8">
        <aside className="sticky top-[var(--app-header-height)] hidden h-[calc(100dvh-var(--app-header-height))] py-7 lg:block">
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

        <main
          className={`min-w-0 px-4 pb-28 sm:px-6 lg:px-0 lg:pb-12 ${compactTop ? "pt-1 lg:pt-4" : "pt-6 lg:pt-8"}`}
        >
          {children}
        </main>
      </div>

      <nav
        data-bottom-navigation
        className="fixed inset-x-0 bottom-0 z-50 h-[calc(var(--app-footer-height)+env(safe-area-inset-bottom))] border-t border-line bg-surface/95 px-2 pb-[calc(0.25rem+env(safe-area-inset-bottom))] pt-1 backdrop-blur-md lg:hidden"
        aria-label="Primary navigation"
      >
        <div className="mx-auto grid h-12 max-w-lg grid-cols-3">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `tap-target flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[0.65rem] font-bold leading-none ${
                  (demo ? to === "/trips" : isActive) ? "text-brand" : "text-muted"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`grid h-6 w-9 place-items-center rounded-lg ${(demo ? to === "/trips" : isActive) ? "bg-brand-soft" : ""}`}
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
      {showingNotifications && (
        <NotificationsSheet
          alerts={visibleAlerts}
          tripNames={new Map((alertInputs.data?.trips ?? []).map((trip) => [trip.id, trip.title]))}
          loading={!demo && isSupabaseConfigured && alertInputs.isLoading}
          error={Boolean(alertInputs.error)}
          onClose={() => toggleNotifications(false)}
          onOpen={(target) => navigate(target, { replace: true })}
        />
      )}
    </div>
  );
}
