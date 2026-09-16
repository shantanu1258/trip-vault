import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, MapPinned } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { CurrencySelect } from "../components/CurrencySelect";
import { RequiredMark } from "../components/RequiredMark";
import { createTrip } from "../features/trips/api";
import { getErrorMessage } from "../features/trips/presentation";
import { firstValidationMessage, tripFormSchema } from "../features/trips/validation";
import { useFormDraft } from "../lib/forms/useFormDraft";

export const CREATE_TRIP_DRAFT_KEY = "trip:new:v2";

export function dateInput(offsetDays: number, from = new Date()) {
  const date = new Date(from);
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function suggestedTripEndDate(startDate: string) {
  const [year, month, day] = startDate.split("-").map(Number);
  if (!year || !month || !day) return "";
  return dateInput(7, new Date(year, month - 1, day, 12));
}

export function CreateTripPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const startDateRef = useRef<HTMLInputElement>(null);
  const endDateRef = useRef<HTMLInputElement>(null);
  const endDateWasEdited = useRef(false);
  const draft = useFormDraft(CREATE_TRIP_DRAFT_KEY);
  const mutation = useMutation({
    mutationFn: createTrip,
    onSuccess: async (trip) => {
      draft.clearDraft();
      await queryClient.invalidateQueries({ queryKey: ["trips"] });
      navigate(`/trips/${trip.id}`, { replace: true });
    }
  });

  useEffect(() => {
    if (!startDateRef.current || !endDateRef.current) return;
    endDateWasEdited.current = endDateRef.current.value !== suggestedTripEndDate(startDateRef.current.value);
  }, []);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    const parsed = tripFormSchema.safeParse(Object.fromEntries(new FormData(event.currentTarget)));
    if (!parsed.success) { setMessage(firstValidationMessage(parsed.error)); return; }
    mutation.mutate(parsed.data);
  };

  const updateSuggestedEndDate = (startDate: string) => {
    if (endDateWasEdited.current || !endDateRef.current) return;
    endDateRef.current.value = suggestedTripEndDate(startDate);
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl page-enter">
        <Link className="tap-target inline-flex items-center gap-2 text-sm font-bold text-muted hover:text-ink" to="/trips"><ArrowLeft className="size-4" /> Trips</Link>
        <section className="surface-card mt-5 overflow-hidden">
          <div className="border-b border-line bg-brand p-6 text-surface sm:p-8">
            <span className="grid size-12 place-items-center rounded-2xl bg-surface/10"><MapPinned className="size-6" /></span>
            <p className="mt-6 text-xs font-bold uppercase tracking-[0.18em] text-surface/65">New trip</p>
            <h1 className="mt-2 font-display text-3xl font-black tracking-[-0.04em]">Where are you going?</h1>
            <p className="mt-2 text-sm text-surface/70">Start with the basics. You can add people, bookings, documents, and readiness tasks next.</p>
          </div>
          <form ref={draft.formRef} className="space-y-5 p-6 sm:p-8" onSubmit={submit}>
            <label className="form-label">Trip name<RequiredMark /><input className="form-input" name="title" placeholder="Give this trip a name everyone will recognize" autoFocus required /></label>
            <label className="form-label">Destination<RequiredMark /><input className="form-input" name="destination" placeholder="List the cities, regions, or countries on this trip" required /></label>
            <div className="grid gap-4 sm:grid-cols-2"><label className="form-label">Start date<RequiredMark /><input ref={startDateRef} className="form-input" name="startDate" type="date" defaultValue={dateInput(15)} onChange={(event) => updateSuggestedEndDate(event.currentTarget.value)} required /></label><label className="form-label">End date<RequiredMark /><input ref={endDateRef} className="form-input" name="endDate" type="date" defaultValue={dateInput(22)} onChange={() => { endDateWasEdited.current = true; }} required /></label></div>
            <input type="hidden" name="timezone" value={Intl.DateTimeFormat().resolvedOptions().timeZone} />
            <label className="form-label sm:max-w-64">Currency<RequiredMark /><CurrencySelect name="baseCurrency" defaultValue="INR" required /></label>
            <p className="-mt-2 text-xs leading-5 text-muted">Departure and arrival time zones are recorded on each journey, just as they appear on the ticket.</p>
            <p className="rounded-xl bg-elevated px-4 py-3 text-xs leading-5 text-muted">Your unfinished trip is saved on this device while you type, so you can safely switch apps and return later.</p>
            {(message || mutation.error) && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm font-bold text-danger">{message || getErrorMessage(mutation.error)}</p>}
            <button className="primary-button w-full" disabled={mutation.isPending} type="submit">{mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <MapPinned className="size-4" />} Create trip</button>
          </form>
        </section>
      </div>
    </AppShell>
  );
}
