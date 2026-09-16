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
};

type TripEntry = {
  tripId: string;
  view: TripView;
};

type NavigationEnvelope = {
  intent?: TripNavigationIntent;
  returnTo?: TripReturnContext;
  entry?: TripEntry;
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

export function tripChildNavigationState(state: unknown, tripId: string, view: TripView) {
  const current = readEnvelope(state);
  return withEnvelope(state, { ...current, returnTo: { tripId, view }, intent: undefined });
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
  return context?.tripId === tripId && isTripView(context.view) ? context : null;
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
  return {
    href: tripReturnHref(tripId, context.view),
    state: tripIntentNavigationState(state, tripId, "restore", { view: context.view }),
    view: context.view
  };
}
