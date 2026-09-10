import { X } from "lucide-react";
import type { ReactNode } from "react";

export function ModalSheet({ title, eyebrow, onClose, children }: { title: string; eyebrow: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-brand/55 sm:items-center sm:p-6" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="sheet-enter max-h-[94dvh] w-full max-w-xl overflow-y-auto rounded-t-[2rem] bg-surface p-5 shadow-focus sm:rounded-[2rem] sm:p-7" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <div className="flex items-start justify-between gap-4">
          <div><p className="eyebrow">{eyebrow}</p><h2 id="sheet-title" className="mt-2 font-display text-2xl font-black">{title}</h2></div>
          <button type="button" onClick={onClose} className="tap-target grid size-11 place-items-center rounded-full border border-line" aria-label="Close"><X className="size-5" /></button>
        </div>
        {children}
      </section>
    </div>
  );
}
