import { Loader2 } from "lucide-react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useDeviceAuthentication } from "../lib/auth/useDeviceAuthentication";
import { StoragePermissionPrompt } from "./StoragePermissionPrompt";

export function AuthenticatedRoute() {
  const authenticated = useDeviceAuthentication();
  const location = useLocation();

  if (authenticated === null) {
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas text-brand">
        <Loader2
          className="size-7 animate-spin motion-reduce:animate-none"
          aria-label="Opening your private space"
        />
      </div>
    );
  }

  if (!authenticated)
    return (
      <Navigate to="/sign-in" replace state={{ from: `${location.pathname}${location.search}` }} />
    );
  return (
    <>
      <StoragePermissionPrompt />
      <Outlet />
    </>
  );
}
