export type TripView = "timeline" | "details";

export type TripNavigationIntent = {
  tripId: string;
  kind: "current" | "search" | "target" | "restore";
  token: string;
  view?: TripView;
  targetId?: string;
};

export type TripReturnContext = {
  tripId: string;
  view: TripView;
  path?: string;
  parent?: TripReturnContext;
  scroll?: { y: number; anchorId?: string; anchorOffset?: number };
};

type TripEntry = {
  tripId: string;
  view: TripView;
};

type NavigationEnvelope = {
  intent?: TripNavigationIntent;
  returnTo?: TripReturnContext;
  entry?: TripEntry;
  routeModal?: { tripId: string };
  scrollRestore?: {
    tripId: string;
    path: string;
    scroll: NonNullable<TripReturnContext["scroll"]>;
  };
};

const navigationKey = "__tripVaultNavigation";
const consumedIntentPrefix = "trip-vault:navigation-intent:";
let intentSequence = 0;

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isTripView(value: unknown): value is TripView {
  return value === "timeline" || value === "details";
}

function readEnvelope(state: unknown): NavigationEnvelope {
  return record(record(state)[navigationKey]) as NavigationEnvelope;
}

function withEnvelope(state: unknown, envelope: NavigationEnvelope) {
  return { ...record(state), [navigationKey]: envelope };
}

function intentToken() {
  intentSequence += 1;
  return `${Date.now().toString(36)}-${intentSequence.toString(36)}`;
}

function safeTripPath(path: unknown, tripId: string) {
  if (typeof path !== "string") return undefined;
  const prefix = `/trips/${encodeURIComponent(tripId)}`;
  return path === prefix || path.startsWith(`${prefix}?`) || path.startsWith(`${prefix}/`)
    ? path
    : undefined;
}

export function tripChildNavigationState(
  state: unknown,
  tripId: string,
  view: TripView,
  returnPath?: string
) {
  const current = readEnvelope(state);
  const existingReturn =
    current.returnTo?.tripId === tripId && isTripView(current.returnTo.view)
      ? current.returnTo
      : undefined;
  const path = safeTripPath(returnPath, tripId);
  return withEnvelope(state, {
    ...current,
    returnTo: path
      ? {
          tripId,
          view,
          path,
          parent: existingReturn?.path === path ? existingReturn.parent : existingReturn
        }
      : (existingReturn ?? { tripId, view }),
    intent: undefined
  });
}

export function tripRouteModalNavigationState(state: unknown, tripId: string, view: TripView) {
  const current = readEnvelope(state);
  return withEnvelope(state, {
    ...current,
    returnTo: { tripId, view },
    routeModal: { tripId },
    intent: undefined
  });
}

export function isTripRouteModal(state: unknown, tripId: string) {
  return readEnvelope(state).routeModal?.tripId === tripId;
}

export function tripIntentNavigationState(
  state: unknown,
  tripId: string,
  kind: TripNavigationIntent["kind"],
  options: { view?: TripView; targetId?: string } = {}
) {
  const current = readEnvelope(state);
  return withEnvelope(state, {
    ...current,
    intent: { tripId, kind, token: intentToken(), ...options },
    // A fresh destination must not be overridden by a previous detail-page return.
    scrollRestore: kind === "restore" ? current.scrollRestore : undefined,
    entry: options.view ? { tripId, view: options.view } : current.entry
  });
}

export function tripEntryNavigationState(state: unknown, tripId: string, view: TripView) {
  const current = readEnvelope(state);
  return withEnvelope(state, { ...current, entry: { tripId, view } });
}

export function readTripNavigationIntent(
  state: unknown,
  tripId: string
): TripNavigationIntent | null {
  const intent = readEnvelope(state).intent;
  if (!intent || intent.tripId !== tripId || typeof intent.token !== "string") return null;
  if (!["current", "search", "target", "restore"].includes(intent.kind)) return null;
  if (intent.view !== undefined && !isTripView(intent.view)) return null;
  if (intent.kind === "target" && !intent.targetId) return null;
  return intent;
}

export function readTripReturnContext(state: unknown, tripId: string): TripReturnContext | null {
  const context = readEnvelope(state).returnTo;
  if (context?.tripId !== tripId || !isTripView(context.view)) return null;
  const path = safeTripPath(context.path, tripId);
  return path ? { ...context, path } : { tripId, view: context.view };
}

export function readTripEntry(state: unknown, tripId: string): TripEntry | null {
  const entry = readEnvelope(state).entry;
  return entry?.tripId === tripId && isTripView(entry.view) ? entry : null;
}

export function consumeTripNavigationIntent(intent: TripNavigationIntent) {
  try {
    sessionStorage.setItem(`${consumedIntentPrefix}${intent.token}`, "1");
  } catch {
    /* Intent consumption is best effort. */
  }
}

export function isTripNavigationIntentConsumed(intent: TripNavigationIntent) {
  try {
    return sessionStorage.getItem(`${consumedIntentPrefix}${intent.token}`) === "1";
  } catch {
    return false;
  }
}

export function tripReturnHref(tripId: string, view: TripView) {
  return view === "details" ? `/trips/${tripId}?view=details` : `/trips/${tripId}`;
}

export function tripReturnNavigation(state: unknown, tripId: string) {
  const context = readTripReturnContext(state, tripId) ?? { tripId, view: "timeline" as const };
  const current = readEnvelope(state);
  const href = context.path ?? tripReturnHref(tripId, context.view);
  const returnState = withEnvelope(state, {
    ...current,
    returnTo: context.parent,
    // The restored modal is a destination, not the previous browser-history entry.
    routeModal: undefined,
    scrollRestore: context.scroll ? { tripId, path: href, scroll: context.scroll } : undefined
  });
  return {
    href,
    state: tripIntentNavigationState(returnState, tripId, "restore", { view: context.view }),
    view: context.view,
    hasOrigin: Boolean(context.path)
  };
}

export function tripChildScrollState(
  state: unknown,
  tripId: string,
  scroll: NonNullable<TripReturnContext["scroll"]>
) {
  const current = readEnvelope(state);
  const context = readTripReturnContext(state, tripId);
  return context
    ? withEnvelope(state, {
        ...current,
        returnTo: { ...context, scroll },
        scrollRestore: undefined
      })
    : state;
}

export function readTripScrollRestore(state: unknown, tripId: string, path: string) {
  const restore = readEnvelope(state).scrollRestore;
  return restore?.tripId === tripId && restore.path === path && Number.isFinite(restore.scroll?.y)
    ? restore.scroll
    : null;
}
