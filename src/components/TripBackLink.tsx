import { ArrowLeft } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

export function TripBackLink({
  href,
  state,
  hasOrigin
}: {
  href: string;
  state: unknown;
  hasOrigin: boolean;
}) {
  const navigate = useNavigate();
  const className = "tap-target inline-flex items-center gap-2 text-sm font-bold text-muted";
  const content = (
    <>
      <ArrowLeft className="size-4" /> {hasOrigin ? "Back" : "Back to trip"}
    </>
  );

  return hasOrigin ? (
    <button
      type="button"
      className={className}
      onClick={() => navigate(href, { replace: true, state })}
    >
      {content}
    </button>
  ) : (
    <Link replace className={className} to={href} state={state}>
      {content}
    </Link>
  );
}
