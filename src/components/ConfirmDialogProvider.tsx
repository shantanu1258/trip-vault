import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { ModalSheet } from "./ModalSheet";

type ConfirmDialogOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
};

type PendingConfirmation = ConfirmDialogOptions & { resolve: (confirmed: boolean) => void };

const ConfirmDialogContext = createContext<((options: ConfirmDialogOptions) => Promise<boolean>) | null>(null);

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  const pendingRef = useRef<PendingConfirmation | null>(null);

  const finish = useCallback((confirmed: boolean) => {
    const current = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    current?.resolve(confirmed);
  }, []);

  const confirm = useCallback((options: ConfirmDialogOptions) => new Promise<boolean>((resolve) => {
    pendingRef.current?.resolve(false);
    const next = { ...options, resolve };
    pendingRef.current = next;
    setPending(next);
  }), []);

  return (
    <ConfirmDialogContext.Provider value={confirm}>
      {children}
      {pending && <ModalSheet eyebrow="Please confirm" title={pending.title} onClose={() => finish(false)}>
        <p className="mt-5 text-sm leading-6 text-muted">{pending.message}</p>
        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          <button type="button" className={`primary-button justify-center ${pending.tone === "danger" ? "bg-danger" : ""}`} onClick={() => finish(true)}>{pending.confirmLabel ?? "Confirm"}</button>
          <button type="button" className="secondary-button justify-center" onClick={() => finish(false)}>{pending.cancelLabel ?? "Cancel"}</button>
        </div>
      </ModalSheet>}
    </ConfirmDialogContext.Provider>
  );
}

export function useConfirmDialog() {
  const confirm = useContext(ConfirmDialogContext);
  return confirm ?? (async () => false);
}
