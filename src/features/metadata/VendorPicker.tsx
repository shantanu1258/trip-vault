import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { CatalogPicker } from "../../components/CatalogPicker";
import { listAvailableVendors } from "./publishedConfig";

export function VendorPicker({ name = "bookedViaName", defaultValue, onWebsite }: { name?: string; defaultValue?: string; onWebsite?: (url: string) => void }) {
  const query = useQuery({ queryKey: ["available-vendors"], queryFn: listAvailableVendors, staleTime: Infinity });
  const [selectedName, setSelectedName] = useState(defaultValue ?? "");
  const [manual, setManual] = useState(false);
  const options = query.data ?? [];
  const selected = options.find((item) => item.name.toLocaleLowerCase() === selectedName.toLocaleLowerCase());
  const pickerOptions = useMemo(() => options.map((item) => ({ id: item.stableKey, title: item.name, detail: item.websiteUrl ?? "Saved booking source", searchText: item.websiteUrl ?? "" })), [options]);

  useEffect(() => {
    if (defaultValue && query.isSuccess && !options.some((item) => item.name.toLocaleLowerCase() === defaultValue.toLocaleLowerCase())) setManual(true);
  }, [defaultValue, options, query.isSuccess]);

  if (manual) return <div className="space-y-2"><input className="form-input" name={name} value={selectedName} onChange={(event) => setSelectedName(event.target.value)} placeholder="Enter the website, agent, or business that sold the booking" /><input type="hidden" name={`${name}Source`} value="other" /><button type="button" className="text-xs font-extrabold text-brand" onClick={() => { setManual(false); setSelectedName(""); }}>Choose from saved booking sources instead</button></div>;

  return <><input type="hidden" name={name} value={selected?.name ?? selectedName} /><input type="hidden" name={`${name}Source`} value="catalog" /><CatalogPicker label="Choose booked via" value={selected ? { id: selected.stableKey, title: selected.name, detail: selected.websiteUrl ?? "Saved booking source" } : undefined} options={pickerOptions} emptyLabel="Select where this booking was purchased" searchPlaceholder="Search booking website, seller, or travel agent" otherLabel="Other booking source" onChoose={(id) => { const vendor = options.find((item) => item.stableKey === id); setSelectedName(vendor?.name ?? ""); if (vendor?.websiteUrl) onWebsite?.(vendor.websiteUrl); }} onOther={() => { setSelectedName(""); setManual(true); }} /></>;
}
