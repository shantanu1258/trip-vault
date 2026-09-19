import { Info } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { RequiredMark } from "./RequiredMark";

export function FieldHelp({
  label,
  children,
  required = false
}: {
  label: string;
  children: ReactNode;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="relative normal-case tracking-normal">
      <div className="flex items-center gap-1">
        <span>
          {label}
          {required && <RequiredMark />}
        </span>
        <button
          type="button"
          aria-label={`About ${label}`}
          aria-expanded={open}
          aria-controls={id}
          className="inline-flex size-11 items-center justify-center rounded-full text-muted hover:bg-elevated"
          onClick={() => setOpen(!open)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              setOpen(false);
            }
          }}
        >
          <Info className="size-4" />
        </button>
      </div>
      {open && (
        <span
          id={id}
          className="absolute inset-x-0 top-full z-40 rounded-xl border border-line bg-surface p-3 text-sm font-normal leading-6 text-ink shadow-soft"
        >
          {children}
        </span>
      )}
    </div>
  );
}
