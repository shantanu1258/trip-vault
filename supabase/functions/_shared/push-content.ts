type Row = Record<string, unknown>;
function record(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : {};
}
function text(value: unknown, limit = 160): string {
  return typeof value === "string"
    ? value
        .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, limit)
    : "";
}
function money(row: Row): string {
  const currency = text(row.currency_code, 3);
  if (!/^[A-Z]{3}$/.test(currency) || !Number.isSafeInteger(row.amount_minor)) return "";
  const format = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    currencyDisplay: "code"
  });
  const digits = format.resolvedOptions().maximumFractionDigits ?? 2;
  return format.format(Number(row.amount_minor) / 10 ** digits).replace(/\s+/g, " ");
}
function time(row: Row, key: string): string {
  // Ordering timestamps for untimed/relative entries are not appointment times.
  if (
    key.endsWith("s_at") &&
    (row.is_all_day ||
      (row.timing_mode !== "exact" &&
        !(row.timing_mode === "relative" && row.has_explicit_start_time)))
  )
    return "Not timed";
  if (!row[key]) return "Not set";
  const zone = text(row.timezone || row.source_timezone);
  if (!zone) return "Not set";
  try {
    return (
      new Intl.DateTimeFormat("en-GB", {
        timeZone: zone,
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23"
      }).format(new Date(String(row[key]))) + ` (${zone})`
    );
  } catch {
    return "Not set";
  }
}
const fieldLabels: Record<string, string> = {
  title: "Title",
  category: "Category",
  payment_status: "Payment status",
  event_status: "Status",
  reservation_state: "Reservation status",
  timezone: "Time zone",
  source_timezone: "Time zone",
  location: "Location",
  notes: "Notes",
  details: "Booking details",
  reference_code: "Booking reference",
  provider: "Provider",
  paid_by: "Payer",
  paid_by_traveler_id: "Payer",
  booking_id: "Linked booking",
  itinerary_item_id: "Linked event",
  cab_stop_id: "Cab stop",
  activity_moment_id: "Activity moment",
  participant_scope: "Travelers",
  applies_to_all_travelers: "Travelers",
  timing_mode: "Timing",
  is_all_day: "Timing",
  has_explicit_start_time: "Timing",
  event_type: "Event type",
  type: "Booking type",
  relative_to_item_id: "Relative timing",
  relative_position: "Relative timing",
  planned_duration_minutes: "Duration"
};
const valueFields = new Set([
  "title",
  "category",
  "payment_status",
  "event_status",
  "reservation_state",
  "timezone",
  "source_timezone"
]);

/** Bounded lock-screen copy from server-captured, allowlisted change facts. */
export function pushChangeContent(
  kind: string,
  details: unknown
): { title: string; body: string } | null {
  const data = record(details);
  const action = data.action;
  if (kind === "reminder" && ["five_days", "one_hour"].includes(String(data.reminder_stage))) {
    const name = text(data.item_title);
    if (!name) return null;
    const label = data.event_type === "flight" ? "Flight" : data.event_type === "bus" ? "Bus" : "Event";
    const timing = time(record(data.after), "starts_at");
    return {
      title: `${label} ${data.reminder_stage === "five_days" ? "coming up" : "starting soon"}: ${name}`.slice(0, 200),
      body: [text(data.trip_title, 80), timing, data.reminder_stage === "five_days" ? "Review your journey and documents." : "View event details."].filter(Boolean).join(" · ").slice(0, 360)
    };
  }
  const label =
    kind === "event"
      ? "Event"
      : kind === "cost"
        ? "Expense"
        : kind === "booking"
          ? "Booking"
          : null;
  if (!label || !["created", "updated", "restored"].includes(String(action))) return null;
  const name = text(data.item_title);
  if (!name) return null; // Older queued jobs have no trustworthy action snapshot.
  const before = record(data.before),
    after = record(data.after);
  const fields = Array.isArray(data.changed_fields)
    ? data.changed_fields.filter((f): f is string => typeof f === "string")
    : [];
  const changes: string[] = [];
  if (
    kind === "cost" &&
    (action === "created" || fields.includes("amount_minor") || fields.includes("currency_code"))
  ) {
    const next = money(after),
      previous = money(before);
    if (next)
      changes.push(action === "created" ? next : `Amount: ${previous || "Not set"} → ${next}`);
  }
  if (action === "updated") {
    const start = kind === "booking" ? "start_at" : "starts_at";
    const end = kind === "booking" ? "end_at" : "ends_at";
    for (const [key, label] of [
      [start, "Start"],
      [end, "End"]
    ]) {
      if (fields.includes(key))
        changes.push(`${label}: ${time(before, key)} → ${time(after, key)}`);
    }
    for (const key of fields) {
      if ([start, end, "amount_minor", "currency_code", "deleted_at"].includes(key)) continue;
      const label = Object.hasOwn(fieldLabels, key) ? fieldLabels[key] : "Other details";
      const value = (row: Row) => {
        const raw = text(row[key], 60);
        return (
          (["category", "payment_status", "event_status", "reservation_state"].includes(key)
            ? raw.replaceAll("_", " ")
            : raw) || "Not set"
        );
      };
      const change = valueFields.has(key)
        ? `${label}: ${value(before)} → ${value(after)}`
        : `${label} changed`;
      if (!changes.includes(change)) changes.push(change);
    }
  }
  const summary =
    changes.slice(0, 3).join("; ") +
    (changes.length > 3 ? `; +${changes.length - 3} more changes` : "");
  const body = [text(data.trip_title, 80), summary || "View details in Trip Vault."]
    .filter(Boolean)
    .join(" · ");
  return {
    title: `${label} ${action}: ${name}`.slice(0, 200),
    body: body.length > 360 ? body.slice(0, 359) + "…" : body
  };
}
