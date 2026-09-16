import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  Loader2,
  MapPin,
  Plus,
  WalletCards
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  formatDateRange,
  formatMoney,
  groupCostTotals,
  tripPhase
} from "../features/trips/presentation";
import type { Trip, TripCost } from "../features/trips/types";
import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  text,
  action
}: {
  eyebrow: string;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-enter flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-2 font-display text-3xl font-black tracking-[-0.045em] sm:text-4xl">
          {title}
        </h1>
        {text && <p className="mt-2 max-w-2xl text-sm leading-6 text-muted sm:text-base">{text}</p>}
      </div>
      {action}
    </header>
  );
}

export function LoadingCard({ label = "Loading your trip" }: { label?: string }) {
  return (
    <div className="surface-card mt-6 flex min-h-48 items-center justify-center gap-3 p-6 text-sm font-bold text-muted">
      <Loader2 className="size-5 animate-spin text-brand motion-reduce:animate-none" /> {label}
    </div>
  );
}

export function ErrorCard({
  error,
  title = "We could not load this"
}: {
  error: unknown;
  title?: string;
}) {
  const message =
    typeof error === "object" && error && "message" in error
      ? String(error.message)
      : "Please check your connection and try again.";
  return (
    <div
      role="alert"
      className="mt-6 flex gap-3 rounded-2xl border border-danger/30 bg-danger/10 p-4"
    >
      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" />
      <div>
        <p className="font-extrabold">{title}</p>
        <p className="mt-1 text-sm text-muted">{message}</p>
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  text,
  action,
  secondary
}: {
  icon: ReactNode;
  title: string;
  text: string;
  action?: ReactNode;
  secondary?: ReactNode;
}) {
  return (
    <section className="surface-card page-enter mt-6 grid min-h-[24rem] place-items-center p-7 text-center">
      <div className="max-w-md">
        <span className="mx-auto grid size-16 place-items-center rounded-[1.4rem] bg-brand-soft text-brand">
          {icon}
        </span>
        <h2 className="mt-6 font-display text-2xl font-black tracking-[-0.035em]">{title}</h2>
        <p className="mt-3 text-sm leading-6 text-muted">{text}</p>
        {(action || secondary) && (
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {action}
            {secondary}
          </div>
        )}
      </div>
    </section>
  );
}

export function PrimaryLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="tap-target inline-flex items-center justify-center gap-2 rounded-2xl bg-brand px-5 py-3 text-sm font-extrabold text-surface"
    >
      {children}
      <ArrowRight className="size-4" />
    </Link>
  );
}

export function TripCard({ trip, emphasized = false }: { trip: Trip; emphasized?: boolean }) {
  const phase = tripPhase(trip);
  return (
    <Link
      to={`/trips/${trip.id}`}
      className={`group block rounded-[1.6rem] border bg-surface p-5 shadow-soft transition-transform duration-200 ease-settle hover:-translate-y-0.5 motion-reduce:hover:translate-y-0 ${emphasized ? "border-coral shadow-focus motion-safe:scale-[1.01]" : "border-line"}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-[0.62rem] font-black uppercase tracking-[0.13em] ${phase === "current" ? "bg-coral/15 text-coral" : "bg-brand-soft text-brand"}`}
            >
              {phase === "current" ? "Current trip" : phase}
            </span>
            <span className="text-xs font-bold text-muted">
              {formatDateRange(trip.start_date, trip.end_date)}
            </span>
          </div>
          <h2 className="mt-3 truncate font-display text-2xl font-black tracking-[-0.035em]">
            {trip.title}
          </h2>
          <p className="mt-2 flex items-center gap-2 text-sm text-muted">
            <MapPin className="size-4 shrink-0" />
            {trip.destination_summary}
          </p>
        </div>
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-soft text-brand transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none">
          <ArrowRight className="size-5" />
        </span>
      </div>
    </Link>
  );
}

export function CostTotals({
  costs,
  emptyText = "No costs added yet"
}: {
  costs: TripCost[];
  emptyText?: string;
}) {
  const totals = Object.entries(groupCostTotals(costs));
  return (
    <div className="rounded-2xl bg-elevated p-4">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-muted">
        <WalletCards className="size-4" /> Total trip cost
      </div>
      {totals.length ? (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {totals.map(([currency, amount]) => (
            <strong key={currency} className="font-display text-xl">
              {formatMoney(amount, currency)}
            </strong>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted">{emptyText}</p>
      )}
      {costs.some((cost) => cost.payment_status === "refunded") && (
        <p className="mt-1 text-xs text-muted">Refunded items are excluded.</p>
      )}
    </div>
  );
}

export function CompactCostTotal({
  costs,
  emptyText = "No costs added yet",
  inverse = false
}: {
  costs: TripCost[];
  emptyText?: string;
  inverse?: boolean;
}) {
  const totals = Object.entries(groupCostTotals(costs));
  const value = totals.length
    ? totals.map(([currency, amount]) => formatMoney(amount, currency)).join(" + ")
    : emptyText;
  return (
    <span
      className={`inline-flex min-w-0 items-center gap-2 text-sm ${inverse ? "text-surface/70" : "text-muted"}`}
    >
      <WalletCards className="size-4 shrink-0" />
      <span className="font-bold">Total trip cost</span>
      <strong
        className={`truncate font-display text-base ${inverse ? "text-surface" : "text-ink"}`}
      >
        {value}
      </strong>
    </span>
  );
}

export function AddButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="tap-target inline-flex items-center justify-center gap-2 rounded-2xl border border-line bg-surface px-4 py-2.5 text-sm font-extrabold hover:border-brand/40"
    >
      <Plus className="size-4" />
      {children}
    </button>
  );
}

export function DatePill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-brand-soft px-3 py-1.5 text-xs font-bold text-brand">
      <CalendarDays className="size-3.5" />
      {children}
    </span>
  );
}
