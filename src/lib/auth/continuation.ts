/** Safe immediate return route; pending invitations also survive navigation in browser storage. */
export function authReturnPath(search: string, state?: unknown): string {
  const next = new URLSearchParams(search).get("next");
  const from = typeof state === "object" && state && "from" in state ? state.from : null;
  const value = next ?? from;
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\s]/.test(value)
  )
    return "/";
  const url = new URL(value, "https://app.invalid");
  let route: string;
  try {
    route = decodeURIComponent(url.pathname).replace(/\/+$/, "").toLowerCase();
  } catch {
    return "/";
  }
  if (
    url.origin !== "https://app.invalid" ||
    ["/sign-in", "/welcome", "/admin/sign-in"].includes(route)
  )
    return "/";
  return `${url.pathname}${url.search}${url.hash}`;
}

export function signInContinuation(path: string): string {
  const safePath = authReturnPath("", { from: path });
  const url = new URL(safePath, "https://app.invalid");
  return `/sign-in?${new URLSearchParams({ next: `${url.pathname}${url.search}${url.hash}` })}`;
}
