import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { CatalogPicker } from "../../components/CatalogPicker";
import { TimeZoneAutocomplete } from "../../components/TimeZoneAutocomplete";
import { RequiredMark } from "../../components/RequiredMark";
import { listAvailableAirports, type AvailableAirport } from "./publishedConfig";

type AirportPickerProps = {
  name: string;
  codeName: string;
  timezoneName: string;
  countryName: string;
  label: "From airport" | "To airport";
  defaultTimezone: string;
  countryFilter?: string;
  showManualTimezone?: boolean;
  onCountryChange?: (countryCode: string) => void;
  initialAirport?: AvailableAirport | null;
  onAirportChange?: (airport: AvailableAirport | null) => void;
};

export function AirportPicker({
  name,
  codeName,
  timezoneName,
  countryName,
  label,
  defaultTimezone,
  countryFilter,
  showManualTimezone = true,
  onCountryChange,
  initialAirport,
  onAirportChange
}: AirportPickerProps) {
  const query = useQuery({
    queryKey: ["available-airports"],
    queryFn: listAvailableAirports,
    staleTime: Infinity
  });
  const [selected, setSelected] = useState<AvailableAirport | null>(null);
  const [manual, setManual] = useState(false);
  const [manualCountry, setManualCountry] = useState(countryFilter ?? "");
  const allOptions = query.data ?? [];
  const normalizedCountryFilter = countryFilter?.trim().toUpperCase();
  const options = normalizedCountryFilter
    ? allOptions.filter((airport) => airport.countryCode.toUpperCase() === normalizedCountryFilter)
    : allOptions;
  const pickerOptions = useMemo(
    () =>
      options.map((airport) => ({
        id: `${airport.sourceVersion}:${airport.stableKey}`,
        title: `${airport.iataCode ?? airport.icaoCode ?? "—"} · ${airport.name}`,
        detail: `${airport.city} · ${airport.countryCode} · ${airport.timezone}`,
        searchText: `${airport.iataCode ?? ""} ${airport.icaoCode ?? ""} ${airport.city} ${airport.countryCode}`
      })),
    [options]
  );
  const direction = label === "From airport" ? "From" : "To";

  useEffect(() => {
    if (
      selected &&
      normalizedCountryFilter &&
      selected.countryCode.toUpperCase() !== normalizedCountryFilter
    )
      setSelected(null);
  }, [normalizedCountryFilter, selected]);

  useEffect(() => {
    if (normalizedCountryFilter) setManualCountry(normalizedCountryFilter);
  }, [normalizedCountryFilter]);

  useEffect(() => {
    if (initialAirport === undefined) return;
    if (!initialAirport) {
      setSelected(null);
      setManual(false);
      setManualCountry(normalizedCountryFilter ?? "");
      onCountryChange?.(normalizedCountryFilter ?? "");
      return;
    }
    setSelected(initialAirport);
    setManual(false);
    setManualCountry(initialAirport.countryCode);
    onCountryChange?.(initialAirport.countryCode);
  }, [initialAirport, normalizedCountryFilter, onCountryChange]);

  if (manual)
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="form-label sm:col-span-2">
          {label}
          <RequiredMark />
          <input
            className="form-input"
            name={name}
            placeholder="Enter the full airport name printed on the ticket"
            required
          />
        </label>
        <label className="form-label">
          {direction} airport code
          <RequiredMark />
          <input
            key="manual-airport-code"
            className="form-input uppercase"
            name={codeName}
            maxLength={3}
            placeholder="Enter the 3-letter IATA code"
            required
          />
        </label>
        {normalizedCountryFilter ? (
          <input type="hidden" name={countryName} value={normalizedCountryFilter} />
        ) : (
          <label className="form-label">
            {direction} country code
            <RequiredMark />
            <input
              className="form-input uppercase"
              name={countryName}
              maxLength={2}
              value={manualCountry}
              onChange={(event) => {
                const next = event.target.value.toUpperCase();
                setManualCountry(next);
                onCountryChange?.(next);
              }}
              placeholder="Enter the 2-letter country code"
              required
            />
          </label>
        )}
        {showManualTimezone ? (
          <label className="form-label sm:col-span-2">
            {direction} airport time zone
            <RequiredMark />
            <TimeZoneAutocomplete name={timezoneName} requireSelection required />
          </label>
        ) : (
          <input type="hidden" name={timezoneName} value={defaultTimezone} />
        )}
        <input type="hidden" name={`${name}Source`} value="other" />
        <button
          type="button"
          className="text-left text-xs font-extrabold text-brand sm:col-span-2"
          onClick={() => {
            setManual(false);
            setManualCountry(normalizedCountryFilter ?? "");
            onCountryChange?.(normalizedCountryFilter ?? "");
          }}
        >
          Choose from saved airports instead
        </button>
      </div>
    );

  return (
    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
      <label className="form-label">
        {label}
        <RequiredMark />
        <CatalogPicker
          label={`Choose ${label.toLocaleLowerCase()}`}
          value={
            selected
              ? {
                  id: `${selected.sourceVersion}:${selected.stableKey}`,
                  title: `${selected.iataCode ?? selected.icaoCode ?? "—"} · ${selected.name}`,
                  detail: `${selected.city} · ${selected.countryCode} · ${selected.timezone}`
                }
              : undefined
          }
          options={pickerOptions}
          emptyLabel={`Search ${direction.toLocaleLowerCase()} airport name or code`}
          searchPlaceholder="Search airport name, city, or IATA code"
          otherLabel={`Other ${direction.toLocaleLowerCase()} airport`}
          onChoose={(id) => {
            const airport =
              options.find(
                (candidate) => `${candidate.sourceVersion}:${candidate.stableKey}` === id
              ) ?? null;
            setSelected(airport);
            setManual(false);
            onCountryChange?.(airport?.countryCode ?? "");
            onAirportChange?.(airport);
          }}
          onOther={() => {
            setSelected(null);
            setManual(true);
            setManualCountry(normalizedCountryFilter ?? "");
            onCountryChange?.(normalizedCountryFilter ?? "");
            onAirportChange?.(null);
          }}
        />
      </label>
      <label className="form-label">
        {direction} airport code
        <input
          key="derived-airport-code"
          className="form-input uppercase opacity-70"
          value={selected?.iataCode ?? selected?.icaoCode ?? "Derived after selection"}
          disabled
          aria-label={`${direction} airport code`}
        />
      </label>
      <input type="hidden" name={name} value={selected?.name ?? ""} />
      <input type="hidden" name={codeName} value={selected?.iataCode ?? selected?.icaoCode ?? ""} />
      <input type="hidden" name={countryName} value={selected?.countryCode ?? ""} />
      <input type="hidden" name={timezoneName} value={selected?.timezone ?? ""} />
      <input type="hidden" name={`${name}Source`} value="catalog" />
    </div>
  );
}
