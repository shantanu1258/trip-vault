import { ArrowLeft } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

export function TripBackLink({
  href,
  state,
  historyBack
}: {
  href: string;
  state: unknown;
  historyBack: boolean;
}) {
  const navigate = useNavigate();
  const className = "tap-target inline-flex items-center gap-2 text-sm font-bold text-muted";
  const content = (
    <>
      <ArrowLeft className="size-4" /> {historyBack ? "Back" : "Back to trip"}
    </>
  );

  return historyBack ? (
    <button type="button" className={className} onClick={() => navigate(-1)}>
      {content}
    </button>
  ) : (
    <Link replace className={className} to={href} state={state}>
      {content}
    </Link>
  );
}
