function timelineFocusAnchor(element: HTMLElement) {
  const previous = element.previousElementSibling;
  if (!(previous instanceof HTMLElement)) return element;
  if (previous.tagName === "H3") {
    const phase = previous.previousElementSibling;
    return phase instanceof HTMLElement && phase.id.startsWith("timeline-phase-")
      ? phase
      : previous;
  }
  return previous.id.startsWith("timeline-phase-") ? previous : element;
}

let cancelPendingFocusPulse: (() => void) | undefined;
let lastFocusedElement: HTMLElement | undefined;

function playFocusPulse(element: HTMLElement) {
  lastFocusedElement?.classList.remove("timeline-focus-pulse");
  lastFocusedElement = element;
  element.classList.remove("timeline-focus-pulse");
  void element.offsetWidth;
  element.classList.add("timeline-focus-pulse");

  const clearPulse = (event: AnimationEvent) => {
    if (event.animationName !== "timeline-focus-pulse") return;
    element.classList.remove("timeline-focus-pulse");
    element.removeEventListener("animationend", clearPulse);
  };
  element.addEventListener("animationend", clearPulse);
}

function queueFocusPulse(element: HTMLElement, behavior: ScrollBehavior) {
  cancelPendingFocusPulse?.();
  if (behavior !== "smooth") {
    playFocusPulse(element);
    return;
  }

  let complete = false;
  const finish = () => {
    if (complete) return;
    complete = true;
    window.clearTimeout(fallback);
    window.removeEventListener("scrollend", finish);
    cancelPendingFocusPulse = undefined;
    playFocusPulse(element);
  };
  const fallback = window.setTimeout(finish, 650);
  window.addEventListener("scrollend", finish, { once: true });
  cancelPendingFocusPulse = () => {
    complete = true;
    window.clearTimeout(fallback);
    window.removeEventListener("scrollend", finish);
    cancelPendingFocusPulse = undefined;
  };
}

export function scrollTimelineEventIntoView(eventId: string, behavior: ScrollBehavior = "smooth") {
  const element = document.getElementById(`timeline-${eventId}`);
  if (!element) return false;
  const anchor = timelineFocusAnchor(element);
  const stickyHeader = document.querySelector<HTMLElement>("header.sticky");
  const topInset = Math.max(104, (stickyHeader?.getBoundingClientRect().bottom ?? 0) + 28);
  const top = window.scrollY + anchor.getBoundingClientRect().top - topInset;
  window.scrollTo({ top: Math.max(0, top), behavior });
  queueFocusPulse(element, behavior);
  return true;
}

export function preferredScrollBehavior(): ScrollBehavior {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}
