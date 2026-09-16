import type { ReactNode } from "react";

type TripDetailsSectionProps = {
  id: string;
  title: string;
  eyebrow: string;
  count?: number;
  action?: ReactNode;
  onActivate?: (trigger: HTMLButtonElement) => void;
  activateLabel?: string;
  children: ReactNode;
};

/** Shared trip-details surface used by live trips and the local interactive demo. */
export function TripDetailsSection({
  id,
  title,
  eyebrow,
  count,
  action,
  onActivate,
  activateLabel,
  children
}: TripDetailsSectionProps) {
  return (
    <section
      id={id}
      data-trip-scroll-anchor="details"
      className={`surface-card group relative scroll-mt-28 p-5 sm:p-6 ${
        onActivate
          ? "transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-soft motion-reduce:hover:translate-y-0"
          : ""
      }`}
    >
      {onActivate && (
        <button
          type="button"
          className="absolute inset-0 z-10 cursor-pointer rounded-[inherit] focus-visible:ring-2 focus-visible:ring-brand"
          onClick={(event) => onActivate(event.currentTarget)}
          aria-label={activateLabel ?? `Edit ${title}`}
        />
      )}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow">{eyebrow}</p>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="break-words font-display text-2xl font-black [overflow-wrap:anywhere]">
              {title}
            </h2>
            {typeof count === "number" && (
              <span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-black text-brand">
                {count}
              </span>
            )}
          </div>
        </div>
        {action && <div className={onActivate ? "relative z-20" : ""}>{action}</div>}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}
