import { UsersRound } from "lucide-react";
import type { Traveler } from "./types";

export function TravelerSwitcher({ travelers, value, onChange }: { travelers: Traveler[]; value: string | null; onChange: (travelerId: string | null) => void }) {
  if (!travelers.length) return null;
  const selected = travelers.find((traveler) => traveler.id === value);

  return (
    <section className="surface-card mt-5 p-4 sm:p-5" aria-label="Traveler planning context">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Planning for</p>
          <p className="mt-1 text-sm text-muted">{selected ? `New items will start with ${selected.display_name} selected.` : "New items will start with everyone selected."}</p>
        </div>
        <UsersRound className="size-5 text-brand" />
      </div>
      <div className="-mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Choose traveler">
        <button type="button" aria-pressed={!value} onClick={() => onChange(null)} className={`tap-target shrink-0 rounded-2xl px-4 py-2.5 text-sm font-extrabold transition ${!value ? "bg-brand text-surface shadow-soft" : "bg-elevated text-muted hover:text-ink"}`}>Everyone</button>
        {travelers.map((traveler) => <button type="button" key={traveler.id} aria-pressed={traveler.id === value} onClick={() => onChange(traveler.id)} className={`tap-target flex shrink-0 items-center gap-2 rounded-2xl px-3 py-2 text-sm font-extrabold transition ${traveler.id === value ? "bg-brand text-surface shadow-soft" : "bg-elevated text-muted hover:text-ink"}`}><span className={`grid size-7 place-items-center rounded-full text-[.65rem] font-black ${traveler.id === value ? "bg-surface/15" : "bg-brand-soft text-brand"}`}>{traveler.display_name.slice(0, 2).toUpperCase()}</span>{traveler.display_name}</button>)}
      </div>
      <p className="mt-3 text-xs leading-5 text-muted">This changes the traveler preselected in forms. You remain signed in as yourself.</p>
    </section>
  );
}
