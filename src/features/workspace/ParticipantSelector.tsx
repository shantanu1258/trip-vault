import { UsersRound } from "lucide-react";
import { useState } from "react";
import type { Traveler } from "./types";

export function ParticipantSelector({ travelers, explicitAll = false, selectedTravelerIds }: { travelers: Traveler[]; explicitAll?: boolean; selectedTravelerIds?: string[] }) {
  const [all, setAll] = useState(selectedTravelerIds === undefined || selectedTravelerIds.length === travelers.length);
  if (!travelers.length) return <p className="rounded-2xl bg-brand-soft p-4 text-xs leading-5 text-muted"><UsersRound className="mb-2 size-4 text-brand" />No traveler profiles exist yet. The item will apply to everyone added later.</p>;
  return <fieldset className="rounded-2xl border border-line p-4"><legend className="px-1 text-sm font-extrabold">Who is included?</legend><div className="mt-1 flex gap-4 text-sm"><label className="flex items-center gap-2"><input type="radio" checked={all} onChange={() => setAll(true)} /> Everyone</label><label className="flex items-center gap-2"><input type="radio" checked={!all} onChange={() => setAll(false)} /> Selected travelers</label></div>{all && explicitAll && travelers.map((traveler) => <input key={traveler.id} type="hidden" name="travelerIds" value={traveler.id} />)}{!all && <div className="mt-4 grid gap-2 sm:grid-cols-2">{travelers.map((traveler) => <label key={traveler.id} className="flex items-center gap-2 rounded-xl bg-elevated p-3 text-sm font-bold"><input className="size-4" type="checkbox" name="travelerIds" value={traveler.id} defaultChecked={selectedTravelerIds?.includes(traveler.id)} />{traveler.display_name}</label>)}</div>}</fieldset>;
}
