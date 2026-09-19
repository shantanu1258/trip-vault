function timelineFocusAnchor(element: HTMLElement) {
  const previous = element.previousElementSibling;
  if (!previous && element.classList.contains("timeline-outline-card")) {
    const date = element.parentElement?.previousElementSibling;
    if (date instanceof HTMLElement && date.tagName === "H3") return date;
  }
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
  const tripHeader = document.querySelector<HTMLElement>("[data-trip-sticky]");
  const topInset = Math.max(
    104,
    // Reserve the shown header height even when it is translated offscreen:
    // scrolling upward to the target immediately reveals both bars.
    (stickyHeader?.getBoundingClientRect().height ||
      stickyHeader?.getBoundingClientRect().bottom ||
      0) +
      (tripHeader?.getBoundingClientRect().height ?? 0) +
      20
  );
  const top = window.scrollY + anchor.getBoundingClientRect().top - topInset;
  window.scrollTo({ top: Math.max(0, top), behavior });
  queueFocusPulse(element, behavior);
  return true;
}

export function preferredScrollBehavior(): ScrollBehavior {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

/** Reveal a manually expanded card without disturbing cards that already fit. */
export function revealExpandedTimelineEvent(eventId: string) {
  const card = document.getElementById(`timeline-${eventId}`);
  if (!card?.querySelector('[data-timeline-trigger][aria-expanded="true"]')) return false;
  const rect = card.getBoundingClientRect();
  if (!rect.height) return false;

  const viewportTop = window.visualViewport?.offsetTop ?? 0;
  const viewportBottom = viewportTop + (window.visualViewport?.height ?? window.innerHeight);
  const header = document
    .querySelector<HTMLElement>("[data-scroll-header]")
    ?.getBoundingClientRect();
  const tabs = document.querySelector<HTMLElement>("[data-trip-sticky]")?.getBoundingClientRect();
  const gap = 12;
  const headerBottom = Math.max(viewportTop, header?.bottom ?? viewportTop);
  // Tabs still below the hero aren't an overlay yet.
  const visibleTop =
    Math.max(headerBottom, tabs && tabs.top <= headerBottom + 1 ? tabs.bottom : viewportTop) + gap;
  let visibleBottom = viewportBottom - gap;
  document
    .querySelectorAll<HTMLElement>("[data-trip-actions], [data-bottom-navigation]")
    .forEach((bar) => {
      const bounds = bar.getBoundingClientRect();
      if (
        bounds.width &&
        bounds.height &&
        bounds.top < viewportBottom &&
        bounds.bottom > viewportTop
      )
        visibleBottom = Math.min(visibleBottom, bounds.top - gap);
    });
  if (rect.top >= visibleTop && rect.bottom <= visibleBottom) return false;

  // An upward scroll reveals the bars again, so reserve their shown heights.
  const settledTop = viewportTop + (header?.height ?? 0) + (tabs?.height ?? 0) + gap;
  const availableHeight = Math.max(0, visibleBottom - settledTop);
  const delta =
    rect.height > availableHeight || rect.top < visibleTop
      ? rect.top - settledTop
      : rect.bottom - visibleBottom;
  if (Math.abs(delta) < 1) return false;
  window.scrollTo({
    top: Math.max(0, window.scrollY + delta),
    behavior: preferredScrollBehavior()
  });
  return true;
}
