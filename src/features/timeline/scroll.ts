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
    window.removeEventListener("scroll", onScroll);
    cancelPendingFocusPulse = undefined;
    playFocusPulse(element);
  };
  // Start the pulse after arrival, not halfway through a long smooth scroll.
  let fallback = window.setTimeout(finish, 650);
  const onScroll = () => {
    window.clearTimeout(fallback);
    fallback = window.setTimeout(finish, 160);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("scrollend", finish, { once: true });
  cancelPendingFocusPulse = () => {
    complete = true;
    window.clearTimeout(fallback);
    window.removeEventListener("scrollend", finish);
    window.removeEventListener("scroll", onScroll);
    cancelPendingFocusPulse = undefined;
  };
}

export function scrollTimelineEventIntoView(eventId: string, behavior: ScrollBehavior = "smooth") {
  const element = document.getElementById(`timeline-${eventId}`);
  if (!element) return false;
  const stickyHeader = document.querySelector<HTMLElement>("header.sticky");
  const tripHeader = document.querySelector<HTMLElement>("[data-trip-sticky]");
  const topInset = Math.max(
    104,
    // Reserve the shown header height even when it is translated offscreen:
    // scrolling upward reveals the main header above the persistent trip tabs.
    (stickyHeader?.getBoundingClientRect().height ||
      stickyHeader?.getBoundingClientRect().bottom ||
      0) +
      (tripHeader?.getBoundingClientRect().height ?? 0) +
      20
  );
  const viewportTop = window.visualViewport?.offsetTop ?? 0;
  const viewportBottom = viewportTop + (window.visualViewport?.height ?? window.innerHeight);
  let visibleBottom = viewportBottom - 16;
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
        visibleBottom = Math.min(visibleBottom, bounds.top - 16);
    });
  const visibleTop = viewportTop + topInset;
  const availableHeight = Math.max(0, visibleBottom - visibleTop);
  const cardBounds = element.getBoundingClientRect();
  const triggerBounds = element
    .querySelector<HTMLElement>("[data-timeline-trigger]")
    ?.getBoundingClientRect();
  // Center the heading of tall expanded cards; do not scroll past their title.
  const focusHeight = triggerBounds?.height || Math.min(cardBounds.height || 64, 160);
  const landingTop = visibleTop + Math.max(0, (availableHeight - focusHeight) / 2);
  const top = window.scrollY + cardBounds.top - landingTop;
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

  // An upward scroll reveals the main header again; reserve it and the persistent tabs.
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
