import { useEffect, useState } from "react";
import {
  disablePush,
  enablePush,
  getPushDevice,
  supportsPush,
  updatePushDevice,
  type PushDevice
} from "./api";
import { pushEnabled } from "./config";

export function PushSettings() {
  const [device, setDevice] = useState<PushDevice | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const available = pushEnabled && supportsPush();
  useEffect(() => {
    let mounted = true;
    getPushDevice()
      .then((value) => {
        if (mounted) setDevice(value);
      })
      .catch((error) => {
        if (mounted) setMessage(error.message);
      });
    return () => {
      mounted = false;
    };
  }, []);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="surface-card p-3 sm:p-5" aria-labelledby="push-settings-title">
      <p className="eyebrow">This device</p>
      <h2 id="push-settings-title" className="mt-1 font-display text-xl font-black">
        Notifications
      </h2>
      <p className="mt-3 text-sm text-muted">
        Updates include item names and change details, such as amounts and times, which may appear
        on your lock screen. Private notes and booking references are excluded. Delivery needs
        internet and may be delayed.
      </p>
      {!pushEnabled ? (
        <p className="mt-3 text-sm text-muted">
          Push notifications will be available after server setup. In-app alerts still work.
        </p>
      ) : !supportsPush() ? (
        <p className="mt-3 text-sm text-muted">
          Use a supported browser over HTTPS. On iPhone or iPad, add Trip Vault to your Home Screen
          and open it there.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {device ? (
            <>
              {(
                [
                  ["event_changes", "Event additions and changes"],
                  ["cost_changes", "Expense additions and changes"],
                  [
                    "reminders",
                    "Remind me one hour before timed events, 48 hours before travel, and five days before flights and buses"
                  ]
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={device[key]}
                    disabled={busy}
                    onChange={(event) => {
                      const next = { ...device, [key]: event.target.checked };
                      void run(async () => {
                        await updatePushDevice(next);
                        setDevice(next);
                      });
                    }}
                  />
                  {label}
                </label>
              ))}
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await disablePush();
                    setDevice(null);
                    setMessage("Notifications disabled on this device.");
                  })
                }
              >
                Disable on this device
              </button>
            </>
          ) : (
            <button
              type="button"
              className="primary-button"
              disabled={busy || !available}
              onClick={() =>
                void run(async () => {
                  setDevice(await enablePush());
                  setMessage("Notifications enabled on this device.");
                })
              }
            >
              Enable notifications on this device
            </button>
          )}
        </div>
      )}
      {message && (
        <p role="status" className="mt-3 text-sm">
          {message}
        </p>
      )}
    </section>
  );
}
