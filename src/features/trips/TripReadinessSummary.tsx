import { ChevronRight, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { TripDetailsSection } from "./TripDetailsSection";

type ProgressProps = { resolved: number; total: number; detailed?: boolean };

/** Determinate progress, not a loading spinner: readiness never implies work in flight. */
export function ReadinessProgress({ resolved, total, detailed = false }: ProgressProps) {
  const percent = total ? Math.round((resolved / total) * 100) : 0;
  const complete = total > 0 && resolved === total;
  return (
    <span className="block min-w-0 flex-1">
      <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="block text-sm font-bold leading-5">
          {detailed ? (total ? `${resolved} of ${total} tasks done` : "No tasks yet") : "Readiness"}
        </span>
        <span className="block text-xs leading-5 text-muted">
          {detailed
            ? total
              ? complete
                ? "All tasks complete"
                : `${total - resolved} remaining`
              : "Add what you need before you go"
            : total
              ? `${resolved} of ${total} tasks done`
              : "No tasks yet"}
        </span>
      </span>
      <span
        role="progressbar"
        aria-label="Readiness progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={total ? `${resolved} of ${total} tasks done` : "No tasks yet"}
        className="mt-2 block h-1 overflow-hidden rounded-full bg-elevated"
      >
        <span className="block h-full rounded-full bg-success" style={{ width: `${percent}%` }} />
      </span>
    </span>
  );
}

export function TripReadinessSection({
  resolved,
  total,
  href,
  navigationState,
  onOpen,
  onAddTask,
  id = "readiness"
}: ProgressProps & {
  href?: string;
  navigationState?: unknown;
  onOpen?: () => void;
  onAddTask?: () => void;
  id?: string;
}) {
  return (
    <TripDetailsSection
      id={id}
      eyebrow="Before you go"
      title="Readiness checklist"
      action={
        onAddTask && (
          <button type="button" className="secondary-button" onClick={onAddTask}>
            <Plus className="size-4" /> Add task
          </button>
        )
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <ReadinessProgress resolved={resolved} total={total} detailed />
        {href ? (
          <Link
            className="inline-flex min-h-11 items-center gap-1 text-xs font-bold text-brand"
            to={href}
            state={navigationState}
          >
            Open checklist <ChevronRight className="size-4" />
          </Link>
        ) : (
          <button
            type="button"
            className="inline-flex min-h-11 items-center gap-1 text-xs font-bold text-brand"
            onClick={onOpen}
          >
            Open checklist <ChevronRight className="size-4" />
          </button>
        )}
      </div>
    </TripDetailsSection>
  );
}
