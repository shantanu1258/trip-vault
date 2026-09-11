import { useQuery } from "@tanstack/react-query";
import { useId } from "react";
import { listAvailableVendors } from "./publishedConfig";

export function VendorPicker({ name = "bookedViaName", placeholder = "Booking.com or booked directly", defaultValue }: { name?: string; placeholder?: string; defaultValue?: string }) {
  const listId = useId();
  const query = useQuery({ queryKey: ["available-vendors"], queryFn: listAvailableVendors, staleTime: Infinity });
  return <><input className="form-input" name={name} list={listId} placeholder={placeholder} defaultValue={defaultValue} /><datalist id={listId}>{query.data?.map((vendor) => <option key={`${vendor.sourceVersion}:${vendor.stableKey}`} value={vendor.name}>{vendor.websiteUrl ?? "Saved booking source"}</option>)}</datalist></>;
}
