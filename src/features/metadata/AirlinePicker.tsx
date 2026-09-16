import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { CatalogPicker } from "../../components/CatalogPicker";
import { listAvailableAirlines } from "./publishedConfig";

export function AirlinePicker({
  name = "airlineName",
  defaultValue
}: {
  name?: string;
  defaultValue?: string;
}) {
  const query = useQuery({
    queryKey: ["available-airlines"],
    queryFn: listAvailableAirlines,
    staleTime: Infinity
  });
  const [selectedName, setSelectedName] = useState(defaultValue ?? "");
  const [manual, setManual] = useState(false);
  const options = query.data ?? [];
  const selected = options.find(
    (item) => item.name.toLocaleLowerCase() === selectedName.toLocaleLowerCase()
  );

  useEffect(() => {
    if (
      defaultValue &&
      query.isSuccess &&
      !options.some((item) => item.name.toLocaleLowerCase() === defaultValue.toLocaleLowerCase())
    )
      setManual(true);
  }, [defaultValue, options, query.isSuccess]);

  const pickerOptions = useMemo(
    () =>
      options.map((item) => ({
        id: item.stableKey,
        title: item.name,
        detail: [item.iataCode, item.icaoCode].filter(Boolean).join(" · ") || "Saved airline",
        searchText: `${item.iataCode ?? ""} ${item.icaoCode ?? ""}`
      })),
    [options]
  );

  if (manual)
    return (
      <div className="space-y-2">
        <input
          className="form-input"
          name={name}
          value={selectedName}
          onChange={(event) => setSelectedName(event.target.value)}
          placeholder="Enter the airline exactly as shown on the ticket"
          required
        />
        <input type="hidden" name={`${name}Source`} value="other" />
        <button
          type="button"
          className="text-xs font-extrabold text-brand"
          onClick={() => {
            setManual(false);
            setSelectedName("");
          }}
        >
          Choose from saved airlines instead
        </button>
      </div>
    );

  return (
    <>
      <input type="hidden" name={name} value={selected?.name ?? selectedName} />
      <input type="hidden" name={`${name}Source`} value="catalog" />
      <CatalogPicker
        label="Choose airline"
        value={
          selected
            ? {
                id: selected.stableKey,
                title: selected.name,
                detail:
                  [selected.iataCode, selected.icaoCode].filter(Boolean).join(" · ") ||
                  "Saved airline"
              }
            : undefined
        }
        options={pickerOptions}
        emptyLabel="Select the airline operating this flight"
        searchPlaceholder="Search airline name, IATA code, or ICAO code"
        otherLabel="Other airline"
        onChoose={(id) =>
          setSelectedName(options.find((item) => item.stableKey === id)?.name ?? "")
        }
        onOther={() => {
          setSelectedName("");
          setManual(true);
        }}
      />
    </>
  );
}
