import { useQuery } from "@tanstack/react-query";
import { useId, type ChangeEvent } from "react";
import { listAvailableAirports } from "./publishedConfig";

function setNamedField(form: HTMLFormElement | null, name: string, value: string) {
  const field = form?.elements.namedItem(name);
  if (!(field instanceof HTMLInputElement)) return;
  field.value = value;
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

export function AirportPicker({ name, codeName, timezoneName, placeholder }: { name: string; codeName: string; timezoneName: string; placeholder: string }) {
  const listId = useId();
  const query = useQuery({ queryKey: ["available-airports"], queryFn: listAvailableAirports, staleTime: Infinity });
  const choose = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.currentTarget.value.trim().toLocaleLowerCase();
    const airport = query.data?.find((item) => item.name.toLocaleLowerCase() === value || item.iataCode?.toLocaleLowerCase() === value || `${item.iataCode} — ${item.name}`.toLocaleLowerCase() === value);
    if (!airport) return;
    event.currentTarget.value = airport.name;
    setNamedField(event.currentTarget.form, codeName, airport.iataCode ?? airport.icaoCode ?? "");
    setNamedField(event.currentTarget.form, timezoneName, airport.timezone);
  };
  return <><input className="form-input" name={name} list={listId} placeholder={placeholder} onChange={choose} /><datalist id={listId}>{query.data?.map((airport) => <option key={`${airport.sourceVersion}:${airport.stableKey}`} value={airport.name}>{airport.iataCode ? `${airport.iataCode} · ` : ""}{airport.city} · {airport.timezone}</option>)}</datalist></>;
}
