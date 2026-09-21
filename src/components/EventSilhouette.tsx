import { useLayoutEffect, useRef } from "react";
import type { TimelineEventType } from "../features/trips/types";
import { eventIconTone } from "./EventTypeIcon";

type Placement = "header" | "summary" | "fallback" | "modal" | "hero";

/** Background artwork only: labels, content and controls remain above it. */
export function EventSilhouette({
  type,
  expanded = false,
  placement = "header"
}: {
  type: TimelineEventType;
  expanded?: boolean;
  placement?: Placement;
}) {
  const source = useRef<HTMLSpanElement>(null);
  const tone = eventIconTone(type);
  useLayoutEffect(() => {
    if (
      (placement === "header" && !expanded) ||
      !source.current ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const element = source.current;
    if (!element.animate) return;
    const card = element.closest("article");
    // A legacy header controls the paired transition. Icon-only headers let
    // the expanded card play its own entrance when it mounts.
    if (
      (placement === "summary" || placement === "fallback") &&
      (card?.querySelector('[data-silhouette-placement="header"]') ||
        (placement === "fallback" && card?.querySelector('[data-silhouette-placement="summary"]')))
    )
      return;
    const standalone = placement !== "header";
    const destination = standalone
      ? element
      : (card?.querySelector<HTMLElement>('[data-silhouette-placement="summary"]') ??
        card?.querySelector<HTMLElement>('[data-silhouette-placement="fallback"]'));
    if (!destination) return;
    const from = element.getBoundingClientRect();
    const to = destination.getBoundingClientRect();
    if (!from.width || !to.width) return;
    const moves = ["flight", "cab", "bus", "ferry", "train", "transport"].includes(tone);
    const hotel = tone === "hotel";
    const cardBounds = card?.getBoundingClientRect();
    const landingBounds = destination.parentElement!.getBoundingClientRect();
    const exitRight = (cardBounds?.right ?? 0) - from.left + 12;
    const exitTop = (cardBounds?.top ?? 0) - from.bottom - 12;
    const enterLeft = landingBounds.left - to.right - 12;
    const enterBottom = landingBounds.bottom - to.top + 12;
    const departure = standalone
      ? undefined
      : element.animate(
          moves
            ? [
                { transform: "translate(0, 0) rotate(0)", opacity: 0.1 },
                {
                  transform:
                    tone === "flight"
                      ? `translate(${-exitTop}px, ${exitTop}px)`
                      : `translateX(${exitRight}px)`,
                  opacity: 0
                }
              ]
            : hotel
              ? [
                  { transform: "none", opacity: 0.1 },
                  { transform: "none", opacity: 0.1, offset: 0.65 },
                  { transform: "none", opacity: 0 }
                ]
              : [
                  { transform: "scale(1) rotate(0)", opacity: 0.1 },
                  { transform: `scale(.8) rotate(${tone === "activity" ? 45 : 0}deg)`, opacity: 0 }
                ],
          {
            duration: moves ? 450 : hotel ? 700 : 350,
            easing: "cubic-bezier(.2,.7,.3,1)"
          }
        );
    const arrival = destination.animate(
      [
        {
          opacity: 0,
          transform: moves
            ? tone === "flight"
              ? `translate(${-enterBottom}px, ${enterBottom}px)`
              : `translateX(${enterLeft}px)`
            : `translateY(6px) rotate(${tone === "activity" ? -35 : 0}deg) scale(.9)`
        },
        { opacity: 0.12, transform: "translateY(0) rotate(0) scale(1)" }
      ],
      {
        duration: moves ? 650 : 500,
        delay: standalone ? 0 : moves ? 350 : hotel ? 450 : 250,
        fill: "backwards",
        easing: "ease-out"
      }
    );
    return () => {
      departure?.cancel();
      arrival.cancel();
    };
  }, [expanded, placement, tone]);
  return (
    <span
      ref={source}
      aria-hidden="true"
      className={`event-silhouette event-type-icon--${tone}`}
      data-silhouette={tone}
      data-event-type={type}
      data-expanded={expanded}
      data-silhouette-placement={placement}
    >
      <svg
        viewBox="0 0 160 110"
        focusable="false"
        className="event-silhouette-art"
        fill="currentColor"
      >
        {tone === "flight" && (
          <path d="M145 16c-4-4-11-2-17 2l-31 23-53-13-14 10 42 23-23 19-23-4-10 8 27 12 15 1 33-27 25 27 12-9-12-35 24-22c6-6 9-11 5-15Z" />
        )}
        {tone === "hotel" && (
          <g>
            <circle className="silhouette-sun" cx="117" cy="45" r="22" />
            <path d="M29 79h8l9-47 7 2-8 45h22c15 0 26 6 34 14H12c2-8 8-12 17-14Z" />
            <path d="M46 35C19 42 15 27 14 22c13-4 24-1 33 8C40 9 56 6 62 10c-1 9-5 15-12 21 19-13 35-6 37 4-12 5-23 3-36 0 13 9 16 19 9 27-9-6-12-14-14-27Z" />
            <path
              d="M77 80c9-6 16 6 25 0s16 6 25 0 16 6 25 0M88 98c10-6 17 6 27 0s18 6 28 0"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
            />
          </g>
        )}
        {(tone === "cab" || tone === "transport") && (
          <g>
            <path
              fillRule="evenodd"
              d="M18 67l16-7 17-26h48l22 26 21 7a8 8 0 0 1 5 8v12H13V75a9 9 0 0 1 5-8Zm38-25L45 60h25V42Zm23 0v18h31L95 42Z"
            />
            {tone === "cab" && <path d="M64 25h23v9H64z" />}
            <circle cx="42" cy="88" r="12" />
            <circle cx="119" cy="88" r="12" />
          </g>
        )}
        {tone === "bus" && (
          <g>
            <path
              fillRule="evenodd"
              d="M23 23h113a9 9 0 0 1 9 9v55H14V33a10 10 0 0 1 9-10Zm2 12v27h22V35Zm30 0v27h22V35Zm30 0v27h22V35Zm30 0v40h18V35Z"
            />
            <circle cx="39" cy="88" r="12" />
            <circle cx="120" cy="88" r="12" />
          </g>
        )}
        {tone === "train" && (
          <g>
            <path
              fillRule="evenodd"
              d="M37 16h85c10 0 17 10 20 19l9 45H16V35c0-11 7-19 21-19Zm-8 15v21h23V31Zm34 0v21h23V31Zm34 0v21h35l-7-21Z"
            />
            <path
              d="m54 17 13-11h29l13 11M19 101h131"
              fill="none"
              stroke="currentColor"
              strokeWidth="5"
              strokeLinecap="round"
            />
            <circle cx="40" cy="85" r="10" />
            <circle cx="78" cy="85" r="10" />
            <circle cx="120" cy="85" r="10" />
          </g>
        )}
        {tone === "ferry" && (
          <g>
            <path d="m10 64 143-7-20 29H39Z" />
            <path
              fillRule="evenodd"
              d="M39 27h71l20 27H28Zm9 8-8 12h18V35Zm19 0v12h18V35Zm27 0v12h18l-9-12Z"
            />
            <path d="M71 14h8v14h-8zm18 5h8v9h-8Z" />
            <path
              d="M13 98c11-9 19 9 30 0s19 9 30 0 19 9 30 0 19 9 30 0"
              fill="none"
              stroke="currentColor"
              strokeWidth="5"
              strokeLinecap="round"
            />
          </g>
        )}
        {tone === "activity" && (
          <g>
            <path
              d="m78 52-23 50m27-50 23 50M43 103h74"
              fill="none"
              stroke="currentColor"
              strokeWidth="6"
              strokeLinecap="round"
            />
            <g className="silhouette-wheel" fill="none" stroke="currentColor" strokeWidth="4">
              <circle cx="80" cy="48" r="35" />
              <path d="M80 13v70M45 48h70M55 23l50 50M55 73l50-50" />
              <g fill="currentColor" stroke="none">
                <rect x="72" y="5" width="16" height="13" rx="4" />
                <rect x="72" y="78" width="16" height="13" rx="4" />
                <rect x="36" y="42" width="16" height="13" rx="4" />
                <rect x="108" y="42" width="16" height="13" rx="4" />
                <rect x="47" y="16" width="16" height="13" rx="4" />
                <rect x="98" y="16" width="16" height="13" rx="4" />
                <rect x="47" y="68" width="16" height="13" rx="4" />
                <rect x="98" y="68" width="16" height="13" rx="4" />
              </g>
            </g>
          </g>
        )}
        {tone === "meal" && (
          <g>
            <path d="M25 61h110l-10 37H35Z" />
            <g className="silhouette-lid">
              <path d="M22 51a59 39 0 0 1 116 0Z" />
              <circle cx="80" cy="10" r="7" />
            </g>
          </g>
        )}
        {tone === "preparation" && (
          <g data-silhouette-art="planning">
            <path fillRule="evenodd" d="M28 24h104v82H28Zm12 24v46h80V48Z" />
            <path
              d="M51 14v22m58-22v22M39 43h82"
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
              strokeLinecap="round"
            />
            <path
              className="silhouette-planning-route"
              d="M53 62h17l10 11h27M53 84h29l9-10"
              fill="none"
              pathLength="1"
              stroke="currentColor"
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="51" cy="62" r="6" />
            <circle cx="109" cy="73" r="6" />
            <circle cx="51" cy="84" r="6" />
          </g>
        )}
        {tone === "custom" && (
          <g>
            <path fillRule="evenodd" d="M25 25h110v75H25Zm10 20v45h90V45Z" />
            <path
              d="M45 15v20m70-20v20"
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
              strokeLinecap="round"
            />
            <circle cx="58" cy="65" r="5" />
            <circle cx="80" cy="65" r="5" />
            <circle cx="102" cy="65" r="5" />
          </g>
        )}
      </svg>
    </span>
  );
}
