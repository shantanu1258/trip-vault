import type { MouseEvent, ReactNode } from "react";

export function SafeExternalAction({ href, children, className = "secondary-button" }: { href: string; children: ReactNode; className?: string }) {
  const hostname = new URL(href).hostname;
  const open = (event: MouseEvent<HTMLAnchorElement>) => {
    const key = `trip-vault:external-host:${hostname}`;
    if (localStorage.getItem(key)) return;
    if (!window.confirm(`Open ${hostname} in a new tab?`)) { event.preventDefault(); return; }
    localStorage.setItem(key, "approved");
  };
  return <a className={className} href={href} target="_blank" rel="noreferrer" onClick={open} title={`Opens ${hostname}`}>{children}</a>;
}
