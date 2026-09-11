export function scrollTimelineEventIntoView(eventId: string, behavior: ScrollBehavior = "smooth") {
  const element = document.getElementById(`timeline-${eventId}`);
  if (!element) return false;
  element.scrollIntoView({ behavior, block: "center" });
  return true;
}

export function preferredScrollBehavior(): ScrollBehavior {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}
