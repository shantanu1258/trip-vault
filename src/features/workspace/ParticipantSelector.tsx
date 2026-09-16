import { UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import type { ParticipantScope } from "../trips/types";
import type { Traveler } from "./types";

export function ParticipantSelector({
  travelers,
  explicitAll = false,
  selectedTravelerIds,
  scopeName,
  initialScope,
  onSelectionChange
}: {
  travelers: Traveler[];
  explicitAll?: boolean;
  selectedTravelerIds?: string[];
  scopeName?: string;
  initialScope?: ParticipantScope;
  onSelectionChange?: (scope: ParticipantScope, travelerIds: string[]) => void;
}) {
  const [all, setAll] = useState(
    initialScope
      ? initialScope === "everyone"
      : selectedTravelerIds === undefined || selectedTravelerIds.length === travelers.length
  );
  const [selected, setSelected] = useState(() => new Set(selectedTravelerIds ?? []));
  const selectedTravelerKey =
    selectedTravelerIds === undefined
      ? "__everyone__"
      : [...selectedTravelerIds].sort().join("\u0000");
  useEffect(() => {
    setSelected(
      new Set(
        selectedTravelerKey === "__everyone__" || !selectedTravelerKey
          ? []
          : selectedTravelerKey.split("\u0000")
      )
    );
  }, [selectedTravelerKey]);
  const changeScope = (nextAll: boolean) => {
    setAll(nextAll);
    onSelectionChange?.(nextAll ? "everyone" : "selected", nextAll ? [] : [...selected]);
  };
  const changeTraveler = (travelerId: string, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(travelerId);
      else next.delete(travelerId);
      onSelectionChange?.("selected", [...next]);
      return next;
    });
  };
  if (!travelers.length)
    return (
      <>
        <input type="hidden" name={scopeName} value="everyone" />
        <p className="rounded-2xl bg-brand-soft p-4 text-xs leading-5 text-muted">
          <UsersRound className="mb-2 size-4 text-brand" />
          No traveler profiles exist yet. The item will apply to everyone added later.
        </p>
      </>
    );
  return (
    <fieldset className="rounded-2xl border border-line p-4">
      <legend className="px-1 text-sm font-extrabold">Who is included?</legend>
      {scopeName && <input type="hidden" name={scopeName} value={all ? "everyone" : "selected"} />}
      <div className="mt-1 flex gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" checked={all} onChange={() => changeScope(true)} /> Everyone
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" checked={!all} onChange={() => changeScope(false)} /> Selected
          travelers
        </label>
      </div>
      {all &&
        explicitAll &&
        !scopeName &&
        travelers.map((traveler) => (
          <input key={traveler.id} type="hidden" name="travelerIds" value={traveler.id} />
        ))}
      {!all && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {travelers.map((traveler) => (
            <label
              key={traveler.id}
              className="flex items-center gap-2 rounded-xl bg-elevated p-3 text-sm font-bold"
            >
              <input
                className="size-4"
                type="checkbox"
                name="travelerIds"
                value={traveler.id}
                checked={selected.has(traveler.id)}
                onChange={(event) => changeTraveler(traveler.id, event.target.checked)}
              />
              {traveler.display_name}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}
