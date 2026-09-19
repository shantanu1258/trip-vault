import { ArrowLeft } from "lucide-react";
import { useEffect, useId, type ReactNode } from "react";
import { useModalHistory } from "./ModalHistoryProvider";

export function ModalSheet({
  title,
  eyebrow,
  onClose,
  manageHistory = true,
  placement = "center",
  children
}: {
  title: string;
  eyebrow: string;
  onClose: () => void;
  manageHistory?: boolean;
  placement?: "center" | "end";
  children: ReactNode;
}) {
  const titleId = useId();
  useModalHistory(onClose, manageHistory);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div
      className={`fixed inset-0 z-[70] flex items-end justify-center bg-black/50 ${
        placement === "end" ? "sm:items-stretch sm:justify-end sm:p-4" : "sm:items-center sm:p-6"
      }`}
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className={`sheet-enter max-h-[94dvh] w-full overflow-y-auto rounded-t-3xl bg-surface p-4 shadow-focus sm:rounded-3xl sm:p-6 ${
          placement === "end" ? "sm:h-full sm:max-h-full sm:max-w-md" : "max-w-xl"
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-xs text-muted" title={eyebrow}>
              {eyebrow}
            </p>
            <h2 id={titleId} className="mt-1 font-display text-xl font-black sm:text-2xl">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="tap-target inline-flex shrink-0 items-center justify-center gap-2 rounded-xl px-2 text-sm font-bold"
            aria-label="Back"
          >
            <ArrowLeft className="size-5" />
            <span className="hidden sm:inline">Back</span>
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
