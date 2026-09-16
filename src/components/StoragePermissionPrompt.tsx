import { HardDrive, ShieldCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { localProfileId } from "../features/sync/localSync";
import { requestPersistentStorage } from "../lib/storage/offlineFiles";

type PromptState = "checking" | "ask" | "denied" | "granted" | "hidden";

export function StoragePermissionPrompt() {
  const [state, setState] = useState<PromptState>("checking");
  const [dismissKey, setDismissKey] = useState("trip-vault:storage-prompt-dismissed");

  useEffect(() => {
    let active = true;
    void (async () => {
      const profileId = await localProfileId();
      const key = `trip-vault:storage-prompt-dismissed:${profileId ?? "device"}`;
      if (!active) return;
      setDismissKey(key);
      if (sessionStorage.getItem(key) === "true") {
        setState("hidden");
        return;
      }
      const alreadyPersistent = navigator.storage?.persisted
        ? await navigator.storage.persisted().catch(() => false)
        : false;
      if (active) setState(alreadyPersistent ? "granted" : "ask");
    })();
    return () => {
      active = false;
    };
  }, []);

  const allow = async () => {
    const granted = await requestPersistentStorage().catch(() => false);
    setState(granted ? "granted" : "denied");
  };

  const dismiss = () => {
    sessionStorage.setItem(dismissKey, "true");
    setState("hidden");
  };

  if (state === "checking" || state === "hidden" || state === "granted") return null;

  return (
    <aside
      aria-label="Offline document storage"
      className="fixed inset-x-3 bottom-24 z-[70] mx-auto max-w-xl rounded-3xl border border-brand/25 bg-surface p-4 shadow-2xl sm:bottom-5 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-soft text-brand">
          <HardDrive className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="eyebrow">Offline documents</p>
          <h2 className="mt-1 font-display text-lg font-black">Keep trip files on this device?</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Allow protected browser storage so tickets, passports, and other files you save here are
            less likely to be cleared when your phone needs space.
          </p>
          {state === "denied" && (
            <p
              role="status"
              className="mt-3 rounded-xl bg-warning/10 p-3 text-xs font-bold text-warning"
            >
              Protected storage was not granted. Files are still saved locally and remain usable
              offline, but the browser may remove them under storage pressure.
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => void allow()} className="primary-button">
              <ShieldCheck className="size-4" />{" "}
              {state === "denied" ? "Try again" : "Allow device storage"}
            </button>
            {state === "denied" && (
              <Link to="/profile" onClick={dismiss} className="secondary-button">
                View storage settings
              </Link>
            )}
            <button type="button" onClick={dismiss} className="secondary-button">
              Not now
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="tap-target grid size-9 shrink-0 place-items-center rounded-full text-muted"
          aria-label="Dismiss storage request"
        >
          <X className="size-4" />
        </button>
      </div>
    </aside>
  );
}
