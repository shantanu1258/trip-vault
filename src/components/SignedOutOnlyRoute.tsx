import { Loader2 } from "lucide-react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useDeviceAuthentication } from "../lib/auth/useDeviceAuthentication";
import { authReturnPath } from "../lib/auth/continuation";
import { pendingInvitationPath } from "../lib/auth/pendingInvitation";

export function SignedOutOnlyRoute() {
  const authenticated = useDeviceAuthentication();
  const location = useLocation();

  if (authenticated === null) {
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas text-brand">
        <Loader2
          className="size-7 animate-spin motion-reduce:animate-none"
          aria-label="Opening Trip Vault"
        />
      </div>
    );
  }

  return authenticated ? (
    <Navigate
      to={pendingInvitationPath() ?? authReturnPath(location.search, location.state)}
      replace
    />
  ) : (
    <Outlet />
  );
}
