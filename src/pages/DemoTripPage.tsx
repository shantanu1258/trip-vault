import {
  ArrowLeft,
  BedDouble,
  CalendarClock,
  CalendarPlus,
  Check,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Info,
  LocateFixed,
  MapPin,
  Plane,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  TrainFront,
  UsersRound,
  WalletCards,
  WifiOff,
  X
} from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { FocusSurface } from "../components/FocusSurface";
import { ModalSheet } from "../components/ModalSheet";
import { demoDocuments, demoEvents, demoPhaseCopy, demoTasks, demoTravelers, documentById } from "../demo/data";
import type { DemoEvent, DemoPhase, DemoTask } from "../demo/types";
import { database } from "../lib/local-db/database";

const phases: DemoPhase[] = ["planning", "predeparture", "travelday", "intrip", "completed"];
const phaseLabels = { past: "Past", current: "Happening now", future: "Upcoming" } as const;
const iconFor: Record<DemoEvent["type"], typeof Plane> = { flight: Plane, hotel: BedDouble, activity: MapPin, train: TrainFront };
const sampleCosts = [
  { id: "flight", title: "Aster Air flights", payer: "Sam Shah", amount: "€2,340.00" },
  { id: "hotel", title: "Casa Bellora", payer: "Mia Kapoor", amount: "€1,860.00" },
  { id: "activity", title: "Colosseum evening tour", payer: "Sam Shah", amount: "€660.00" }
];

type DemoView = "timeline" | "details";
type DemoSheet = "people" | "readiness" | "expenses" | null;
type EventPhase = keyof typeof phaseLabels;

function demoEventPhase(event: DemoEvent, phase: DemoPhase, activeEvent: DemoEvent | undefined): EventPhase {
  if (phase === "completed") return "past";
  if (phase === "planning" || phase === "predeparture" || !activeEvent) return "future";
  const eventIndex = demoEvents.findIndex((item) => item.id === event.id);
  const activeIndex = demoEvents.findIndex((item) => item.id === activeEvent.id);
  return eventIndex < activeIndex ? "past" : eventIndex === activeIndex ? "current" : "future";
}

function DemoDocumentLink({ documentId }: { documentId: string }) {
  const document = documentById.get(documentId);
  if (!document) return null;
  return <a href={document.url} target="_blank" rel="noreferrer" className="group flex min-w-0 items-center gap-3 rounded-xl bg-elevated p-3 text-left hover:bg-brand-soft">
    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand"><FileText className="size-5" /></span>
    <span className="min-w-0 flex-1"><strong className="block whitespace-normal break-words text-sm [overflow-wrap:anywhere]">{document.title}</strong><span className="mt-0.5 block text-xs text-muted">{document.purpose} · {document.sizeLabel} · Offline</span></span>
    <ExternalLink className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
  </a>;
}

