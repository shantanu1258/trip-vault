import { Link, useLocation, useNavigate, type LinkProps } from "react-router-dom";
import {
  readTripReturnContext,
  tripChildNavigationState,
  tripChildScrollState
} from "../features/trips/navigation";

/** Capture the origin at click time, not render time, before the destination resets scroll. */
export function TripChildLink({
  tripId,
  state,
  onClick,
  scrollAnchorId,
  ...props
}: LinkProps & { tripId: string; scrollAnchorId?: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <Link
      {...props}
      state={state}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          (props.target && props.target !== "_self")
        )
          return;
        const origin = tripChildNavigationState(
          state,
          tripId,
          readTripReturnContext(state, tripId)?.view ?? "details",
          `${location.pathname}${location.search}`
        );
        const anchor =
          (scrollAnchorId ? document.getElementById(scrollAnchorId) : null) ?? event.currentTarget;
        const scroll = {
          y: window.scrollY,
          anchorId: anchor.id || undefined,
          anchorOffset: anchor.getBoundingClientRect().top
        };
        if (location.pathname === `/trips/${tripId}`) {
          const view = readTripReturnContext(origin, tripId)?.view ?? "timeline";
          try {
            sessionStorage.setItem(`trip-vault:scroll:${tripId}:${view}`, JSON.stringify(scroll));
          } catch {
            /* Scroll memory is optional. */
          }
        }
        event.preventDefault();
        navigate(props.to, {
          replace: props.replace,
          state: tripChildScrollState(origin, tripId, scroll)
        });
      }}
    />
  );
}
