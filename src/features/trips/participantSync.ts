import { supabase } from "../../lib/supabase/client";
import { cacheEntityList, queueRpc, readEntityList } from "../sync/localSync";
import type { Booking, BookingTraveler } from "../workspace/types";
import { normalizeParticipantSelection } from "./participantScope";
import type { ItineraryItem, ParticipantScope } from "./types";

export type BookingParticipantSyncInput = {
  bookingId: string;
  participantScope: ParticipantScope;
  travelerIds: string[];
  itineraryItemId?: string;
  itineraryVersion?: number;
};

export type BookingParticipantSyncResult = {
  booking: Booking;
  itinerary_items: ItineraryItem[];
};

export function bookingParticipantSyncArgs(input: BookingParticipantSyncInput) {
  const participants = normalizeParticipantSelection(input.participantScope, input.travelerIds);
  return {
    requested_booking_id: input.bookingId,
    requested_scope: participants.participantScope,
    requested_traveler_ids: participants.travelerIds,
    requested_itinerary_item_id: input.itineraryItemId ?? null,
    requested_itinerary_version: input.itineraryVersion ?? null
  };
}

export async function syncBookingParticipants(input: BookingParticipantSyncInput): Promise<BookingParticipantSyncResult> {
  if (!supabase) throw new Error("Supabase is not connected.");
  const { data, error } = await supabase.rpc("sync_booking_participants", bookingParticipantSyncArgs(input));
  if (error) throw error;
  if (!data || typeof data !== "object") throw new Error("Supabase did not return the synchronized booking participants.");
  return data as unknown as BookingParticipantSyncResult;
}

export async function queueBookingParticipantSync(input: BookingParticipantSyncInput, dependsOn: string[] = []) {
  return queueRpc({
    entityType: "booking-participant-sync",
    entityId: input.bookingId,
    functionName: "sync_booking_participants",
    args: bookingParticipantSyncArgs(input),
    dependsOn
  });
}

export async function cacheParticipantAssignments(input: {
  tripId: string;
  bookingId: string;
  itineraryItemIds: string[];
  participantScope: ParticipantScope;
  travelerIds: string[];
}) {
  const participants = normalizeParticipantSelection(input.participantScope, input.travelerIds);
  const [bookingRows, itineraryRows] = await Promise.all([
    readEntityList<BookingTraveler>(`booking-travelers:${input.tripId}`),
    readEntityList<{ id: string; itinerary_item_id: string; traveler_id: string }>(`itinerary-participants:${input.tripId}`)
  ]);
  const itineraryIds = new Set(input.itineraryItemIds);
  await Promise.all([
    cacheEntityList(`booking-travelers:${input.tripId}`, [
      ...bookingRows.filter((row) => row.booking_id !== input.bookingId),
      ...participants.travelerIds.map((travelerId) => ({ id: `${input.bookingId}:${travelerId}`, booking_id: input.bookingId, traveler_id: travelerId }))
    ]),
    cacheEntityList(`itinerary-participants:${input.tripId}`, [
      ...itineraryRows.filter((row) => !itineraryIds.has(row.itinerary_item_id)),
      ...input.itineraryItemIds.flatMap((itineraryItemId) => participants.travelerIds.map((travelerId) => ({ id: `${itineraryItemId}:${travelerId}`, itinerary_item_id: itineraryItemId, traveler_id: travelerId })))
    ])
  ]);
}
