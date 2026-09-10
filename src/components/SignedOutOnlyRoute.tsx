import { Loader2 } from "lucide-react";
import { Navigate, Outlet } from "react-router-dom";
import { useDeviceAuthentication } from "../lib/auth/useDeviceAuthentication";

export function SignedOutOnlyRoute() {
  const authenticated = useDeviceAuthentication();

  if (authenticated === null) {
    return <div className="grid min-h-dvh place-items-center bg-canvas text-brand"><Loader2 className="size-7 animate-spin motion-reduce:animate-none" aria-label="Opening Trip Vault" /></div>;
  }

  return authenticated ? <Navigate to="/home" replace /> : <Outlet />;
}
