import { Check, ChevronDown, Clock3, Globe2, Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const commonTimeZones = [
  "UTC", "Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Asia/Tokyo",
  "Europe/London", "Europe/Paris", "Europe/Rome", "America/New_York",
  "America/Chicago", "America/Denver", "America/Los_Angeles", "Australia/Sydney"
];

function isSupportedTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function supportedTimeZones() {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: "timeZone") => string[] };
  const available = intl.supportedValuesOf?.("timeZone") ?? commonTimeZones;
  return [...new Set([...commonTimeZones, ...available])].filter(isSupportedTimeZone).sort((a, b) => a.localeCompare(b));
}

const allTimeZones = supportedTimeZones();

function readablePart(value: string) {
  return value.replaceAll("_", " ");
}

function zoneDetails(timeZone: string) {
  if (timeZone === "UTC") return { city: "Universal time", region: "Global", offset: "UTC", localTime: new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone }).format(new Date()) };
  const parts = timeZone.split("/");
  const city = readablePart(parts.at(-1) ?? timeZone);
  const region = parts.slice(0, -1).map(readablePart).join(" · ");
  const offset = new Intl.DateTimeFormat("en", { timeZone, timeZoneName: "shortOffset" }).formatToParts(new Date()).find((part) => part.type === "timeZoneName")?.value.replace("GMT", "UTC") ?? "UTC";
  const localTime = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone }).format(new Date());
  return { city, region, offset, localTime };
}

type TimeZoneAutocompleteProps = {
  name: string;
  defaultValue?: string;
  className?: string;
  required?: boolean;
  disabled?: boolean;
  "aria-label"?: string;
};

