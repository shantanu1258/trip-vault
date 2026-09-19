import type { JourneyLeg } from "./types";
import { WhatsAppIcon } from "../../components/WhatsAppIcon";
import { formatEventTime } from "../trips/presentation";
import { phoneActionUrls } from "../timeline/model";

export function stayDuration(start: string, end: string, timezone: string) {
  const localDay = (value: string) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "numeric",
      day: "numeric"
    }).formatToParts(new Date(value));
    const part = (name: string) => Number(parts.find((p) => p.type === name)?.value);
    return Date.UTC(part("year"), part("month") - 1, part("day"));
  };
  const nights = Math.max(0, Math.round((localDay(end) - localDay(start)) / 86400000));
  const days = nights + 1;
  return `${days} day${days === 1 ? "" : "s"} · ${nights} night${nights === 1 ? "" : "s"}`;
}

export function JourneyEssentials({
  leg,
  layout = "list"
}: {
  leg: JourneyLeg;
  layout?: "list" | "grid";
}) {
  const boarding =
    leg.boarding_at ??
    (leg.boarding_lead_minutes != null
      ? new Date(
          new Date(leg.scheduled_departure_at).getTime() - leg.boarding_lead_minutes * 60000
        ).toISOString()
      : null);
  const details = leg.details;
  const rows: [string, string | null | undefined][] = [
    ["Boarding", boarding ? formatEventTime(boarding, leg.origin_timezone) : null],
    ["Platform", leg.departure_platform],
    ["Arrival platform", leg.arrival_platform],
    ["Status", leg.status_note]
  ];
  if (details?.kind === "train")
    rows.push(
      ["Train", details.train_name],
      ["Class", details.travel_class],
      ["Board from", details.booked_from_name || details.booked_from_code],
      ["Ticket status", details.current_status || details.booking_status]
    );
  if (details?.kind === "bus")
    rows.push(
      ["Boarding point", details.boarding_point_details],
      ["Drop-off", details.dropoff_point_details],
      ["Bus", details.bus_class_or_layout]
    );
  if (details?.kind === "ferry")
    rows.push(
      ["Ticket", details.ticket_timing?.replaceAll("_", " ")],
      ["Gate", details.departure_gate],
      ["Vessel", details.vessel_name],
      ["Seating", details.seating],
      ["Accommodation", details.accommodation],
      ["Baggage", details.baggage_allowance],
      ["Operator reference", details.operator_reference]
    );
  if (details?.kind === "cab")
    rows.push(
      ["Pickup instructions", details.pickup_instructions],
      ["Driver", details.driver_name],
      [
        "Vehicle",
        [details.vehicle_class, details.vehicle_registration].filter(Boolean).join(" · ")
      ],
      ["Final drop-off", details.final_dropoff]
    );
  const populated = rows.filter((row): row is [string, string] => Boolean(row[1]));
  // Pair short facts, but keep long instructions full-width without empty grid cells.
  const fullWidth = populated.map(([, value]) => value.length > 65);
  let unpaired = -1;
  fullWidth.forEach((wide, index) => {
    if (wide) {
      if (unpaired >= 0) fullWidth[unpaired] = true;
      unpaired = -1;
    } else if (unpaired >= 0) unpaired = -1;
    else unpaired = index;
  });
  if (unpaired >= 0) fullWidth[unpaired] = true;
  const phone =
    details?.kind === "cab" && details.driver_phone ? phoneActionUrls(details.driver_phone) : null;
  if (!populated.length && !phone) return null;
  return (
    <div className={layout === "grid" ? "border-t border-line" : "mt-3 border-t border-line pt-2"}>
      <dl
        className={
          layout === "grid" ? "grid grid-cols-2 gap-px bg-line text-sm" : "space-y-1 text-sm"
        }
      >
        {populated.map(([label, value], index) => (
          <div
            key={label}
            className={
              layout === "grid"
                ? `min-w-0 bg-surface p-3 ${fullWidth[index] ? "col-span-2" : ""}`
                : "flex flex-wrap gap-x-2"
            }
          >
            <dt
              className={
                layout === "grid"
                  ? "text-xs font-bold uppercase tracking-[.1em] text-muted"
                  : "text-muted"
              }
            >
              {label}
            </dt>
            <dd className={`min-w-0 break-words font-semibold ${layout === "grid" ? "mt-1" : ""}`}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
      {phone && (
        <div
          className={`relative z-20 mt-2 flex flex-wrap gap-2 ${layout === "grid" ? "p-3" : ""}`}
        >
          <a className="secondary-button" href={phone.call}>
            Call driver
          </a>
          <a className="secondary-button" href={phone.whatsapp} target="_blank" rel="noreferrer">
            <WhatsAppIcon /> WhatsApp driver
          </a>
        </div>
      )}
    </div>
  );
}
