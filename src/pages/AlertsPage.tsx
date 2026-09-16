import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bell,
  BellRing,
  CheckCheck,
  Clock3,
  Info,
  Plus,
  RotateCcw,
  TimerReset,
  X
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { ModalSheet } from "../components/ModalSheet";
import { EmptyState, ErrorCard, LoadingCard, PageHeader } from "../components/TripUi";
import { deriveAlerts, unreadAlertCount } from "../features/alerts/engine";
import { addReminder, listTrips, setAlertState } from "../features/trips/api";
import { localDateTimeToIso } from "../features/trips/validation";
import { alertInputsQueryOptions } from "../features/alerts/load";

export function AlertsPage() {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [view, setView] = useState<"visible" | "dismissed">("visible");
  const query = useQuery(alertInputsQueryOptions(queryClient));
  const visibleAlerts = query.data ? deriveAlerts(query.data) : [];
  const alerts = query.data ? deriveAlerts(query.data, view) : [];
  const unread = query.data ? unreadAlertCount(visibleAlerts, query.data.states) : 0;
  const stateMutation = useMutation({
    mutationFn: setAlertState,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["alerts"] })
  });
  const markAllRead = () =>
    Promise.all(
      visibleAlerts.map((alert) => setAlertState({ alertKey: alert.key, read: true }))
    ).then(() => queryClient.invalidateQueries({ queryKey: ["alerts"] }));
  const snooze = (alertKey: string) =>
    stateMutation.mutate({
      alertKey,
      snoozedUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString()
    });

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl">
        <PageHeader
          eyebrow="On-app reminders"
          title="Alerts"
          text="Recomputed from your latest trip data whenever the app is open. No paid push service is required."
          action={
            <div className="flex gap-2">
              {unread > 0 && view === "visible" && (
                <button className="secondary-button" onClick={markAllRead}>
                  <CheckCheck className="size-4" /> Mark all read
                </button>
              )}
              <button className="primary-button" onClick={() => setAdding(true)}>
                <Plus className="size-4" /> Reminder
              </button>
            </div>
          }
        />
        <div className="mt-5 inline-flex rounded-xl bg-elevated p-1">
          <button
            type="button"
            onClick={() => setView("visible")}
            aria-pressed={view === "visible"}
            className={`tap-target rounded-lg px-4 text-sm font-bold ${view === "visible" ? "bg-surface shadow-soft" : "text-muted"}`}
          >
            Current
          </button>
          <button
            type="button"
            onClick={() => setView("dismissed")}
            aria-pressed={view === "dismissed"}
            className={`tap-target rounded-lg px-4 text-sm font-bold ${view === "dismissed" ? "bg-surface shadow-soft" : "text-muted"}`}
          >
            Dismissed
          </button>
        </div>
        {query.isLoading && <LoadingCard label="Checking what needs attention" />}
        {query.error && <ErrorCard error={query.error} />}
        {query.data && alerts.length === 0 && (
          <EmptyState
            icon={<Bell className="size-7" />}
            title={view === "dismissed" ? "No dismissed alerts" : "Nothing needs your attention"}
            text={
              view === "dismissed"
                ? "Alerts you dismiss will remain available here for this exact occurrence."
                : "Delays, cancellations, upcoming departures, readiness deadlines, expiry buffers, and your reminders will appear here."
            }
            action={
              view === "visible" ? (
                <button className="primary-button" onClick={() => setAdding(true)}>
                  Add reminder
                </button>
              ) : undefined
            }
          />
        )}
        {(["urgent", "today", "upcoming"] as const).map((group) => {
          const items = alerts.filter((alert) => alert.group === group);
          if (!items.length) return null;
          const Icon = group === "urgent" ? AlertTriangle : group === "today" ? BellRing : Clock3;
          return (
            <section className="mt-7" key={group}>
              <h2 className="mb-3 flex items-center gap-2 font-display text-xl font-black capitalize">
                <Icon
                  className={`size-5 ${group === "urgent" ? "text-danger" : group === "today" ? "text-warning" : "text-brand"}`}
                />
                {group}
              </h2>
              <div className="space-y-3">
                {items.map((alert) => (
                  <article
                    key={alert.key}
                    className={`surface-card flex items-start gap-4 p-5 ${group === "urgent" ? "border-danger/35" : ""}`}
                  >
                    <span
                      className={`mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl ${group === "urgent" ? "bg-danger/10 text-danger" : "bg-brand-soft text-brand"}`}
                    >
                      <Info className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-display text-lg font-black">{alert.title}</h3>
                      <p className="mt-1 text-sm leading-6 text-muted">{alert.detail}</p>
                      {alert.target && (
                        <Link
                          className="mt-3 inline-block text-sm font-extrabold text-brand"
                          to={alert.target}
                        >
                          Open item
                        </Link>
                      )}
                    </div>
                    {view === "visible" ? (
                      <div className="flex shrink-0 flex-col gap-1">
                        <button
                          type="button"
                          onClick={() => snooze(alert.key)}
                          className="tap-target grid size-10 place-items-center rounded-xl border border-line text-muted"
                          aria-label={`Snooze ${alert.title} for one hour`}
                        >
                          <TimerReset className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            stateMutation.mutate({ alertKey: alert.key, dismissed: true })
                          }
                          className="tap-target grid size-10 place-items-center rounded-xl border border-line text-muted"
                          aria-label={`Dismiss ${alert.title}`}
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          stateMutation.mutate({ alertKey: alert.key, dismissed: false })
                        }
                        className="tap-target grid size-10 shrink-0 place-items-center rounded-xl border border-line text-muted"
                        aria-label={`Restore ${alert.title}`}
                      >
                        <RotateCcw className="size-4" />
                      </button>
                    )}
                  </article>
                ))}
              </div>
            </section>
          );
        })}
        {adding && (
          <ReminderForm trips={query.data?.trips ?? []} onClose={() => setAdding(false)} />
        )}
      </div>
    </AppShell>
  );
}

