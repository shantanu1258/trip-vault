import { supabase } from "../../lib/supabase/client";
import { localProfileId, networkWithCache } from "../sync/localSync";

export type EventDocumentReference = {
  id: string;
  itinerary_item_id: string;
  document_id: string;
};

type TravelerAccountReference = {
  id: string;
  traveler_id: string;
  user_id: string;
};

function client() {
  if (!supabase) throw new Error("Supabase is not connected.");
  return supabase;
}

/**
 * Resolves the traveler profiles represented by the signed-in account.
 * The dedicated cache keeps this usable when the trip was prepared offline.
 */
export async function listCurrentAccountTravelerIds(
  tripId: string,
  travelerIds: string[]
): Promise<string[]> {
  const actorId = await localProfileId();
  if (!actorId) return [];
  if (!travelerIds.length) return [];
  const rows = await networkWithCache<TravelerAccountReference>(
    `current-traveler-accounts:${tripId}`,
    async () => {
      const { data, error } = await client()
        .from("traveler_accounts")
        .select("traveler_id,user_id")
        .eq("user_id", actorId)
        .in("traveler_id", travelerIds);
      if (error) throw error;
      return (data ?? []).map((row) => ({
        ...row,
        id: `${row.traveler_id}:${row.user_id}`
      })) as TravelerAccountReference[];
    }
  );
  return rows.map((row) => row.traveler_id);
}

/** Fetches all event/document joins in one request instead of one request per event. */
export async function listTripEventDocumentReferences(
  tripId: string,
  itineraryItemIds: string[]
): Promise<EventDocumentReference[]> {
  const key = `trip-event-documents:${tripId}`;
  if (!itineraryItemIds.length)
    return networkWithCache<EventDocumentReference>(key, async () => []);

  return networkWithCache<EventDocumentReference>(key, async () => {
    const { data, error } = await client()
      .from("itinerary_item_documents")
      .select("itinerary_item_id,document_id")
      .in("itinerary_item_id", itineraryItemIds)
      .is("deleted_at", null);
    if (error) throw error;
    return (data ?? []).map((row) => ({
      ...row,
      id: `${row.itinerary_item_id}:${row.document_id}`
    })) as EventDocumentReference[];
  });
}
