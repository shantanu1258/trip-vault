import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { FlightSeatsEditor } from "../../components/FlightSeatsEditor";
import { getErrorMessage } from "../trips/presentation";
import { listFlightTravelers, setFlightTravelerDetails } from "./api";
import type { FlightLeg, Traveler } from "./types";

/** Seat-only shortcut; the full passenger editor still owns the other fields. */
export function QuickFlightSeats({
  tripId,
  flight,
  travelers
}: {
  tripId: string;
  flight: FlightLeg;
  travelers: Traveler[];
}) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState("");
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["flight-travelers", flight.id],
    queryFn: () => listFlightTravelers(flight.id),
    enabled: open
  });
  const mutation = useMutation({
    mutationFn: setFlightTravelerDetails,
    onSuccess: async () => {
      setSaved(
        navigator.onLine ? "Seat saved." : "Seat saved on this device. Will sync when online."
      );
      await queryClient.invalidateQueries({ queryKey: ["flight-travelers"] });
    }
  });
  return (
    <FlightSeatsEditor
      route={`${flight.departure_airport_code || flight.departure_airport_name} → ${flight.arrival_airport_code || flight.arrival_airport_name}`}
      travelers={travelers}
      seats={query.data ?? []}
      open={open}
      onOpenChange={setOpen}
      loading={query.isPending}
      refreshing={query.isFetching}
      loadError={Boolean(query.error)}
      onRetry={() => void query.refetch()}
      savingTravelerId={mutation.isPending ? mutation.variables?.travelerId : undefined}
      error={mutation.error ? getErrorMessage(mutation.error) : undefined}
      message={saved}
      onSave={(travelerId, seat) => {
        setSaved("");
        const row = query.data?.find((value) => value.traveler_id === travelerId);
        mutation.mutate({
          tripId,
          flightLegId: flight.id,
          travelerId,
          seat,
          boardingGroup: row?.boarding_group ?? "",
          ticketNumber: row?.ticket_number ?? ""
        });
      }}
    />
  );
}