function EventDetails({ event, onClose }: { event: DemoEvent; onClose: () => void }) {
  const Icon = iconFor[event.type];
  const documents = event.documentIds.flatMap((id) => {
    const document = documentById.get(id);
    return document ? [document] : [];
  });
  return <ModalSheet eyebrow={event.type === "hotel" ? "Hotel" : event.type} title={event.title} onClose={onClose}>
    <div className="mt-5 flex items-start gap-4 rounded-2xl bg-elevated p-4">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand"><Icon className="size-5" /></span>
      <div className="min-w-0"><p className="text-sm font-black">{event.dayLabel}, {event.dateLabel} · {event.timeLabel}</p><p className="mt-1 text-xs text-muted">Local schedule</p>{event.endTimeLabel && <p className="mt-2 text-xs text-muted">Ends {event.endTimeLabel}</p>}<span className="mt-2 inline-flex rounded-full bg-surface px-2 py-1 text-[.65rem] font-black uppercase text-muted">Planned</span></div>
    </div>
    <p className="mt-4 flex items-start gap-2 text-sm text-muted"><MapPin className="mt-0.5 size-4 shrink-0" />{event.location}</p>
    <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-sm font-extrabold text-brand"><LocateFixed className="size-4" /> Navigate</a>
    <p className="mt-4 whitespace-pre-wrap rounded-xl bg-elevated p-3 text-sm leading-6 text-muted">{event.note}</p>
    <div className="mt-4 rounded-2xl border border-line bg-surface/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[.65rem] font-black uppercase tracking-[.12em] text-muted">{event.type} booking</p><p className="mt-1 font-bold">{event.eyebrow}</p>{event.type === "flight" && <><p className="mt-1 font-black text-brand">DEL → FCO</p><p className="mt-1 text-xs text-muted"><strong className="text-ink">PNR:</strong> SAMPLE7</p></>}</div><span className="rounded-full bg-brand-soft px-3 py-2 text-xs font-bold text-brand">Sample booking</span></div>
    </div>
    <div className="mt-4 rounded-2xl border border-warning/20 bg-warning/5 p-4"><p className="text-sm font-extrabold">Want to change this sample?</p><p className="mt-1 text-xs leading-5 text-muted">Sign in to create a real trip, add bookings, costs, and documents.</p><Link className="secondary-button mt-3" to="/sign-in"><Plus className="size-4" /> Sign in to add</Link></div>
    <div className="mt-6"><p className="eyebrow">Documents</p><div className="mt-3 space-y-2">{documents.length ? documents.map((document) => <DemoDocumentLink key={document.id} documentId={document.id} />) : <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">No documents attached to this event.</p>}</div></div>
    <div className="mt-6 border-t border-line pt-5"><p className="eyebrow">Travelers</p><div className="mt-3 flex flex-wrap gap-2">{demoTravelers.filter((traveler) => event.travelerIds.includes(traveler.id)).map((traveler) => <span key={traveler.id} className="rounded-full bg-brand-soft px-3 py-1.5 text-xs font-bold text-brand">{traveler.name}</span>)}</div></div>
  </ModalSheet>;
}

function PeopleSheet({ selectedId, onSelect, onClose }: { selectedId: string | null; onSelect: (id: string | null) => void; onClose: () => void }) {
  const choose = (id: string | null) => { onSelect(id); onClose(); };
  return <ModalSheet eyebrow="Mediterranean Summer" title="People & sharing" onClose={onClose}>
    <p className="mt-3 text-sm leading-6 text-muted">Choose whose sample plan and documents you are viewing. The sheet closes immediately after the switch, just like a real trip.</p>
    <div className="mt-5 grid grid-cols-2 gap-3">
      <button type="button" onClick={() => choose(null)} className={`rounded-2xl border p-4 text-left ${selectedId === null ? "border-brand bg-brand-soft" : "border-line"}`}><UsersRound className="size-5 text-brand" /><strong className="mt-3 block">Everyone</strong></button>
      {demoTravelers.filter((traveler) => traveler.role !== "Non-travelling collaborator").map((traveler) => <button key={traveler.id} type="button" onClick={() => choose(traveler.id)} aria-label={`Show ${traveler.name}'s trip information`} className={`min-w-0 rounded-2xl border p-4 text-left ${selectedId === traveler.id ? "border-brand bg-brand-soft" : "border-line"}`}><span className="grid size-7 place-items-center rounded-full text-[.65rem] font-black text-white" style={{ background: traveler.color }}>{traveler.initials}</span><strong className="mt-3 block truncate">{traveler.name}</strong><span className="text-xs text-muted">{traveler.role}</span></button>)}
    </div>
    <Link to="/sign-in" className="primary-button mt-5 w-full"><UsersRound className="size-4" /> Sign in to share a real trip</Link>
  </ModalSheet>;
}

function ReadinessSheet({ tasks, statuses, onStatus, onClose }: { tasks: DemoTask[]; statuses: Record<string, "to_check" | "complete">; onStatus: (id: string, complete: boolean) => void; onClose: () => void }) {
  const done = tasks.filter((task) => statuses[task.id] === "complete").length;
  return <ModalSheet eyebrow="Mediterranean Summer" title="Tasks & readiness" onClose={onClose}>
    <p className="mt-3 text-sm text-muted">{done} of {tasks.length} tasks done</p>
    <div className="mt-5 space-y-2">{tasks.map((task) => { const complete = statuses[task.id] === "complete"; return <label key={task.id} className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-elevated p-4"><input type="checkbox" checked={complete} onChange={(event) => onStatus(task.id, event.target.checked)} className="mt-0.5 size-5 accent-brand" /><span><strong className={`block text-sm ${complete ? "text-muted line-through" : ""}`}>{task.title}</strong><span className="mt-1 block text-xs text-muted">{task.scheduleLabel}</span></span></label>; })}</div>
    <Link to="/sign-in" className="secondary-button mt-5 w-full"><Plus className="size-4" /> Sign in to add a task</Link>
  </ModalSheet>;
}

function ExpensesSheet({ onClose }: { onClose: () => void }) {
  const [showBalances, setShowBalances] = useState(false);
  return <ModalSheet eyebrow="Mediterranean Summer" title="Trip expenses" onClose={onClose}>
    <div className="mt-5 rounded-2xl bg-elevated p-4"><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.12em] text-muted"><WalletCards className="size-4" /> Total trip cost</p><strong className="mt-2 block font-display text-2xl">€4,860.00</strong></div>
    <label className="mt-4 flex items-center gap-3 rounded-xl border border-line p-3 text-sm font-bold"><input type="checkbox" checked={showBalances} onChange={(event) => setShowBalances(event.target.checked)} className="size-5 accent-brand" /> Show balances</label>
    {showBalances && <div className="mt-4 rounded-2xl border border-line p-4"><p className="eyebrow">Balances by currency</p><div className="mt-3 grid gap-2 sm:grid-cols-2"><p className="rounded-xl bg-elevated p-3 text-sm">Sam <strong className="float-right text-success">gets €240</strong></p><p className="rounded-xl bg-elevated p-3 text-sm">Mia <strong className="float-right text-warning">owes €240</strong></p></div></div>}
    <div className="mt-5 space-y-2">{sampleCosts.map((cost) => <div key={cost.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-elevated p-3 text-sm"><strong className="min-w-0 flex-1">{cost.title}</strong><span className="text-muted">Paid by {cost.payer}</span><strong>{cost.amount}</strong></div>)}</div>
    <Link to="/sign-in" className="secondary-button mt-5 w-full"><Plus className="size-4" /> Sign in to add an expense</Link>
  </ModalSheet>;
}

function DemoSection({ id, eyebrow, title, action, onActivate, children }: { id: string; eyebrow: string; title: string; action?: ReactNode; onActivate?: () => void; children: ReactNode }) {
  return <section id={id} className={`surface-card group relative scroll-mt-28 p-5 sm:p-6 ${onActivate ? "transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-soft" : ""}`}>
    {onActivate && <button type="button" className="absolute inset-0 z-10 rounded-[inherit] focus-visible:ring-2 focus-visible:ring-brand" onClick={onActivate} aria-label={`Open ${title}`} />}
    <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="eyebrow">{eyebrow}</p><h2 className="mt-1 font-display text-2xl font-black">{title}</h2></div>{action && <div className="relative z-20">{action}</div>}</div>
    <div className="mt-5">{children}</div>
  </section>;
}

export function DemoTripPage() {
  const [phase, setPhase] = useState<DemoPhase>("travelday");
  const [view, setView] = useState<DemoView>("timeline");
  const [selectedEvent, setSelectedEvent] = useState<DemoEvent | null>(null);
  const [sheet, setSheet] = useState<DemoSheet>(null);
  const [focusedTravelerId, setFocusedTravelerId] = useState<string | null>(null);
  const [taskStatuses, setTaskStatuses] = useState<Record<string, "to_check" | "complete">>(() => Object.fromEntries(demoTasks.map((task) => [task.id, task.status])));
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const copy = demoPhaseCopy[phase];
  const visibleEvents = useMemo(() => focusedTravelerId ? demoEvents.filter((event) => event.travelerIds.includes(focusedTravelerId)) : demoEvents, [focusedTravelerId]);
  const visibleTasks = useMemo(() => focusedTravelerId ? demoTasks.filter((task) => task.travelerIds.length === 0 || task.travelerIds.includes(focusedTravelerId)) : demoTasks, [focusedTravelerId]);
  const activeEvent = visibleEvents.find((event) => event.id === copy.activeEventId) ?? visibleEvents[0];
  const focusedTraveler = focusedTravelerId ? demoTravelers.find((traveler) => traveler.id === focusedTravelerId) : undefined;
  const completedTasks = visibleTasks.filter((task) => taskStatuses[task.id] === "complete").length;
  const readinessPercent = visibleTasks.length ? Math.round(completedTasks / visibleTasks.length * 100) : 100;

  const searchResults = useMemo(() => {
    if (query.trim().length < 2) return [];
    const needle = query.toLowerCase();
    return [
      ...visibleEvents.filter((event) => `${event.title} ${event.eyebrow} ${event.location}`.toLowerCase().includes(needle)).map((event) => ({ id: event.id, title: event.title, detail: `${event.type} · ${event.location}`, type: "event" as const })),
      ...demoDocuments.filter((document) => `${document.title} ${document.purpose}`.toLowerCase().includes(needle)).map((document) => ({ id: document.id, title: document.title, detail: `Document · ${document.purpose}`, type: "document" as const })),
      ...visibleTasks.filter((task) => task.title.toLowerCase().includes(needle)).map((task) => ({ id: task.id, title: task.title, detail: `Readiness · ${task.scheduleLabel}`, type: "task" as const })),
      ...demoTravelers.filter((traveler) => traveler.name.toLowerCase().includes(needle)).map((traveler) => ({ id: traveler.id, title: traveler.name, detail: `Traveler · ${traveler.role}`, type: "traveler" as const }))
    ];
  }, [query, visibleEvents, visibleTasks]);

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
    setView("timeline");
    setFocusedTravelerId(null);
    setQuery("");
    setTaskStatuses(Object.fromEntries(demoTasks.map((task) => [task.id, task.status])));
  };
  const scrollToEvent = (id: string) => document.getElementById(`demo-timeline-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  const handleSearchResult = (result: (typeof searchResults)[number]) => {
    if (result.type === "event") { setSelectedEvent(demoEvents.find((event) => event.id === result.id) ?? null); setQuery(""); }
    if (result.type === "task") { setQuery(""); scrollToEvent(`task-${result.id}`); }
    if (result.type === "traveler") { setFocusedTravelerId(result.id); setQuery(""); }
  };

  return <AppShell demo>
    <div className="mx-auto max-w-6xl pb-24">
      <Link to="/welcome" className="tap-target inline-flex items-center gap-2 text-sm font-bold text-muted hover:text-ink"><ArrowLeft className="size-4" /> Back to welcome</Link>

      <section className="mt-4 rounded-2xl border border-line bg-surface p-3 shadow-soft" aria-label="Demo controls">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="eyebrow">Safe demo controls</p><p className="mt-1 text-xs text-muted">Change the sample clock to preview the same trip in different states.</p></div><button type="button" onClick={resetDemo} className="secondary-button min-h-9 px-3 py-2 text-xs"><RotateCcw className="size-3.5" /> Reset demo</button></div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">{phases.map((item) => <button key={item} type="button" onClick={() => choosePhase(item)} aria-pressed={phase === item} className={`shrink-0 rounded-xl px-3 py-2 text-xs font-black capitalize ${phase === item ? "bg-brand text-surface" : "bg-elevated text-muted"}`}>{item === "predeparture" ? "D-1" : item === "travelday" ? "Travel day" : item}</button>)}</div>
      </section>

      <header className="page-enter mt-4 rounded-[2rem] bg-brand p-5 text-surface shadow-focus sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-surface/60">Jun 18, 2026 – Jun 27, 2026</p><h1 className="mt-2 font-display text-3xl font-black tracking-[-.05em] sm:text-4xl">Mediterranean Summer</h1><p className="mt-2 flex items-center gap-2 text-sm text-surface/70"><MapPin className="size-4" />Rome, Florence, Venice & Milan</p></div><span className="rounded-full bg-surface/10 px-3 py-2 text-xs font-bold">Safe demo</span></div>
        <div className="mt-5 grid grid-cols-2 rounded-2xl bg-surface/10 p-1"><button type="button" aria-pressed={view === "timeline"} onClick={() => setView("timeline")} className={`tap-target rounded-xl text-sm font-black ${view === "timeline" ? "bg-surface text-brand shadow-soft" : "text-surface/70"}`}>Timeline</button><button type="button" aria-pressed={view === "details"} onClick={() => setView("details")} className={`tap-target rounded-xl text-sm font-black ${view === "details" ? "bg-surface text-brand shadow-soft" : "text-surface/70"}`}>Trip details</button></div>
        <button type="button" onClick={() => setSheet("expenses")} className="mt-4 inline-flex max-w-full items-center gap-2 rounded-xl bg-surface/10 px-3 py-2 text-left transition hover:bg-surface/15" aria-label="Open trip expenses"><WalletCards className="size-4 shrink-0" /><span className="font-bold text-surface/70">Total trip cost</span><strong className="truncate font-display text-base text-surface">€4,860.00</strong><ChevronRight className="size-4 shrink-0 text-surface/60" /></button>
      </header>

      <div id="trip-search" role="search" aria-label="Search within this trip" className="relative mt-4 scroll-mt-28"><Search className="pointer-events-none absolute left-4 top-3.5 size-5 text-muted" /><input ref={searchInputRef} value={query} onChange={(event) => setQuery(event.target.value)} className="form-input mt-0 pl-12 pr-11" placeholder="Search timeline, booking, document, traveler…" aria-label="Search this trip" />{query && <button type="button" onClick={() => setQuery("")} className="absolute right-2 top-1.5 grid size-9 place-items-center text-muted" aria-label="Clear search"><X className="size-4" /></button>}{query.length >= 2 && <div className="relative z-40 mt-2 max-h-[42dvh] w-full overflow-auto rounded-2xl border border-line bg-surface p-2 shadow-focus sm:absolute sm:max-h-96">{searchResults.map((result) => result.type === "document" ? <a key={`${result.type}:${result.id}`} href={documentById.get(result.id)?.url} target="_blank" rel="noreferrer" onClick={() => setQuery("")} className="block rounded-xl px-3 py-3 hover:bg-elevated"><strong className="block text-sm">{result.title}</strong><span className="text-xs text-muted">{result.detail}</span></a> : <button key={`${result.type}:${result.id}`} type="button" onClick={() => handleSearchResult(result)} className="block w-full rounded-xl px-3 py-3 text-left hover:bg-elevated"><strong className="block text-sm">{result.title}</strong><span className="text-xs text-muted">{result.detail}</span></button>)}{searchResults.length === 0 && <p className="p-4 text-sm text-muted">Nothing in this trip matches.</p>}</div>}</div>

      {view === "timeline" ? <main className="mt-5">
        <button type="button" onClick={() => setSheet("readiness")} className="surface-card group relative block w-full overflow-hidden p-5 text-left transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-soft sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="eyebrow">Before you go</p><h2 className="mt-1 font-display text-xl font-black">Readiness checklist</h2></div><ShieldCheck className={`size-6 ${completedTasks < visibleTasks.length ? "text-warning" : "text-success"}`} /></div>
          <p className="mt-3 text-sm text-muted">{completedTasks} of {visibleTasks.length} tasks done{focusedTraveler ? ` for ${focusedTraveler.name}` : ""}</p><div className="mt-3 h-2 overflow-hidden rounded-full bg-elevated"><span className="block h-full rounded-full bg-success transition-all" style={{ width: `${readinessPercent}%` }} /></div><span className="mt-4 inline-flex items-center gap-1 text-sm font-extrabold text-brand">Open checklist <ChevronRight className="size-4" /></span>
        </button>

        <section className="surface-card mt-5 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="eyebrow">Everything in order</p><h2 className="mt-1 font-display text-2xl font-black">{focusedTraveler ? `${focusedTraveler.name}'s timeline` : "Complete timeline"}</h2><p className="mt-2 text-sm text-muted">{focusedTraveler ? "Shared events and this traveler's events are shown in time order." : "Past events are above you. Upcoming events continue below."}</p></div><a className="secondary-button" href="data:text/calendar;charset=utf-8,BEGIN%3AVCALENDAR%0AEND%3AVCALENDAR" download="mediterranean-summer.ics"><Download className="size-4" /> Calendar</a></div>
          <div className="mt-4 rounded-xl bg-brand-soft p-3 text-xs font-bold text-brand"><strong>{copy.label}:</strong> {copy.sublabel}</div>
          <nav aria-label="Timeline sections" className="sticky top-2 z-30 mt-4 flex gap-2 overflow-auto rounded-2xl border border-line bg-surface/95 p-2 shadow-soft backdrop-blur">{(["past", "current", "future"] as EventPhase[]).map((item) => <button key={item} type="button" onClick={() => { const target = visibleEvents.find((event) => demoEventPhase(event, phase, activeEvent) === item); if (target) scrollToEvent(target.id); }} className={`shrink-0 rounded-xl px-3 py-2 text-xs font-black ${item === "current" ? "bg-coral text-white" : "bg-elevated text-brand"}`}>{phaseLabels[item]}</button>)}</nav>
          <div className="relative mt-6 before:absolute before:bottom-5 before:left-1 before:top-5 before:w-px before:bg-line sm:before:left-[8.25rem]">
            {visibleEvents.map((event, index) => {
              const eventPhase = demoEventPhase(event, phase, activeEvent);
              const previous = index ? demoEventPhase(visibleEvents[index - 1], phase, activeEvent) : null;
              const current = phase !== "completed" && event.id === activeEvent?.id;
              const Icon = iconFor[event.type];
              const tasks = visibleTasks.filter((task) => task.anchorEventId === event.id);
              return <Fragment key={event.id}>
                {eventPhase !== previous && <div className={`${index ? "pt-7" : ""} relative z-10 pb-3 pl-6 sm:pl-[10.5rem]`}><span className={`inline-flex rounded-full px-3 py-1.5 text-[.65rem] font-black uppercase tracking-[.14em] ${current ? "bg-coral text-white" : "border border-line bg-surface text-muted"}`}>{current ? phase === "travelday" || phase === "predeparture" ? "Next event" : "Happening now" : phaseLabels[eventPhase]}</span></div>}
                {tasks.map((task) => { const done = taskStatuses[task.id] === "complete"; const audience = demoTravelers.filter((traveler) => task.travelerIds.includes(traveler.id)).map((traveler) => traveler.name).join(", "); return <div id={`demo-timeline-task-${task.id}`} key={task.id} className="relative mb-3 grid scroll-mt-28 grid-cols-1 pl-5 sm:grid-cols-[6rem_2.5rem_minmax(0,1fr)] sm:gap-4 sm:pl-0"><span className={`absolute left-[-.05rem] top-5 z-10 size-2.5 rounded-full ring-4 ring-surface sm:hidden ${done ? "bg-line" : "bg-brand"}`} /><span className="hidden sm:block" /><span className={`z-10 mt-2 hidden size-10 place-items-center rounded-full border-4 border-surface sm:grid ${done ? "bg-line text-muted" : "bg-brand-soft text-brand"}`}><Check className="size-4" /></span><label className="flex min-h-16 cursor-pointer items-center gap-3 rounded-2xl border border-line bg-elevated px-3 py-2 sm:px-4"><input type="checkbox" className="size-5 shrink-0 accent-brand" checked={done} aria-label={`${done ? "Mark as not done" : "Mark as done"}: ${task.title}`} onChange={(change) => setTaskStatuses((statuses) => ({ ...statuses, [task.id]: change.target.checked ? "complete" : "to_check" }))} /><span className="min-w-0 flex-1"><strong className={`block text-sm ${done ? "text-muted line-through" : ""}`}>{task.title}</strong><span className="mt-0.5 block text-xs text-muted">{task.scheduleLabel}{audience ? ` · ${audience}` : ""}{done ? " · Done" : " · Readiness task"}</span></span></label></div>; })}
                <h3 className={`${index ? "pt-3" : ""} pb-3 pl-6 text-sm font-black sm:pl-[10.5rem]`}>{event.dayLabel} · {event.dateLabel}</h3>
                <div id={`demo-timeline-${event.id}`} className="relative mb-4 grid scroll-mt-28 grid-cols-1 pl-5 sm:grid-cols-[6rem_2.5rem_minmax(0,1fr)] sm:gap-4 sm:pl-0">
                  <span className={`absolute left-[-.05rem] top-6 z-10 size-2.5 rounded-full ring-4 ring-surface sm:hidden ${current ? "bg-coral" : eventPhase === "past" ? "bg-line" : "bg-brand"}`} /><time className={`hidden pt-4 text-right text-xs font-black sm:block ${current ? "text-coral" : "text-muted"}`}>{event.timeLabel}</time><span className={`z-10 mt-3 hidden size-10 place-items-center rounded-full border-4 border-surface sm:grid ${current ? "bg-coral text-white shadow-focus" : eventPhase === "past" ? "bg-line text-muted" : "bg-brand-soft text-brand"}`}><Icon className="size-4" /></span>
                  <FocusSurface active={current} className={`group p-4 pr-16 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-soft sm:p-5 ${current ? "bg-coral/10" : "bg-elevated"}`}><button type="button" className="absolute inset-0 z-10 rounded-[1.6rem] focus-visible:ring-2 focus-visible:ring-brand" onClick={() => setSelectedEvent(event)} aria-label={`Open details for ${event.title}`} /><span className={`absolute right-4 top-4 grid size-10 place-items-center rounded-xl sm:hidden ${current ? "bg-coral text-white" : eventPhase === "past" ? "bg-line/70 text-muted" : "bg-brand-soft text-brand"}`}><Icon className="size-4" /></span><time className={`text-xs font-black sm:hidden ${current ? "text-coral" : "text-muted"}`}>{event.timeLabel}</time><div className="min-w-0"><span className={`mb-2 inline-flex rounded-full px-2 py-1 text-[.6rem] font-black uppercase tracking-[.12em] ${current ? "bg-coral text-white" : "bg-surface text-muted"}`}>{current ? phase === "travelday" || phase === "predeparture" ? "Next event" : "Happening now" : phaseLabels[eventPhase]}</span><h3 className="font-display text-lg font-black">{event.title}</h3><p className="mt-1 text-xs capitalize text-muted">{event.type} · planned</p>{event.endTimeLabel && <p className="mt-1 text-xs text-muted">{event.type === "flight" || event.type === "train" ? "Arrives" : "Ends"} {event.endTimeLabel}</p>}</div><p className="mt-3 flex items-start gap-2 text-sm text-muted"><MapPin className="mt-0.5 size-4 shrink-0" />{event.location}</p>{event.documentIds.length > 0 && <div className="relative z-20 mt-3 flex items-center gap-1.5 text-xs font-extrabold text-brand"><FileText className="size-4" />{event.documentIds.length} document{event.documentIds.length === 1 ? "" : "s"}</div>}<span className="mt-4 flex items-center justify-end gap-1 text-xs font-extrabold text-brand">View details <ChevronRight className="size-4" /></span></FocusSurface>
                </div>
              </Fragment>;
            })}
          </div>
        </section>
      </main> : <main className="mt-5 space-y-5">
        <nav className="flex gap-2 overflow-auto pb-1">{[["overview", "Overview"], ["reservations", "Reservations"], ["costs", "Costs"], ["people", "People"], ["readiness", "Readiness"], ["documents", "Documents"], ["offline", "Offline"], ["notes", "Notes"]].map(([id, label]) => <a className="shrink-0 rounded-full border border-line bg-surface px-3 py-2 text-xs font-bold" key={id} href={`#demo-${id}`}>{label}</a>)}</nav>
        <DemoSection id="demo-overview" eyebrow="Overview" title="Trip information"><dl className="grid gap-4 text-sm sm:grid-cols-2"><div><dt className="text-muted">Destination</dt><dd className="mt-1 font-bold">Rome, Florence, Venice & Milan</dd></div><div><dt className="text-muted">Dates</dt><dd className="mt-1 font-bold">Jun 18, 2026 – Jun 27, 2026</dd></div><div><dt className="text-muted">Default currency</dt><dd className="mt-1 font-bold">EUR</dd></div><div><dt className="text-muted">Fallback time zone</dt><dd className="mt-1 font-bold">Europe/Rome</dd></div></dl></DemoSection>
        <DemoSection id="demo-reservations" eyebrow="Bookings" title={focusedTraveler ? `${focusedTraveler.name}'s reservations` : "Reservations"} action={<Link to="/sign-in" className="secondary-button"><Plus className="size-4" /> Add</Link>}><div className="grid gap-3 sm:grid-cols-2">{visibleEvents.filter((event) => event.documentIds.length || event.type === "train").map((event) => <button key={event.id} type="button" onClick={() => setSelectedEvent(event)} className="group relative rounded-2xl border border-line bg-elevated p-4 text-left transition hover:-translate-y-0.5 hover:border-brand/40"><p className="text-xs font-bold uppercase tracking-[.12em] text-muted">{event.type} booking</p><p className="mt-2 font-display text-lg font-black text-brand">{event.title}</p><p className="mt-1 text-xs text-muted">{event.eyebrow}</p><ChevronRight className="absolute bottom-4 right-4 size-4 text-muted" /></button>)}</div></DemoSection>
        <DemoSection id="demo-costs" eyebrow="Money" title={focusedTraveler ? `${focusedTraveler.name}'s trip costs` : "Trip expenses"} onActivate={() => setSheet("expenses")} action={<Link to="/sign-in" className="secondary-button"><Plus className="size-4" /> Add</Link>}><div className="rounded-2xl bg-elevated p-4"><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.12em] text-muted"><WalletCards className="size-4" /> Total trip cost</p><strong className="mt-2 block font-display text-xl">€4,860.00</strong></div><span className="mt-3 flex items-center justify-end gap-1 text-xs font-extrabold text-brand">View itemized expenses <ChevronRight className="size-4" /></span></DemoSection>
        <DemoSection id="demo-people" eyebrow="People & sharing" title={focusedTraveler?.name ?? "Everyone"} onActivate={() => setSheet("people")} action={<button type="button" className="secondary-button" onClick={() => setSheet("people")}><UsersRound className="size-4" /> Open</button>}><p className="text-sm text-muted">Switch between the complete trip and one person's relevant timeline, reservations, readiness, and documents.</p></DemoSection>
        <DemoSection id="demo-readiness" eyebrow="Tasks" title="Tasks & readiness" onActivate={() => setSheet("readiness")} action={<button type="button" className="secondary-button" onClick={() => setSheet("readiness")}>Open</button>}><p className="text-sm text-muted">{completedTasks} of {visibleTasks.length} tasks done. Scheduled tasks also appear in the timeline.</p></DemoSection>
        <DemoSection id="demo-documents" eyebrow="Vault" title="Documents" action={<Link to="/sign-in" className="secondary-button"><Plus className="size-4" /> Upload</Link>}><p className="text-sm text-muted">{demoDocuments.length} sample documents in this trip</p><div className="mt-3 grid min-w-0 gap-2 sm:grid-cols-2">{demoDocuments.map((document) => <DemoDocumentLink key={document.id} documentId={document.id} />)}</div></DemoSection>
        <DemoSection id="demo-offline" eyebrow="On this device" title="Offline pack"><div className="flex items-start gap-3 rounded-xl bg-success/10 p-4"><WifiOff className="mt-0.5 size-5 text-success" /><div><p className="font-bold">Available offline</p><p className="mt-1 text-sm text-muted">This synthetic trip and its watermarked documents are bundled with the app.</p></div></div></DemoSection>
        <DemoSection id="demo-notes" eyebrow="Useful details" title="Notes"><div className="rounded-xl bg-elevated p-4"><p className="font-bold">Arrival plan</p><p className="mt-2 text-sm text-muted">Mia has the apartment access instructions. Sam will arrange the airport transfer.</p></div></DemoSection>
      </main>}

      <div className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-line bg-surface/95 p-2 shadow-focus backdrop-blur sm:bottom-6"><Link to="/sign-in" className="primary-button min-h-11 whitespace-nowrap px-3 sm:px-4" aria-label="Sign in to add event"><CalendarPlus className="size-4" /><span>Add event</span></Link><button type="button" onClick={() => setSheet("people")} className="secondary-button size-11 justify-center px-0 sm:size-auto sm:px-4" aria-label={`People and sharing · ${focusedTraveler?.name ?? "Everyone"}`}>{focusedTraveler ? <span className="grid size-6 place-items-center rounded-full bg-brand text-[.55rem] font-black text-surface">{focusedTraveler.initials}</span> : <UsersRound className="size-4" />}<span className="hidden max-w-32 truncate sm:inline">{focusedTraveler?.name ?? "Everyone"}</span></button><button type="button" onClick={() => setView((current) => current === "timeline" ? "details" : "timeline")} className="tap-target grid size-11 place-items-center rounded-xl border border-line text-brand" aria-label={view === "details" ? "Open timeline" : "Open trip details"}>{view === "details" ? <CalendarClock className="size-5" /> : <Info className="size-5" />}</button>{view === "timeline" && activeEvent && <button type="button" onClick={() => scrollToEvent(activeEvent.id)} className="tap-target grid size-11 place-items-center rounded-xl border border-line text-brand" aria-label="Jump to now or next"><LocateFixed className="size-5" /></button>}</div>
    </div>

    {selectedEvent && <EventDetails event={selectedEvent} onClose={() => setSelectedEvent(null)} />}
    {sheet === "people" && <PeopleSheet selectedId={focusedTravelerId} onSelect={setFocusedTravelerId} onClose={() => setSheet(null)} />}
    {sheet === "readiness" && <ReadinessSheet tasks={visibleTasks} statuses={taskStatuses} onStatus={(id, complete) => setTaskStatuses((statuses) => ({ ...statuses, [id]: complete ? "complete" : "to_check" }))} onClose={() => setSheet(null)} />}
    {sheet === "expenses" && <ExpensesSheet onClose={() => setSheet(null)} />}
  </AppShell>;
}
