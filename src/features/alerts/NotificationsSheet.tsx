import { Bell, ChevronRight } from "lucide-react";
import { ModalSheet } from "../../components/ModalSheet";
import type { DerivedAlert } from "./engine";

export function NotificationsSheet({
  alerts,
  tripNames,
  loading,
  error,
  onClose,
  onOpen
}: {
  alerts: DerivedAlert[];
  tripNames: Map<string, string>;
  loading: boolean;
  error: boolean;
  onClose: () => void;
  onOpen: (target: string) => void;
}) {
  return (
    <ModalSheet
      title="Notifications"
      eyebrow="Active reminders"
      onClose={onClose}
      manageHistory={false}
    >
      {loading && (
        <p role="status" className="mt-4 text-sm text-muted">
          Checking notifications…
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm text-danger">
          Notifications could not be refreshed. Try again shortly.
        </p>
      )}
      {!loading && !error && alerts.length === 0 && (
        <div className="py-8 text-center">
          <Bell className="mx-auto size-6 text-muted" aria-hidden="true" />
          <p className="mt-3 font-bold">You're all caught up</p>
          <p className="mt-1 text-sm text-muted">No active notifications right now.</p>
        </div>
      )}
      {(["urgent", "today", "upcoming"] as const).map((group) => {
        const items = alerts.filter((item) => item.group === group);
        if (!items.length) return null;
        return (
          <section key={group} className="mt-5">
            <h3
              className={`mb-2 text-xs font-bold ${group === "urgent" ? "text-danger" : "text-muted"}`}
            >
              {group === "urgent" ? "Needs attention" : group === "today" ? "Today" : "Upcoming"}
            </h3>
            <div className="space-y-2">
              {items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onOpen(item.target ?? "/alerts")}
                  aria-label={`Open notification: ${item.title}`}
                  className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left hover:bg-elevated ${group === "urgent" ? "border-danger/35" : "border-line"}`}
                >
                  <span className="min-w-0 flex-1">
                    {item.tripId && tripNames.has(item.tripId) && (
                      <span className="mb-1 block truncate text-xs text-muted">
                        {tripNames.get(item.tripId)}
                      </span>
                    )}
                    <span className="block text-sm font-bold">{item.title}</span>
                    <span className="mt-1 block text-xs leading-5 text-muted">{item.detail}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden="true" />
                </button>
              ))}
            </div>
          </section>
        );
      })}
      <button
        type="button"
        className="secondary-button mt-5 w-full justify-center"
        onClick={() => onOpen("/alerts")}
      >
        Manage all notifications
      </button>
    </ModalSheet>
  );
}
