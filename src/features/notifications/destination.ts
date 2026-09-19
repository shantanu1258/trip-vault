export type NotificationDestination = { kind: "timeline" | "cost"; id: string };

export function notificationDestination(search: string): NotificationDestination | null {
  const params = new URLSearchParams(search);
  const focus = params.get("focus");
  const cost = params.get("cost");
  // These values select already-authorized records, never arbitrary navigation URLs.
  if (focus && cost) return null;
  const id = focus || cost;
  if (!id || !/^[a-zA-Z0-9:_-]{1,128}$/.test(id)) return null;
  return { kind: focus ? "timeline" : "cost", id };
}
