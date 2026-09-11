import { Check, ChevronDown, Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type CatalogPickerOption = {
  id: string;
  title: string;
  detail: string;
  searchText?: string;
};

type CatalogPickerProps = {
  label: string;
  value?: CatalogPickerOption;
  options: CatalogPickerOption[];
  emptyLabel: string;
  searchPlaceholder: string;
  otherLabel: string;
  onChoose: (id: string) => void;
  onOther: () => void;
  disabled?: boolean;
};

function visibleViewport() {
  const viewport = window.visualViewport;
  return { height: viewport?.height ?? window.innerHeight, top: viewport?.offsetTop ?? 0 };
}

export function CatalogPicker({ label, value, options, emptyLabel, searchPlaceholder, otherLabel, onChoose, onOther, disabled }: CatalogPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [mobile, setMobile] = useState(() => window.matchMedia("(max-width: 639px)").matches);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 420 });
  const [viewport, setViewport] = useState(visibleViewport);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return options.slice(0, 100);
    return options.filter((option) => `${option.title} ${option.detail} ${option.searchText ?? ""}`.toLocaleLowerCase().includes(normalized)).slice(0, 100);
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const media = window.matchMedia("(max-width: 639px)");
    const place = () => {
      const isMobile = media.matches;
      setMobile(isMobile);
      setViewport(visibleViewport());
      if (!isMobile && triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        const width = Math.min(Math.max(rect.width, 360), 480);
        setPosition({ top: Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - 472)), left: Math.min(Math.max(12, rect.left), window.innerWidth - width - 12), width });
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    const visual = window.visualViewport;
    const previousOverflow = document.body.style.overflow;
    place();
    if (media.matches) document.body.style.overflow = "hidden";
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    window.addEventListener("keydown", closeOnEscape);
    visual?.addEventListener("resize", place);
    visual?.addEventListener("scroll", place);
    const timer = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("keydown", closeOnEscape);
      visual?.removeEventListener("resize", place);
      visual?.removeEventListener("scroll", place);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const close = () => { setOpen(false); setQuery(""); window.setTimeout(() => triggerRef.current?.focus(), 0); };

  return <div className="relative">
    <button ref={triggerRef} type="button" disabled={disabled} onClick={() => setOpen(true)} className="form-input flex items-center gap-3 text-left" aria-label={label} aria-haspopup="dialog" aria-expanded={open}>
      <span className="min-w-0 flex-1"><strong className="block truncate text-sm">{value?.title ?? emptyLabel}</strong><span className="block truncate text-[.68rem] font-medium text-muted">{value?.detail ?? "Search the saved list or enter another value"}</span></span>
      <ChevronDown className="size-4 shrink-0 text-muted" />
    </button>
    {open && createPortal(<div className={`fixed inset-0 z-[125] flex ${mobile ? "items-start bg-brand/55" : "items-start bg-transparent"}`} onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section role="dialog" aria-modal="true" aria-label={label} className={`${mobile ? "sheet-enter fixed inset-x-2 rounded-[2rem]" : "fixed max-h-[28rem] rounded-2xl border border-line shadow-focus"} flex flex-col overflow-hidden bg-surface p-4`} style={mobile ? { top: viewport.top + 8, height: Math.max(120, viewport.height - 16), maxHeight: Math.max(120, viewport.height - 16) } : { top: position.top, left: position.left, width: position.width }}>
        <div className="flex items-center justify-between gap-3 px-1 pb-3"><div><p className="eyebrow">Saved travel data</p><h2 className="font-display text-lg font-black">{label}</h2></div><button type="button" className="tap-target grid size-10 place-items-center rounded-full border border-line" onClick={close} aria-label={`Close ${label}`}><X className="size-4" /></button></div>
        <label className="relative block"><span className="sr-only">Search {label.toLocaleLowerCase()}</span><Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" /><input ref={searchRef} role="combobox" aria-expanded="true" aria-controls={listId} aria-autocomplete="list" className="form-input mt-0 pl-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={searchPlaceholder} autoComplete="off" /></label>
        <div id={listId} role="listbox" className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-xl border border-line">
          {results.map((option) => { const active = option.id === value?.id; return <button key={option.id} type="button" role="option" aria-selected={active} onClick={() => { onChoose(option.id); close(); }} className={`flex min-h-16 w-full items-center gap-3 border-b border-line px-3 py-2 text-left last:border-0 hover:bg-brand-soft ${active ? "bg-brand-soft" : "bg-surface"}`}><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-elevated text-brand">{active ? <Check className="size-4" /> : <Search className="size-4" />}</span><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{option.title}</strong><span className="block text-[.68rem] leading-5 text-muted">{option.detail}</span></span></button>; })}
          {!results.length && <p className="p-5 text-center text-sm text-muted">No saved option matches that search.</p>}
          <button type="button" role="option" aria-selected={false} onClick={() => { onOther(); close(); }} className="flex min-h-16 w-full items-center gap-3 border-t border-line bg-elevated px-3 py-3 text-left text-brand"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-soft font-black">+</span><span><strong className="block text-sm">{otherLabel}</strong><span className="block text-[.68rem] text-muted">Enter it manually; an admin can review it later.</span></span></button>
        </div>
      </section>
    </div>, document.body)}
  </div>;
}
