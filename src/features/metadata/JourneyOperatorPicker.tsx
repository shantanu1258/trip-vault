import { useMemo, useState } from "react";
import { CatalogPicker } from "../../components/CatalogPicker";
import starterOperators from "./starter-journey-operators.json";

type JourneyOperatorMode = "train" | "bus" | "ferry" | "cab";

export function JourneyOperatorPicker({ mode, name, required = false, defaultValue = "" }: { mode: JourneyOperatorMode; name: string; required?: boolean; defaultValue?: string }) {
  const options = useMemo(() => starterOperators.filter((option) => option.mode === mode), [mode]);
  const initialName = defaultValue || (mode === "train" ? "Indian Railways" : "");
  const [selectedName, setSelectedName] = useState(initialName);
  const [manual, setManual] = useState(Boolean(initialName) && !options.some((option) => option.name === initialName));
  const selected = options.find((option) => option.name === selectedName);
  const pickerOptions = options.map((option) => ({ id: option.name, title: option.name, detail: option.region, searchText: option.aliases }));

  return <div className="space-y-2">
    <CatalogPicker label={`Choose ${mode} operator`} value={!manual && selected ? { id: selected.name, title: selected.name, detail: selected.region } : undefined} options={pickerOptions} emptyLabel={`Select the ${mode} operator`} searchPlaceholder={`Search saved ${mode} operators`} otherLabel={`Other ${mode} operator`} onChoose={(id) => { setManual(false); setSelectedName(id); }} onOther={() => { setManual(true); setSelectedName(""); }} />
    {manual ? <input className="form-input" name={name} value={selectedName} onChange={(event) => setSelectedName(event.target.value)} placeholder={`Enter the ${mode} operator shown on the ticket`} required={required} /> : <input type="hidden" name={name} value={selectedName} />}
    <input type="hidden" name={`${name}Source`} value={manual ? "other" : "catalog"} />
  </div>;
}
