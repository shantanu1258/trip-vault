import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  FileText,
  Luggage,
  MapPin,
  Plane,
  RotateCcw,
  ShieldCheck,
  UsersRound,
  WifiOff,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { DocumentChip } from "../components/DocumentChip";
import { FocusSurface } from "../components/FocusSurface";
import { demoDocuments, demoEvents, demoPhaseCopy, demoTasks, demoTravelers, documentById } from "../demo/data";
import type { DemoEvent, DemoPhase } from "../demo/types";
import { database } from "../lib/local-db/database";

const phases: DemoPhase[] = ["planning", "predeparture", "travelday", "intrip", "completed"];

function EventDetails({ event, onClose }: { event: DemoEvent; onClose: () => void }) {
  const documents = event.documentIds.flatMap((id) => {
    const document = documentById.get(id);
    return document ? [document] : [];
  });

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-brand/50 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-[2rem] bg-surface p-5 shadow-focus sm:rounded-[2rem] sm:p-7" role="dialog" aria-modal="true" aria-labelledby="event-title">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">{event.eyebrow}</p>
            <h2 id="event-title" className="mt-2 font-display text-2xl font-black tracking-[-0.03em]">{event.title}</h2>
          </div>
          <button type="button" onClick={onClose} className="tap-target grid size-11 shrink-0 place-items-center rounded-full border border-line bg-elevated" aria-label="Close event details"><X className="size-5" /></button>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-brand-soft p-4"><Clock3 className="size-4 text-brand" /><p className="mt-2 text-sm font-extrabold">{event.timeLabel}{event.endTimeLabel ? ` - ${event.endTimeLabel}` : ""}</p><p className="mt-1 text-xs text-muted">{event.dayLabel} · {event.dateLabel}</p></div>
          <div className="rounded-2xl bg-brand-soft p-4"><MapPin className="size-4 text-brand" /><p className="mt-2 text-sm font-extrabold">Location saved</p><p className="mt-1 line-clamp-2 text-xs text-muted">{event.location}</p></div>
        </div>
        <p className="mt-5 text-sm leading-6 text-muted">{event.note}</p>

        <div className="mt-7 flex items-center justify-between">
          <div><p className="eyebrow">Documents</p><h3 className="mt-1 font-display text-lg font-extrabold">{documents.length} attached</h3></div>
          <Link className="tap-target inline-flex items-center rounded-full border border-line bg-elevated px-4 text-sm font-bold" to="/sign-in">Sign in to add</Link>
        </div>
        <div className="mt-3 space-y-2.5">
          {documents.length ? documents.map((document) => <DocumentChip key={document.id} document={document} />) : <p className="rounded-2xl border border-dashed border-line p-5 text-sm text-muted">No documents are attached to this event yet.</p>}
        </div>

        <div className="mt-7 border-t border-line pt-5">
          <p className="eyebrow">Travelers</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {demoTravelers.filter((traveler) => event.travelerIds.includes(traveler.id)).map((traveler) => (
              <span key={traveler.id} className="inline-flex items-center gap-2 rounded-full border border-line bg-elevated py-1.5 pl-1.5 pr-3 text-xs font-bold">
                <span className="grid size-6 place-items-center rounded-full text-[0.55rem] font-black text-white" style={{ background: traveler.color }}>{traveler.initials}</span>{traveler.name}
              </span>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

export function DemoTripPage() {
  const [phase, setPhase] = useState<DemoPhase>("travelday");
  const [selectedEvent, setSelectedEvent] = useState<DemoEvent | null>(null);
  const [focusedTravelerId, setFocusedTravelerId] = useState<string | null>(null);
  const [taskStatuses, setTaskStatuses] = useState<Record<string, "to_check" | "complete">>(() => Object.fromEntries(demoTasks.map((task) => [task.id, task.status])));
  const copy = demoPhaseCopy[phase];
  const visibleEvents = useMemo(() => focusedTravelerId ? demoEvents.filter((event) => event.travelerIds.includes(focusedTravelerId)) : demoEvents, [focusedTravelerId]);
  const visibleTasks = useMemo(() => focusedTravelerId ? demoTasks.filter((task) => task.travelerIds.length === 0 || task.travelerIds.includes(focusedTravelerId)) : demoTasks, [focusedTravelerId]);
  const activeEvent = visibleEvents.find((event) => event.id === copy.activeEventId) ?? visibleEvents[0] ?? demoEvents[0];
  const completedTasks = visibleTasks.filter((task) => taskStatuses[task.id] === "complete").length;
  const readinessPercent = visibleTasks.length ? Math.round(completedTasks / visibleTasks.length * 100) : 100;
  const focusName = focusedTravelerId ? demoTravelers.find((traveler) => traveler.id === focusedTravelerId)?.name ?? "Selected traveler" : "Everyone";
  const urgentDocuments = useMemo(
    () => activeEvent.documentIds.slice(0, 3).flatMap((id) => {
      const document = documentById.get(id);
      return document ? [document] : [];
    }),
    [activeEvent]
  );

  useEffect(() => {
    database.settings.get("demo-phase").then((setting) => {
      if (setting && phases.includes(setting.value as DemoPhase)) setPhase(setting.value as DemoPhase);
    }).catch(() => undefined);
  }, []);

  const choosePhase = (next: DemoPhase) => {
    setPhase(next);
    database.settings.put({ key: "demo-phase", value: next, updatedAt: new Date().toISOString() }).catch(() => undefined);
  };

  const resetDemo = () => {
    choosePhase("travelday");
    setFocusedTravelerId(null);
    setTaskStatuses(Object.fromEntries(demoTasks.map((task) => [task.id, task.status])));
  };

  return (
    <AppShell demo>
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="eyebrow">Mediterranean Summer · safe preview</p>
            <h1 className="mt-2 font-display text-4xl font-black tracking-[-0.045em] sm:text-5xl">Good morning, Sam.</h1>
            <p className="mt-2 text-muted">Everything important for this moment is already here.</p>
          </div>
          <button type="button" onClick={resetDemo} className="tap-target inline-flex items-center justify-center gap-2 self-start rounded-full border border-line bg-surface px-4 text-sm font-bold sm:self-auto">
            <RotateCcw className="size-4" /> Reset demo
          </button>
        </div>

        <section className="mt-7 overflow-x-auto pb-2" aria-label="Demo time">
          <div className="flex min-w-max gap-2 rounded-2xl border border-line bg-surface p-1.5">
            {phases.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => choosePhase(item)}
                className={`tap-target rounded-xl px-4 py-2 text-xs font-extrabold capitalize transition-colors ${phase === item ? "bg-brand text-surface" : "text-muted hover:bg-elevated hover:text-ink"}`}
                aria-pressed={phase === item}
              >
                {item === "predeparture" ? "D-1" : item === "travelday" ? "Travel day" : item}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-3" aria-label="View demo as traveler">
          <p className="mb-2 text-xs font-bold text-muted">Showing tasks and trip details for <strong className="text-ink">{focusName}</strong></p>
          <div className="flex gap-2 overflow-x-auto pb-2">
            <button type="button" onClick={() => setFocusedTravelerId(null)} className={`tap-target shrink-0 rounded-full border px-4 text-xs font-extrabold ${focusedTravelerId === null ? "border-brand bg-brand text-surface" : "border-line bg-surface text-muted"}`}>Everyone</button>
            {demoTravelers.filter((traveler) => traveler.role !== "Non-travelling collaborator").map((traveler) => <button key={traveler.id} type="button" onClick={() => setFocusedTravelerId(traveler.id)} className={`tap-target shrink-0 rounded-full border px-4 text-xs font-extrabold ${focusedTravelerId === traveler.id ? "border-brand bg-brand text-surface" : "border-line bg-surface text-muted"}`}>{traveler.name}</button>)}
          </div>
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(18rem,.8fr)]">
          <div className="relative overflow-hidden rounded-[2rem] bg-brand p-6 text-surface shadow-focus sm:p-8">
            <div className="absolute right-[-3rem] top-[-3rem] size-44 rounded-full border-[2rem] border-coral/20" aria-hidden="true" />
            <div className="relative">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="rounded-full bg-surface/10 px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.13em]">{copy.label}</span>
                <span className="inline-flex items-center gap-2 text-xs font-bold text-surface/75"><ShieldCheck className="size-4 text-success" /> {copy.sublabel}</span>
              </div>
              <h2 className="mt-8 max-w-xl font-display text-3xl font-black tracking-[-0.04em] sm:text-4xl">{phase === "completed" ? "Your memories are archived." : activeEvent.title}</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-surface/70">{phase === "completed" ? "Documents remain in your Vault until you choose to remove them." : activeEvent.note}</p>
              {phase !== "completed" && (
                <button type="button" onClick={() => setSelectedEvent(activeEvent)} className="tap-target mt-7 inline-flex items-center gap-2 rounded-2xl bg-surface px-5 py-3 text-sm font-extrabold text-brand hover:scale-[1.015] motion-reduce:hover:scale-100">
                  Open what I need <ArrowRight className="size-4" />
                </button>
              )}
            </div>
          </div>

          <aside className="surface-card p-5 sm:p-6">
            <div className="flex items-start justify-between">
              <div><p className="eyebrow">Trip readiness</p><p className="mt-2 font-display text-2xl font-black">{completedTasks} of {visibleTasks.length} done</p><p className="mt-1 text-xs text-muted">For {focusName}</p></div>
              <span className="grid size-11 place-items-center rounded-2xl bg-brand-soft text-success"><Check className="size-5" /></span>
            </div>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-success transition-[width]" style={{ width: `${readinessPercent}%` }} /></div>
            <div className="mt-5 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-2xl bg-elevated p-3"><span className="font-black">6</span><span className="ml-1 text-muted">people</span></div>
              <div className="rounded-2xl bg-elevated p-3"><span className="font-black">6</span><span className="ml-1 text-muted">documents</span></div>
            </div>
            <div className="mt-4 flex -space-x-2" aria-label="Travelers and collaborator">
              {demoTravelers.map((traveler) => <span key={traveler.id} title={`${traveler.name} - ${traveler.role}`} className="grid size-9 place-items-center rounded-full border-2 border-surface text-[0.62rem] font-black text-white" style={{ background: traveler.color }}>{traveler.initials}</span>)}
            </div>
          </aside>
        </section>

        {phase === "travelday" && (
          <section className="mt-5 flex items-start gap-3 rounded-[1.4rem] border border-warning/30 bg-warning/10 p-4 text-sm">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" />
            <div className="flex-1"><p className="font-extrabold">Gate confirmed: 22B</p><p className="mt-1 text-muted">Manually updated by Mia 9 minutes ago. Boarding starts at 05:55.</p></div>
            <BellRing className="size-5 text-warning" />
          </section>
        )}

        <section className="mt-9">
          <div className="flex items-end justify-between gap-4">
            <div><p className="eyebrow">Need now</p><h2 className="mt-1 font-display text-2xl font-black tracking-[-0.03em]">One tap away</h2></div>
            <span className="inline-flex items-center gap-1 text-xs font-bold text-success"><WifiOff className="size-4" /> Works offline</span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {urgentDocuments.length ? urgentDocuments.map((document) => <DocumentChip key={document.id} document={document} />) : demoDocuments.slice(0, 3).map((document) => <DocumentChip key={document.id} document={document} />)}
          </div>
        </section>

        <section className="mt-11" id="full-itinerary">
          <div className="flex items-end justify-between">
            <div><p className="eyebrow">Itinerary</p><h2 className="mt-1 font-display text-2xl font-black tracking-[-0.03em]">Your journey</h2></div>
            <a href="#full-itinerary" className="tap-target inline-flex items-center gap-1 rounded-full px-3 text-sm font-bold text-brand">Full itinerary <ChevronRight className="size-4" /></a>
          </div>

          <div className="relative mt-5 space-y-4 before:absolute before:bottom-8 before:left-[2.95rem] before:top-8 before:w-px before:bg-line sm:before:left-[4.25rem]">
            {visibleEvents.map((event) => {
              const active = event.id === copy.activeEventId;
              const tasks = visibleTasks.filter((task) => task.anchorEventId === event.id);
              const documents = event.documentIds.flatMap((id) => {
                const document = documentById.get(id);
                return document ? [document] : [];
              });
              return (
                <div key={event.id} className="contents">
                {tasks.map((task) => {
                  const done = taskStatuses[task.id] === "complete";
                  const taskAudience = demoTravelers.filter((traveler) => task.travelerIds.includes(traveler.id)).map((traveler) => traveler.name).join(", ");
                  return <div key={task.id} className="relative grid grid-cols-[4.25rem_minmax(0,1fr)] gap-3 sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:gap-5">
                    <div className="relative z-10 flex justify-center pt-5"><span className={`block size-3 rounded-full border-[3px] border-canvas ${done ? "bg-line" : "bg-brand"}`} /></div>
                    <div className="flex min-h-16 items-center gap-3 rounded-2xl border border-line bg-elevated px-3 py-2 sm:px-4">
                      <input type="checkbox" className="size-5 shrink-0 accent-brand" checked={done} aria-label={`${done ? "Mark as not done" : "Mark as done"}: ${task.title}`} onChange={(event) => setTaskStatuses((statuses) => ({ ...statuses, [task.id]: event.target.checked ? "complete" : "to_check" }))} />
                      <span className="min-w-0 flex-1"><strong className={`block text-sm ${done ? "text-muted line-through" : "text-ink"}`}>{task.title}</strong><span className="mt-0.5 block text-xs text-muted">{task.scheduleLabel}{taskAudience ? ` · ${taskAudience}` : ""}{done ? " · Done" : " · Readiness task"}</span></span>
                    </div>
                  </div>;
                })}
                <div className="relative grid grid-cols-[4.25rem_minmax(0,1fr)] gap-3 sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:gap-5">
                  <div className="relative z-10 pt-5 text-center">
                    <p className={`text-sm font-black ${active ? "text-coral" : "text-ink"}`}>{event.timeLabel}</p>
                    <p className="mt-1 text-[0.65rem] font-bold text-muted">{event.dateLabel}</p>
                    <span className={`mx-auto mt-3 block size-3 rounded-full border-[3px] border-canvas ${active ? "bg-coral ring-4 ring-coral/20" : "bg-line"}`} />
                  </div>
                  <FocusSurface active={active} className="p-5 sm:p-6">
                    <button type="button" onClick={() => setSelectedEvent(event)} className="block w-full text-left">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            {active && <span className="rounded-full bg-coral/15 px-2.5 py-1 text-[0.62rem] font-black uppercase tracking-[0.14em] text-coral">Now</span>}
                            <span className="eyebrow">{event.eyebrow}</span>
                          </div>
                          <h3 className="mt-2 font-display text-xl font-black tracking-[-0.025em]">{event.title}</h3>
                          <p className="mt-2 flex items-start gap-2 text-sm text-muted"><MapPin className="mt-0.5 size-4 shrink-0" />{event.location}</p>
                        </div>
                        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft text-brand"><ChevronRight className="size-5" /></span>
                      </div>
                    </button>
                    {documents.length > 0 && (
                      <div className="mt-5 border-t border-line pt-4">
                        <div className="flex items-center gap-2 text-xs font-bold text-muted"><FileText className="size-4" /> {documents.length} document{documents.length === 1 ? "" : "s"} attached</div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {documents.slice(0, 3).map((document) => <a key={document.id} href={document.url} target="_blank" rel="noreferrer" className="tap-target inline-flex min-h-9 items-center rounded-full border border-line bg-elevated px-3 text-xs font-bold hover:border-brand/40">{document.purpose}</a>)}
                        </div>
                      </div>
                    )}
                  </FocusSurface>
                </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-11 grid gap-4 sm:grid-cols-3">
          <div className="surface-card p-5"><CalendarDays className="size-5 text-coral" /><p className="mt-4 font-extrabold">10 days</p><p className="mt-1 text-sm text-muted">Four destinations</p></div>
          <div className="surface-card p-5"><UsersRound className="size-5 text-coral" /><p className="mt-4 font-extrabold">Travel together</p><p className="mt-1 text-sm text-muted">Five travelers, one helper</p></div>
          <div className="surface-card p-5"><Luggage className="size-5 text-coral" /><p className="mt-4 font-extrabold">Ready offline</p><p className="mt-1 text-sm text-muted">All six documents verified</p></div>
        </section>
      </div>

      {selectedEvent && <EventDetails event={selectedEvent} onClose={() => setSelectedEvent(null)} />}
    </AppShell>
  );
}
