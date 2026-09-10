import { useQuery } from "@tanstack/react-query";
import { listAvailableAirlines } from "./publishedConfig";

export function AirlinePicker() {
  const query = useQuery({ queryKey: ["available-airlines"], queryFn: listAvailableAirlines, staleTime: Infinity });
  return <><input className="form-input" name="airlineName" list="airlines" placeholder="Singapore Airlines" /><datalist id="airlines">{query.data?.map((airline) => <option key={`${airline.sourceVersion}:${airline.stableKey}`} value={airline.name}>{airline.iataCode}</option>)}</datalist></>;
}