function ReminderForm({
  trips,
  onClose
}: {
  trips: Awaited<ReturnType<typeof listTrips>>;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const mutation = useMutation({
    mutationFn: addReminder,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["alerts"] }),
        queryClient.invalidateQueries({ queryKey: ["reminders-badge"] })
      ]);
      onClose();
    }
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") ?? "").trim();
    const dueAt = String(form.get("dueAt") ?? "");
    if (!title || !dueAt) {
      setMessage("Enter a title and reminder time.");
      return;
    }
    const tripId = String(form.get("tripId") ?? "");
    const timezone =
      trips.find((trip) => trip.id === tripId)?.primary_timezone ??
      Intl.DateTimeFormat().resolvedOptions().timeZone;
    mutation.mutate({
      title,
      tripId: tripId || undefined,
      dueAt: localDateTimeToIso(dueAt, timezone),
      severity: String(form.get("severity")) as never
    });
  };
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 16);
  return (
    <ModalSheet eyebrow="Personal alert" title="Add a reminder" onClose={onClose}>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <label className="form-label">
          Reminder
          <input
            autoFocus
            className="form-input"
            name="title"
            placeholder="Complete online check-in"
          />
        </label>
        <label className="form-label">
          Trip (optional)
          <select className="form-input" name="tripId">
            <option value="">No trip</option>
            {trips.map((trip) => (
              <option key={trip.id} value={trip.id}>
                {trip.title}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="form-label">
            When
            <input
              className="form-input"
              type="datetime-local"
              name="dueAt"
              defaultValue={tomorrow}
            />
          </label>
          <label className="form-label">
            Importance
            <select className="form-input" name="severity">
              <option value="upcoming">Upcoming</option>
              <option value="today">Today</option>
              <option value="urgent">Urgent</option>
              <option value="information">Information</option>
            </select>
          </label>
        </div>
        {(message || mutation.error) && (
          <p role="alert" className="text-sm font-bold text-danger">
            {message || "Could not save reminder."}
          </p>
        )}
        <button className="primary-button w-full">Save reminder</button>
      </form>
    </ModalSheet>
  );
}
