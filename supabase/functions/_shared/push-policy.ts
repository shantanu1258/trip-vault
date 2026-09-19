export function allowedPushEndpoint(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      (url.hostname === "fcm.googleapis.com" ||
        url.hostname === "updates.push.services.mozilla.com" ||
        /(^|\.)push\.apple\.com$/.test(url.hostname) ||
        /(^|\.)notify\.windows\.com$/.test(url.hostname))
    );
  } catch {
    return false;
  }
}

export function notificationPath(
  kind: string,
  tripId: string,
  entityId: string,
  occurrence: string
) {
  const trip = encodeURIComponent(tripId);
  if (kind === "booking") return `/trips/${trip}/bookings/${encodeURIComponent(entityId)}`;
  const query = new URLSearchParams(
    kind === "cost" ? { view: "details", cost: entityId } : { view: "timeline", focus: entityId }
  );
  // A unique occurrence also makes a subsequent click on the same event a fresh intent.
  query.set("notification", occurrence);
  return `/trips/${trip}?${query}`;
}

export function deliveryResult(status: number) {
  if (status >= 200 && status < 300) return "sent";
  if (status === 404 || status === 410) return "expired";
  if (status === 429 || status >= 500) return "retry";
  return "failed";
}
