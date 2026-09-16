import { Loader2, Search, ServerOff, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { Brand } from "../../components/Brand";
import { ThemeToggle } from "../../components/ThemeToggle";
import { getErrorMessage } from "../trips/presentation";

export type AdminNavigationItem = {
  label: string;
  description: string;
  icon: LucideIcon;
  path: string;
};

export function AdminShell({
  online,
  navigation,
  children
}: {
  online: boolean;
  navigation: AdminNavigationItem[];
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh min-w-0 overflow-x-clip bg-canvas text-ink">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-8 sm:py-4">
          <Brand />
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden rounded-full bg-brand-soft px-3 py-2 text-xs font-bold text-brand sm:inline">
              Administrator
            </span>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <div className="mx-auto grid min-w-0 max-w-7xl lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-8 lg:px-8">
        <aside className="sticky top-0 z-40 min-w-0 border-b border-line bg-canvas/95 px-4 py-3 backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:px-0 lg:py-8">
          <p className="mb-2 text-[.65rem] font-black uppercase tracking-[.16em] text-muted lg:px-3">
            Admin sections
          </p>
          <nav
            aria-label="Administrator sections"
            className="flex min-w-0 snap-x gap-2 overflow-x-auto pb-1 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0"
          >
            {navigation.map(({ label, icon: Icon, path }) => (
              <NavLink
                end={path === "/admin"}
                key={path}
                to={path}
                className={({ isActive }) =>
                  `tap-target flex shrink-0 snap-start items-center gap-2 whitespace-nowrap rounded-xl px-3 text-sm font-bold lg:w-full ${isActive ? "bg-brand text-surface" : "border border-line bg-surface text-muted hover:border-brand/40 lg:border-transparent lg:bg-transparent lg:hover:bg-surface"}`
                }
              >
                <Icon className="size-4 shrink-0" />
                {label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 px-4 pb-12 pt-6 sm:px-6 lg:px-0 lg:pt-8">
          {!online && (
            <div className="mb-5 flex gap-3 rounded-2xl border border-warning/30 bg-warning/10 p-4">
              <ServerOff className="size-5 shrink-0 text-warning" />
              <div className="min-w-0">
                <p className="font-extrabold">Read-only while offline</p>
                <p className="mt-1 text-sm text-muted">
                  You can review cached information, but Admin changes are never queued.
                </p>
              </div>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}

export function AdminPageHeader({
  eyebrow,
  title,
  text,
  action
}: {
  eyebrow: string;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-2 break-words font-display text-3xl font-black tracking-[-.04em] [overflow-wrap:anywhere] sm:text-4xl">
          {title}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{text}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

export function AdminField({
  label,
  hint,
  required,
  className = "",
  children
}: {
  label: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`form-label min-w-0 ${className}`}>
      <span>
        {required && <span className="required-mark mr-0.5 text-danger">*</span>}
        {label}
      </span>
      {children}
      {hint && (
        <span className="mt-1.5 block text-xs font-normal leading-5 text-muted">{hint}</span>
      )}
    </label>
  );
}

export function AdminQueryState({
  loading,
  error,
  empty,
  emptyMessage
}: {
  loading: boolean;
  error: unknown;
  empty: boolean;
  emptyMessage: string;
}) {
  if (loading) {
    return (
      <p
        role="status"
        className="mt-5 flex items-center gap-2 rounded-2xl bg-surface p-4 text-sm text-muted"
      >
        <Loader2 className="size-4 animate-spin" /> Loading…
      </p>
    );
  }
  if (error) {
    return (
      <p role="alert" className="mt-5 rounded-2xl bg-danger/10 p-4 text-sm font-bold text-danger">
        {getErrorMessage(error)}
      </p>
    );
  }
  if (empty) {
    return <p className="surface-card mt-5 border-dashed p-6 text-sm text-muted">{emptyMessage}</p>;
  }
  return null;
}

export function AdminFormIntro({
  title,
  description,
  onCancel
}: {
  title: string;
  description: string;
  onCancel?: () => void;
}) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-3 sm:col-span-2">
      <div className="min-w-0">
        <h2 className="break-words font-display text-lg font-black [overflow-wrap:anywhere]">
          {title}
        </h2>
        <p className="mt-1 text-xs leading-5 text-muted">{description}</p>
      </div>
      {onCancel && (
        <button type="button" className="secondary-button shrink-0 px-3" onClick={onCancel}>
          Cancel
        </button>
      )}
    </div>
  );
}

export function AdminCatalogSearch({
  value,
  onChange,
  count,
  label
}: {
  value: string;
  onChange: (value: string) => void;
  count: number;
  label: string;
}) {
  return (
    <div className="mt-6 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <AdminField label={`Search ${label}`} className="w-full sm:max-w-md">
        <span className="relative block">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            className="form-input pl-10"
            type="search"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={`Search ${label} by name or code`}
          />
        </span>
      </AdminField>
      <p className="shrink-0 pb-3 text-xs font-bold text-muted">
        {count} {count === 1 ? label.replace(/s$/, "") : label}
      </p>
    </div>
  );
}
