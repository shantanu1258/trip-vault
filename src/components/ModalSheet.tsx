import { ArrowLeft } from "lucide-react";
import { useEffect, useId, type ReactNode } from "react";
import { useModalHistory } from "./ModalHistoryProvider";

export function ModalSheet({
  title,
  eyebrow,
  onClose,
  manageHistory = true,
  children
}: {
  title: string;
  eyebrow: string;
  onClose: () => void;
  manageHistory?: boolean;
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
      className="fixed inset-0 z-[70] flex items-end justify-center bg-brand/55 sm:items-center sm:p-6"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="sheet-enter max-h-[94dvh] w-full max-w-xl overflow-y-auto rounded-t-[2rem] bg-surface p-5 shadow-focus sm:rounded-[2rem] sm:p-7"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h2 id={titleId} className="mt-2 font-display text-2xl font-black">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="tap-target inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-3 text-sm font-bold"
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
