import type { Booking, VaultDocument } from "./types";

const labels: Record<string, string> = {
  flight: "Flights",
  hotel: "Stays",
  visa: "Visas",
  passport: "Passports",
  insurance: "Insurance",
  activity: "Activities",
  restaurant: "Dining",
  ticket: "Tickets",
  receipt: "Receipts",
  other: "Other",
  bus: "Buses",
  ferry: "Ferries",
  cab: "Cabs",
  train: "Trains",
  transport: "Other transport"
};

/** Display-only refinement: never guess a transport mode from a filename. */
export function documentFilterCategory(document: VaultDocument, bookings: Booking[] = []) {
  if (document.category !== "transport") return document.category;
  const booking = bookings.find(
    (item) => item.id === document.booking_id && item.trip_id === document.trip_id
  );
  return booking && ["bus", "ferry", "cab", "train"].includes(booking.type)
    ? booking.type
    : "transport";
}

export function documentCategoryCounts(documents: VaultDocument[], bookings: Booking[] = []) {
  const counts = new Map<string, number>();
  for (const document of documents) {
    const key = documentFilterCategory(document, bookings);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts]
    .map(([key, count]) => ({ key, count, label: labels[key] ?? key.replaceAll("_", " ") }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
