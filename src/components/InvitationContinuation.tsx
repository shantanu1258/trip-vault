import { useEffect, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useDeviceAuthentication } from "../lib/auth/useDeviceAuthentication";
import { authReturnPath } from "../lib/auth/continuation";
import { pendingInvitationPath, rememberInvitation } from "../lib/auth/pendingInvitation";

/** Runs outside the pathname-keyed feature boundary so navigation cannot lose an invite. */
export function InvitationContinuation({ children }: { children: ReactNode }) {
  const location = useLocation();
  // Admin authentication never resumes or consumes a personal-trip invitation.
  if (/^\/admin(?:\/|$)/i.test(location.pathname)) return children;
  return <PersonalInvitationContinuation>{children}</PersonalInvitationContinuation>;
}

function PersonalInvitationContinuation({ children }: { children: ReactNode }) {
  const location = useLocation();
  const authenticated = useDeviceAuthentication();
  const pending = pendingInvitationPath();
  const isJoin = /^\/join\/?$/i.test(location.pathname);

  useEffect(() => {
    if (authenticated !== false) return;
    // Only /join owns the invitation `code` parameter; other auth codes are not invitations.
    const target = isJoin
      ? `${location.pathname}${location.search}`
      : authReturnPath(location.search, location.state);
    const url = new URL(target, window.location.origin);
    if (/^\/join\/?$/i.test(url.pathname)) rememberInvitation(url.searchParams.get("code"));
  }, [authenticated, isJoin, location.pathname, location.search, location.state]);

  if (authenticated === null && pending)
    return (
      <p role="status" className="p-6 text-sm text-muted">
        Opening your invitation…
      </p>
    );
  if (authenticated && pending && !isJoin) return <Navigate to={pending} replace />;
  return children;
}
