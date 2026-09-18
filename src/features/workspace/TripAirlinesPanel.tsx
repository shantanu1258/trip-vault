import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plane, Save, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { validateActionUrl } from "../admin/validation";
import { listTripAirlines, updateTripAirline } from "./api";
import { airlineAccentStyle } from "./airlineAccent";
import type { TripAirline } from "./types";

export function TripAirlinesPanel({ tripId, canEdit }: { tripId: string; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<TripAirline | null>(null);
  const [accentPreview, setAccentPreview] = useState("#142f31");
  const [message, setMessage] = useState("");
  const editorRef = useRef<HTMLFormElement>(null);
  const query = useQuery({
    queryKey: ["trip-airlines", tripId],
    queryFn: () => listTripAirlines(tripId)
  });
  const mutation = useMutation({
    mutationFn: updateTripAirline,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["trip-airlines", tripId] });
      setMessage("");
      setEditing(null);
    }
  });

  useEffect(() => {
    if (!editing) return;
    editorRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [editing?.id]);

  const beginEditing = (airline: TripAirline) => {
    setMessage("");
    mutation.reset();
    setEditing(airline);
    setAccentPreview(airline.brand_color ?? "#142f31");
  };

  const closeEditor = () => {
    setMessage("");
    mutation.reset();
    setEditing(null);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing) return;
    setMessage("");
    const form = new FormData(event.currentTarget);
    const urls = ["checkIn", "manage", "status", "tracker"].map((name) =>
      String(form.get(name) ?? "").trim()
    );
    if (urls.some((url) => url && !validateActionUrl(url))) {
      setMessage("Action links must use HTTPS and only supported placeholders.");
      return;
    }
    mutation.mutate({
      ...editing,
      name: String(form.get("name") ?? "").trim(),
      iata_code:
        String(form.get("iata") ?? "")
          .trim()
          .toUpperCase() || null,
      icao_code:
        String(form.get("icao") ?? "")
          .trim()
          .toUpperCase() || null,
      check_in_url_template: urls[0] || null,
      manage_booking_url_template: urls[1] || null,
      status_url_template: urls[2] || null,
      tracker_url_template: urls[3] || null,
      brand_color: String(form.get("brandColor") ?? "") || null
    });
  };

  if (!query.data?.length) return null;
  return (
    <section className="surface-card p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="eyebrow">Airlines</p>
          <h2 className="mt-1 font-display text-xl font-black">Trip metadata</h2>
        </div>
        <Plane className="size-5 text-brand" />
      </div>
      <div className="mt-4 space-y-2">
        {query.data.map((airline) => {
          const content = (
            <>
              <span className="grid size-9 place-items-center rounded-xl bg-brand-soft text-xs font-black text-brand">
                {(airline.iata_code || airline.name.slice(0, 2)).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{airline.name}</span>
                <span className="block text-xs capitalize text-muted">
                  {airline.metadata_source.replace("_", " ")}
                </span>
              </span>
            </>
          );
          return canEdit ? (
            <button
              type="button"
              key={airline.id}
              onClick={() => beginEditing(airline)}
              style={airlineAccentStyle(airline.brand_color)}
              className="airline-accent-rail flex w-full items-center gap-3 rounded-xl bg-elevated p-3 pl-4 text-left transition hover:-translate-y-0.5 hover:shadow-soft focus-visible:ring-2 focus-visible:ring-brand"
              aria-label={`Edit ${airline.name}`}
              aria-expanded={editing?.id === airline.id}
              aria-controls={
                editing?.id === airline.id ? `airline-editor-${airline.id}` : undefined
              }
            >
              {content}
              <span className="text-xs font-extrabold text-brand">Edit</span>
            </button>
          ) : (
            <div
              key={airline.id}
              style={airlineAccentStyle(airline.brand_color)}
              className="airline-accent-rail flex items-center gap-3 rounded-xl bg-elevated p-3 pl-4"
            >
              {content}
            </div>
          );
        })}
      </div>
      {editing && (
        <form
          key={editing.id}
          ref={editorRef}
          id={`airline-editor-${editing.id}`}
          className="mt-4 scroll-mt-24 space-y-3 border-t border-line pt-4"
          onSubmit={submit}
        >
          <div className="flex items-center justify-between">
            <p className="font-bold">Edit airline snapshot</p>
            <button type="button" onClick={closeEditor} aria-label="Close airline editor">
              <X className="size-4" />
            </button>
          </div>
          <label className="form-label">
            Name
            <input className="form-input" name="name" defaultValue={editing.name} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="form-label">
              IATA
              <input
                className="form-input uppercase"
                name="iata"
                maxLength={2}
                defaultValue={editing.iata_code ?? ""}
              />
            </label>
            <label className="form-label">
              ICAO
              <input
                className="form-input uppercase"
                name="icao"
                maxLength={3}
                defaultValue={editing.icao_code ?? ""}
              />
            </label>
          </div>
          {[
            ["checkIn", "Check-in link", editing.check_in_url_template],
            ["manage", "Manage booking link", editing.manage_booking_url_template],
            ["status", "Flight status link", editing.status_url_template],
            ["tracker", "Tracker link", editing.tracker_url_template]
          ].map(([name, label, value]) => (
            <label className="form-label" key={name}>
              {label}
              <input
                className="form-input text-xs"
                name={String(name)}
                defaultValue={String(value ?? "")}
                placeholder="https://…/{flightNumber}"
              />
            </label>
          ))}
          <label className="form-label">
            Card accent
            <input
              className="h-12 w-full rounded-xl border border-line bg-surface p-1"
              type="color"
              name="brandColor"
              value={accentPreview}
              onChange={(event) => setAccentPreview(event.target.value)}
            />
          </label>
          <div
            data-testid="airline-accent-preview"
            style={airlineAccentStyle(accentPreview)}
            className="airline-accent-rail flex items-center gap-3 rounded-xl border border-line bg-elevated p-3 pl-4"
          >
            <span className="airline-accent-dot" aria-hidden="true" />
            <span>
              <strong className="block text-sm">Accent preview</strong>
              <span className="text-xs text-muted">Used as a rail and airline marker</span>
            </span>
          </div>
          {(message || mutation.error) && (
            <p role="alert" className="text-sm font-bold text-danger">
              {message || "Could not save airline metadata."}
            </p>
          )}
          <button className="primary-button w-full" disabled={mutation.isPending}>
            {mutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}{" "}
            Save airline
          </button>
        </form>
      )}
    </section>
  );
}
