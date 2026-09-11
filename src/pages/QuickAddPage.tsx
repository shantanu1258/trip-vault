import { useQuery } from "@tanstack/react-query";
import { CalendarPlus, FileUp, MapPinned, NotebookPen, ReceiptIndianRupee, TicketCheck, UserPlus } from "lucide-react";
import { Link } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { ErrorCard, LoadingCard, PageHeader } from "../components/TripUi";
import { listTrips } from "../features/trips/api";
import { sortTripsByRelevance } from "../features/trips/presentation";

export function QuickAddPage() {
  const query = useQuery({ queryKey: ["trips"], queryFn: () => listTrips() });
  const trip = sortTripsByRelevance(query.data ?? [])[0];
  const actions = [
    { title: "Create a trip", text: "Dates, destination, and currency", icon: MapPinned, to: "/trips/new", enabled: true },
    { title: "Itinerary event", text: trip ? `Add to ${trip.title}` : "Create a trip first", icon: CalendarPlus, to: trip ? `/trips/${trip.id}?add=itinerary` : "/trips/new", enabled: true },
    { title: "Trip cost", text: trip ? `Track the total for ${trip.title}` : "Create a trip first", icon: ReceiptIndianRupee, to: trip ? `/trips/${trip.id}?add=cost` : "/trips/new", enabled: true },
    { title: "Booking or flight", text: trip ? "Add structured reservation details" : "Create a trip first", icon: TicketCheck, to: trip ? `/trips/${trip.id}?add=booking` : "/trips/new", enabled: true },
    { title: "Travel document", text: trip ? "Upload a PDF or image smaller than 5 MB" : "Create a trip first", icon: FileUp, to: trip ? `/trips/${trip.id}?add=document` : "/trips/new", enabled: true },
    { title: "Trip note", text: trip ? "Keep a useful detail with the trip" : "Create a trip first", icon: NotebookPen, to: trip ? `/trips/${trip.id}?add=note` : "/trips/new", enabled: true },
    { title: "Join a trip", text: "Use your private one-time code", icon: UserPlus, to: "/join", enabled: true }
  ];

  return (
    <AppShell><div className="mx-auto max-w-4xl"><PageHeader eyebrow="Quick add" title="What do you want to add?" text={trip ? `New items will default to ${trip.title}. You can choose another trip from Trips.` : "Start with a trip or join one shared with you."} />{query.isLoading && <LoadingCard label="Preparing actions" />}{query.error && <ErrorCard error={query.error} />}{!query.isLoading && <div className="mt-7 grid gap-4 sm:grid-cols-2">{actions.map(({ title, text, icon: Icon, to }) => <Link key={title} to={to} className="surface-card group page-enter flex min-h-40 flex-col justify-between p-5 transition-transform duration-200 hover:-translate-y-1 hover:shadow-focus motion-reduce:hover:translate-y-0"><span className="grid size-12 place-items-center rounded-2xl bg-brand-soft text-brand"><Icon className="size-5" /></span><div className="mt-6"><h2 className="font-display text-xl font-black">{title}</h2><p className="mt-1 text-sm text-muted">{text}</p></div></Link>)}</div>}</div></AppShell>
  );
}
