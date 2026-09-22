import { BedDouble, CalendarDays, Clock3, MapPin, Plane } from "lucide-react";
import { EventSilhouette } from "./EventSilhouette";

const samples = [
  {
    type: "flight" as const,
    status: "Scheduled",
    eyebrow: "Flight · Aster Air AV 218",
    title: "DEL → FCO",
    detail: "12 Jun · 06:40 departure",
    note: "Terminal 3 · Gate 22B",
    icon: Plane,
    detailIcon: Clock3
  },
  {
    type: "hotel_check_in" as const,
    status: "Confirmed",
    eyebrow: "Stay · Rome",
    title: "Casa Verde Hotel",
    detail: "12–15 Jun · Check-in 14:00",
    note: "3 nights · 2 rooms",
    icon: BedDouble,
    detailIcon: CalendarDays
  },
  {
    type: "activity" as const,
    status: "Booked",
    eyebrow: "Activity · Rome",
    title: "A morning at the Colosseum",
    detail: "13 Jun · 09:30 entry",
    note: "Tickets and plans, together",
    icon: MapPin,
    detailIcon: Clock3
  }
];

/** Fictional examples using the same surfaces and motion as booking details. */
export function WelcomeBookingPreview() {
  return (
    <section aria-label="Sample booking previews" className="mx-auto w-full min-w-0 max-w-lg">
      <p className="eyebrow mb-3">A glimpse inside · Sample bookings</p>
      <div className="grid gap-3">
        {samples.map(
          ({ type, status, eyebrow, title, detail, note, icon: Icon, detailIcon: DetailIcon }) => (
            <article
              key={type}
              className={`event-hero event-type-icon--${type === "hotel_check_in" ? "hotel" : type} overflow-hidden rounded-xl border border-line p-4 text-white shadow-soft`}
            >
              <EventSilhouette type={type} placement="hero" />
              <div className="flex items-center justify-between gap-3">
                <span className="rounded-full bg-white/10 px-2.5 py-1 text-[.65rem] font-black uppercase tracking-[.14em]">
                  {status}
                </span>
                <Icon className="size-5 shrink-0" aria-hidden="true" />
              </div>
              <p className="mt-2 text-xs font-bold text-white/85">{eyebrow}</p>
              <h2 className="mt-1 break-words font-display text-xl font-black tracking-tight sm:text-2xl">
                {title}
              </h2>
              <p className="mt-3 flex items-center gap-2 text-sm font-bold">
                <DetailIcon className="size-4 shrink-0" aria-hidden="true" />
                {detail}
              </p>
              <p className="mt-1 text-xs text-white/85">{note}</p>
            </article>
          )
        )}
      </div>
    </section>
  );
}
