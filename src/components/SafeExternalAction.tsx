import type { MouseEvent, ReactNode } from "react";
import { useConfirmDialog } from "./ConfirmDialogProvider";

export function SafeExternalAction({
  href,
  children,
  className = "secondary-button"
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  const confirm = useConfirmDialog();
  const hostname = new URL(href).hostname;
  const open = async (event: MouseEvent<HTMLAnchorElement>) => {
    const key = `trip-vault:external-host:${hostname}`;
    if (localStorage.getItem(key)) return;
    event.preventDefault();
    if (
      !(await confirm({
        title: "Leave Trip Vault?",
        message: `Open ${hostname} in a new tab?`,
        confirmLabel: "Open website"
      }))
    )
      return;
    localStorage.setItem(key, "approved");
    window.open(href, "_blank", "noopener,noreferrer");
  };
  return (
    <a
      className={className}
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={open}
      title={`Opens ${hostname}`}
    >
      {children}
    </a>
  );
}