export function TimeZoneAutocomplete({ name, defaultValue, className = "form-input", required, disabled, "aria-label": ariaLabel }: TimeZoneAutocompleteProps) {
  const deviceTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const initialValue = defaultValue && isSupportedTimeZone(defaultValue) ? defaultValue : deviceTimeZone;
  const [selected, setSelected] = useState(initialValue);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(() => window.matchMedia("(max-width: 639px)").matches);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 420 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const options = useMemo(() => {
    const available = allTimeZones.includes(selected) ? allTimeZones : [selected, ...allTimeZones];
    const normalized = query.trim().toLocaleLowerCase();
    const matches = available.filter((timeZone) => {
      if (!normalized) return true;
      const details = zoneDetails(timeZone);
      return `${timeZone} ${details.city} ${details.region} ${details.offset}`.toLocaleLowerCase().includes(normalized);
    });
    if (!normalized) {
      const preferred = [...new Set([selected, deviceTimeZone, ...commonTimeZones])];
      matches.sort((a, b) => {
        const aIndex = preferred.indexOf(a); const bIndex = preferred.indexOf(b);
        if (aIndex >= 0 || bIndex >= 0) return (aIndex < 0 ? 999 : aIndex) - (bIndex < 0 ? 999 : bIndex);
        return a.localeCompare(b);
      });
    }
    return matches.slice(0, 100);
  }, [deviceTimeZone, query, selected]);

  useEffect(() => {
    const syncDraftValue = () => {
      const restored = inputRef.current?.value;
      if (restored && isSupportedTimeZone(restored)) setSelected(restored);
    };
    const timer = window.setTimeout(syncDraftValue, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!open) return;
    const media = window.matchMedia("(max-width: 639px)");
    const place = () => {
      const isMobile = media.matches;
      setMobile(isMobile);
      if (!isMobile && triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        const width = Math.min(Math.max(rect.width, 360), 480);
        setPosition({ top: Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - 472)), left: Math.min(Math.max(12, rect.left), window.innerWidth - width - 12), width });
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    place();
    const previousOverflow = document.body.style.overflow;
    if (media.matches) document.body.style.overflow = "hidden";
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    window.addEventListener("keydown", closeOnEscape);
    const timer = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const choose = (timeZone: string) => {
    setSelected(timeZone);
    if (inputRef.current) {
      inputRef.current.value = timeZone;
      inputRef.current.dispatchEvent(new Event("input", { bubbles: true }));
      inputRef.current.dispatchEvent(new Event("change", { bubbles: true }));
    }
    setOpen(false);
    setQuery("");
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  };

  const show = () => {
    const restored = inputRef.current?.value;
    if (restored && restored !== selected && isSupportedTimeZone(restored)) setSelected(restored);
    setQuery("");
    setOpen(true);
  };

  const selectedDetails = zoneDetails(selected);

  return (
    <div className="relative">
      <input ref={inputRef} type="hidden" name={name} value={selected} readOnly required={required} onInput={(event) => { const value = event.currentTarget.value; if (isSupportedTimeZone(value)) setSelected(value); }} />
      <button ref={triggerRef} type="button" disabled={disabled} onClick={show} className={`${className} flex items-center gap-3 text-left`} aria-label={ariaLabel} aria-haspopup="dialog" aria-expanded={open}>
        <Globe2 className="size-4 shrink-0 text-brand" />
        <span className="min-w-0 flex-1"><strong className="block truncate text-sm">{selectedDetails.city}</strong><span className="block truncate text-[.68rem] font-medium text-muted">{selected} · {selectedDetails.offset}</span></span>
        <ChevronDown className="size-4 shrink-0 text-muted" />
      </button>
      {open && createPortal(
        <div className={`fixed inset-0 z-[120] flex ${mobile ? "items-end bg-brand/55" : "items-start bg-transparent"}`} onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-label="Choose time zone" className={`${mobile ? "sheet-enter max-h-[88dvh] w-full rounded-t-[2rem]" : "fixed max-h-[28rem] rounded-2xl border border-line shadow-focus"} flex flex-col overflow-hidden bg-surface p-4`} style={mobile ? undefined : { top: position.top, left: position.left, width: position.width }}>
            <div className="flex items-center justify-between gap-3 px-1 pb-3">
              <div><p className="eyebrow">Local clock</p><h2 className="font-display text-lg font-black">Choose time zone</h2></div>
              <button type="button" className="tap-target grid size-10 place-items-center rounded-full border border-line" onClick={() => setOpen(false)} aria-label="Close time zone picker"><X className="size-4" /></button>
            </div>
            <label className="relative block">
              <span className="sr-only">Search city or time zone</span>
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <input ref={searchRef} role="combobox" aria-expanded="true" aria-controls={listId} aria-autocomplete="list" className="form-input mt-0 pl-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search city, region, UTC offset…" autoComplete="off" />
            </label>
            <div id={listId} role="listbox" className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-xl border border-line">
              {options.map((timeZone) => {
                const details = zoneDetails(timeZone);
                const active = timeZone === selected;
                return <button type="button" role="option" aria-selected={active} key={timeZone} onClick={() => choose(timeZone)} className={`flex min-h-16 w-full items-center gap-3 border-b border-line px-3 py-2 text-left last:border-0 hover:bg-brand-soft ${active ? "bg-brand-soft" : "bg-surface"}`}>
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-elevated text-brand">{active ? <Check className="size-4" /> : <Clock3 className="size-4" />}</span>
                  <span className="min-w-0 flex-1"><strong className="block truncate text-sm">{details.city}</strong><span className="block truncate text-[.68rem] text-muted">{details.region} · {timeZone}</span></span>
                  <span className="shrink-0 text-right"><strong className="block text-xs">{details.offset}</strong><span className="block text-[.65rem] text-muted">{details.localTime}</span></span>
                </button>;
              })}
              {!options.length && <p className="p-6 text-center text-sm text-muted">No supported time zone matches that search.</p>}
            </div>
            <p className="px-1 pt-3 text-[.68rem] leading-5 text-muted">Times are stored using the selected IANA zone so daylight-saving changes remain correct.</p>
          </section>
        </div>,
        document.body
      )}
    </div>
  );
}
