import { RefreshCw, X } from "lucide-react";
import { useRegisterSW } from "virtual:pwa-register/react";

export function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker
  } = useRegisterSW({ immediate: true });

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
              onClick={() => updateServiceWorker(true)}
            >
              Reload and update
            </button>
          )}
        </div>
        <button
          type="button"
          aria-label="Dismiss update message"
          className="tap-target grid size-10 place-items-center rounded-xl text-muted"
          onClick={() => (needRefresh ? setNeedRefresh(false) : setOfflineReady(false))}
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
