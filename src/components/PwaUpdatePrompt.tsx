import { RefreshCw, X } from "lucide-react";
import { useRef, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { reloadWithServiceWorkerUpdate } from "../lib/pwa/update";

export function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady]
  } = useRegisterSW({ immediate: true });
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);

  const applyUpdate = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setUpdating(true);
    setError("");
    try {
      await reloadWithServiceWorkerUpdate({
        getRegistration: () => navigator.serviceWorker.getRegistration(),
        reload: () => window.location.reload()
      });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Update failed. Please try again.");
    } finally {
      inFlight.current = false;
      setUpdating(false);
    }
  };

  if (!needRefresh && !offlineReady) return null;

  return (
    <div
      className="fixed inset-x-4 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-[70] mx-auto max-w-md rounded-2xl border border-line bg-surface p-4 text-ink shadow-focus"
      role="status"
    >
      <div className="flex items-start gap-3">
        <RefreshCw className="mt-0.5 size-5 shrink-0 text-brand" />
        <div className="min-w-0 flex-1">
          <p className="font-display font-black">
            {needRefresh ? "Update ready" : "Ready offline"}
          </p>
          <p className="mt-1 text-sm text-muted">
            {needRefresh
              ? "Reload when you have finished editing or uploading."
              : "The application shell is cached on this device."}
          </p>
          {needRefresh && (
            <button
              type="button"
              className="primary-button mt-3"
              disabled={updating}
              onClick={() => void applyUpdate()}
            >
              {updating ? "Updating…" : error ? "Retry update" : "Reload and update"}
            </button>
          )}
          {error && (
            <p role="alert" className="mt-2 text-sm text-danger">
              {error}
            </p>
          )}
        </div>
        <button
          type="button"
          aria-label="Dismiss update message"
          disabled={updating}
          className="tap-target grid size-10 place-items-center rounded-xl text-muted"
          onClick={() => (needRefresh ? setNeedRefresh(false) : setOfflineReady(false))}
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
