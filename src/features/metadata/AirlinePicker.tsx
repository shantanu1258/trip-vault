import { useQuery } from "@tanstack/react-query";
import { useId } from "react";
import { listAvailableAirlines } from "./publishedConfig";

export function AirlinePicker({ name = "airlineName", defaultValue }: { name?: string; defaultValue?: string }) {
  const listId = useId();
  const query = useQuery({ queryKey: ["available-airlines"], queryFn: listAvailableAirlines, staleTime: Infinity });
  return <><input className="form-input" name={name} list={listId} placeholder="Singapore Airlines" defaultValue={defaultValue} /><datalist id={listId}>{query.data?.map((airline) => <option key={`${airline.sourceVersion}:${airline.stableKey}`} value={airline.name}>{airline.iataCode}</option>)}</datalist></>;
}
