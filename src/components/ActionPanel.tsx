import { Pencil } from "lucide-react";
import type { ReactNode } from "react";

type ActionPanelProps = {
  title: string;
  description: string;
  editing: boolean;
  actionLabel?: string;
  onToggle: () => void;
  children?: ReactNode;
};

/** A consistent summary/edit surface used by settings and information sheets. */
export function ActionPanel({
  title,
  description,
  editing,
  actionLabel = "Edit",
  onToggle,
  children
}: ActionPanelProps) {
  return (
    <section className="mt-4 rounded-2xl border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black">{title}</p>
          <p className="mt-1 text-xs leading-5 text-muted">{description}</p>
        </div>
        <button
          type="button"
          className="secondary-button min-h-11 shrink-0 px-4"
          onClick={onToggle}
        >
          {!editing && <Pencil className="size-4" />}
          {editing ? "Cancel" : actionLabel}
        </button>
      </div>
      {editing && <div className="mt-4">{children}</div>}
    </section>
  );
}
